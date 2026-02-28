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

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

_WS_TABLE = str.maketrans('', '', ' \t\n\r\x0b\x0c')


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ---- Single entry processing ----

def process_entry(entry):
    entry_id = entry['id']
    filename = entry['filename']
    content = entry['content']

    url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{entry_id}"
    res = requests.patch(url, headers=headers, json={"processed": True})
    if res.status_code not in [200, 201, 204]:
        return

    log(f"Processing: {filename} (ID: {entry_id})")

    try:
        if "," in content[:200]:
            content = content.split(",", 1)[1]

        file_data = base64.b64decode(content)
        file_path = os.path.join(DOWNLOAD_DIR, filename)

        if os.path.exists(file_path):
            log(f"   File already exists, skipping.")
            return

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

    log(f"Assembling: {filename} ({total} chunks)")

    try:
        all_chunks = []
        for batch_start in range(0, len(ids), CHUNK_FETCH_BATCH):
            batch_ids = ids[batch_start:batch_start + CHUNK_FETCH_BATCH]
            ids_str = ','.join(str(i) for i in batch_ids)
            url = (f"{SUPABASE_URL}/rest/v1/base64_entries"
                   f"?id=in.({ids_str})"
                   f"&select=content,file_type")
            res = requests.get(url, headers=headers, timeout=120)
            if res.status_code != 200:
                log(f"   Fetch error: {res.status_code}")
                return
            all_chunks.extend(res.json())
            fetched = min(batch_start + CHUNK_FETCH_BATCH, len(ids))
            log(f"   Fetched {fetched}/{total} chunks")

        if len(all_chunks) != total:
            log(f"   Error: got {len(all_chunks)}/{total} chunks")
            return

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

        file_path = os.path.join(DOWNLOAD_DIR, filename)
        if os.path.exists(file_path):
            log(f"   File already exists, skipping.")
        else:
            with open(file_path, 'wb') as f:
                f.write(file_data)
            size_mb = len(file_data) / (1024 * 1024)
            log(f"   Saved: {file_path} ({size_mb:.1f} MB)")

        # SUCCESS — delete chunk rows, insert metadata
        for eid in ids:
            url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{eid}"
            requests.delete(url, headers=headers)

        requests.post(
            f"{SUPABASE_URL}/rest/v1/base64_entries",
            headers=headers,
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
        # Reset chunks so they can be retried
        for eid in ids:
            url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{eid}"
            requests.patch(url, headers=headers, json={"processed": False})


# ---- Startup recovery ----

def recover_stuck_chunks():
    """Batch-reset any chunk rows stuck as processed=true from a previous failed run."""
    try:
        # Single PATCH to reset ALL stuck chunks at once
        url = (f"{SUPABASE_URL}/rest/v1/base64_entries"
               f"?file_type=like.chunk:*&processed=eq.true")
        resp = requests.get(url + "&select=id", headers=headers, timeout=10)
        if resp.status_code == 200:
            count = len(resp.json())
            if count > 0:
                log(f"Recovering {count} stuck chunk(s)...")
                patch_resp = requests.patch(
                    url, headers=headers, json={"processed": False}
                )
                if patch_resp.status_code in [200, 201, 204]:
                    log(f"   Reset complete.")
                else:
                    log(f"   Reset failed: {patch_resp.status_code}")
    except Exception as e:
        log(f"Recovery check failed: {e}")


# ---- Main polling loop ----

def start_listener():
    log("Base64 Listener Started")
    log(f"Downloads: {DOWNLOAD_DIR}")
    print("-" * 50, flush=True)

    recover_stuck_chunks()

    while True:
        try:
            meta_url = (f"{SUPABASE_URL}/rest/v1/base64_entries"
                        f"?processed=eq.false"
                        f"&select=id,filename,file_type"
                        f"&order=created_at.asc")
            resp = requests.get(meta_url, headers=headers, timeout=10)

            if resp.status_code != 200:
                log(f"Poll error: {resp.status_code}")
                time.sleep(3)
                continue

            entries = resp.json()
            if not entries:
                time.sleep(3)
                continue

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

            # Regular entries
            for eid in regular_ids:
                url = (f"{SUPABASE_URL}/rest/v1/base64_entries"
                       f"?id=eq.{eid}&select=id,filename,content")
                res = requests.get(url, headers=headers, timeout=60)
                if res.status_code == 200:
                    data = res.json()
                    if data:
                        process_entry(data[0])

            # Complete chunk groups
            for gid, group in chunk_groups.items():
                if len(group['ids']) >= group['total']:
                    process_chunk_group(gid, group)

        except Exception as e:
            log(f"Error: {e}")

        time.sleep(3)


if __name__ == "__main__":
    start_listener()
