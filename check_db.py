import requests

url = 'https://fkzsmtlryhvccivhdapu.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrenNtdGxyeWh2Y2NpdmhkYXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzM5MzAsImV4cCI6MjA4MjQwOTkzMH0.0_liolRCK4YVuBGxtaYZXiB59Rx-bZCTsea2T_Mp5lM'
h = {'apikey': key, 'Authorization': f'Bearer {key}'}

# All chunk entries
r = requests.get(
    f'{url}/rest/v1/base64_entries?file_type=like.chunk:*&select=id,filename,file_type,processed&order=id.asc',
    headers=h
)
entries = r.json()
print(f"Total chunk entries: {len(entries)}")

groups = {}
for e in entries:
    parts = e['file_type'].split(':')
    gid = parts[1]
    if gid not in groups:
        groups[gid] = {'total': int(parts[3]), 'ext': parts[4], 'filename': e['filename'], 'count': 0, 'processed': 0}
    groups[gid]['count'] += 1
    if e['processed']:
        groups[gid]['processed'] += 1

print(f"Chunk groups: {len(groups)}")
for gid, g in groups.items():
    status = "ALL processed" if g['processed'] == g['count'] else f"{g['processed']}/{g['count']} processed"
    complete = "COMPLETE" if g['count'] >= g['total'] else f"INCOMPLETE ({g['count']}/{g['total']})"
    print(f"  {gid}: {g['filename']} — {g['count']}/{g['total']} chunks — {complete} — {status}")
