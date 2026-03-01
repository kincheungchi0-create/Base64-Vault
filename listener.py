import os
import sys
import time
import base64
import requests
import json
import re
from datetime import datetime

SUPABASE_URL = "https://fkzsmtlryhvccivhdapu.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrenNtdGxyeWh2Y2NpdmhkYXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzM5MzAsImV4cCI6MjA4MjQwOTkzMH0.0_liolRCK4YVuBGxtaYZXiB59Rx-bZCTsea2T_Mp5lM"

DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
CHUNK_FETCH_BATCH = 10
STALE_CHUNK_MINUTES = 5

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Separate headers: read-only vs write
READ_HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
}

WRITE_HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

_WS_TABLE = str.maketrans('', '', ' \t\n\r\x0b\x0c')


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def unique_filepath(path):
    """Return a path that doesn't collide with existing files."""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    counter = 1
    while True:
        candidate = f"{base}_{counter}{ext}"
        if not os.path.exists(candidate):
            return candidate
        counter += 1


# ---- Single entry processing ----

def process_entry(entry):
    entry_id = entry['id']
    filename = entry['filename']
    content = entry['content']

    url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{entry_id}"
    res = requests.patch(url, headers=WRITE_HEADERS, json={"processed": True})
    if res.status_code not in [200, 201, 204]:
        return

    log(f"Processing: {filename} (ID: {entry_id})")

    try:
        if "," in content[:200]:
            content = content.split(",", 1)[1]

        file_data = base64.b64decode(content)
        file_path = unique_filepath(os.path.join(DOWNLOAD_DIR, filename))

        with open(file_path, "wb") as f:
            f.write(file_data)

        log(f"   Saved to: {file_path}")

    except Exception as e:
        log(f"   Error: {e}")


# ---- Chunk group assembly ----

def process_chunk_group(group_id, group_info):
    filename = group_info['filename']
    total = group_info['total']
    ext = group_info['ext']
    ids = group_info['ids']

    log(f"Assembling: {filename} ({total} chunks, group={group_id})")

    # Claim chunks first so no other process touches them
    for eid in ids:
        url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{eid}"
        requests.patch(url, headers=WRITE_HEADERS, json={"processed": True})

    try:
        all_chunks = []
        for batch_start in range(0, len(ids), CHUNK_FETCH_BATCH):
            batch_ids = ids[batch_start:batch_start + CHUNK_FETCH_BATCH]
            ids_str = ','.join(str(i) for i in batch_ids)
            url = (f"{SUPABASE_URL}/rest/v1/base64_entries"
                   f"?id=in.({ids_str})"
                   f"&select=content,file_type")
            res = requests.get(url, headers=READ_HEADERS, timeout=120)
            if res.status_code != 200:
                log(f"   Fetch error: {res.status_code}")
                raise Exception(f"Fetch failed: {res.status_code}")
            all_chunks.extend(res.json())
            fetched = min(batch_start + CHUNK_FETCH_BATCH, len(ids))
            log(f"   Fetched {fetched}/{total} chunks")

        if len(all_chunks) != total:
            raise Exception(f"Got {len(all_chunks)}/{total} chunks")

        all_chunks.sort(key=lambda c: int(c['file_type'].split(':')[2]))
        combined = ''.join(c['content'] for c in all_chunks)
        del all_chunks

        prefix = combined[:200]
        if ';base64,' in prefix:
            combined = combined.split(';base64,', 1)[1]
        combined = combined.translate(_WS_TABLE)
        combined = re.sub(r'-----(?:BEGIN|END)[^-]*-----', '', combined)

        file_data = base64.b64decode(combined)
        del combined

        file_path = unique_filepath(os.path.join(DOWNLOAD_DIR, filename))
        with open(file_path, 'wb') as f:
            f.write(file_data)
        size_mb = len(file_data) / (1024 * 1024)
        log(f"   Saved: {file_path} ({size_mb:.1f} MB)")

        # Delete chunk rows, insert metadata
        for eid in ids:
            url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{eid}"
            requests.delete(url, headers=WRITE_HEADERS)

        requests.post(
            f"{SUPABASE_URL}/rest/v1/base64_entries",
            headers=WRITE_HEADERS,
            json={
                "filename": filename,
                "content": f"[Assembled from {total} chunks]",
                "file_type": ext,
                "processed": True
            },
            timeout=10
        )
        log(f"   Done: {filename}")

    except Exception as e:
        log(f"   Assembly error: {e}")
        # Reset chunks for retry
        for eid in ids:
            url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{eid}"
            requests.patch(url, headers=WRITE_HEADERS, json={"processed": False})


# ---- Startup recovery ----

def recover_stuck_chunks():
    """Reset any chunk rows stuck as processed=true from a previous failed run."""
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/base64_entries"
            f"?file_type=like.chunk:*&processed=eq.true&select=id",
            headers=READ_HEADERS, timeout=10
        )
        if resp.status_code == 200:
            stuck = resp.json()
            if stuck:
                log(f"Recovering {len(stuck)} stuck chunk(s)...")
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/base64_entries"
                    f"?file_type=like.chunk:*&processed=eq.true",
                    headers=WRITE_HEADERS, json={"processed": False}
                )
                log(f"   Reset complete.")
    except Exception as e:
        log(f"Recovery check failed: {e}")


def cleanup_stale_chunks():
    """Delete incomplete chunk groups older than STALE_CHUNK_MINUTES."""
    try:
        from datetime import timezone
        cutoff = datetime.now(timezone.utc)
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/base64_entries"
            f"?file_type=like.chunk:*&select=id,file_type,created_at",
            headers=READ_HEADERS, timeout=10
        )
        if resp.status_code != 200:
            return

        entries = resp.json()
        if not entries:
            return

        groups = {}
        for e in entries:
            ft = e['file_type']
            parts = ft.split(':')
            if len(parts) >= 5:
                gid = parts[1]
                total = int(parts[3])
                if gid not in groups:
                    groups[gid] = {'total': total, 'ids': [], 'all_created': []}
                groups[gid]['ids'].append(e['id'])
                groups[gid]['all_created'].append(e['created_at'])

        for gid, g in groups.items():
            if len(g['ids']) < g['total']:
                # Use the EARLIEST created_at in the group as the age reference
                earliest = min(g['all_created'])
                created = datetime.fromisoformat(earliest.replace('Z', '+00:00'))
                from datetime import timezone
                age_min = (datetime.now(timezone.utc) - created).total_seconds() / 60
                log(f"  Stale check: group {gid} is {age_min:.0f}m old ({len(g['ids'])}/{g['total']})")
                if age_min > STALE_CHUNK_MINUTES:
                    log(f"Cleaning stale incomplete group {gid} "
                        f"({len(g['ids'])}/{g['total']}, {age_min:.0f}m old)")
                    for eid in g['ids']:
                        requests.delete(
                            f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{eid}",
                            headers=WRITE_HEADERS
                        )
    except Exception as e:
        log(f"Stale cleanup error: {e}")


# ---- Main polling loop ----

def start_listener():
    log("Base64 Listener Started")
    log(f"Downloads: {DOWNLOAD_DIR}")
    print("-" * 50, flush=True)

    recover_stuck_chunks()
    cleanup_stale_chunks()

    poll_count = 0

    while True:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/base64_entries"
                f"?processed=eq.false"
                f"&select=id,filename,file_type"
                f"&order=created_at.asc",
                headers=READ_HEADERS, timeout=10
            )

            if resp.status_code != 200:
                log(f"Poll error: {resp.status_code}")
                time.sleep(3)
                continue

            entries = resp.json()
            if not entries:
                poll_count += 1
                # Periodic stale cleanup every ~5 min
                if poll_count % 100 == 0:
                    cleanup_stale_chunks()
                time.sleep(3)
                continue

            log(f"Poll: found {len(entries)} unprocessed entries")

            regular_ids = []
            chunk_groups = {}

            for entry in entries:
                ft = entry.get('file_type', '')
                if ft.startswith('chunk:'):
                    parts = ft.split(':')
                    if len(parts) >= 5:
                        gid = parts[1]
                        total = int(parts[3])
                        ext = parts[4]
                        if gid not in chunk_groups:
                            chunk_groups[gid] = {
                                'total': total,
                                'filename': entry['filename'],
                                'ext': ext,
                                'ids': []
                            }
                        chunk_groups[gid]['ids'].append(entry['id'])
                else:
                    regular_ids.append(entry['id'])

            # Process regular entries
            for eid in regular_ids:
                url = (f"{SUPABASE_URL}/rest/v1/base64_entries"
                       f"?id=eq.{eid}&select=id,filename,content")
                res = requests.get(url, headers=READ_HEADERS, timeout=60)
                if res.status_code == 200:
                    data = res.json()
                    if data:
                        process_entry(data[0])

            # Process chunk groups
            for gid, group in chunk_groups.items():
                if len(group['ids']) >= group['total']:
                    process_chunk_group(gid, group)
                else:
                    log(f"  Group {gid}: {len(group['ids'])}/{group['total']} — waiting")

            # Always check for stale incomplete groups after processing
            cleanup_stale_chunks()

        except Exception as e:
            log(f"Error: {e}")

        time.sleep(3)


if __name__ == "__main__":
    start_listener()
