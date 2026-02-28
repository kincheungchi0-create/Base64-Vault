import requests

url = 'https://fkzsmtlryhvccivhdapu.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrenNtdGxyeWh2Y2NpdmhkYXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzM5MzAsImV4cCI6MjA4MjQwOTkzMH0.0_liolRCK4YVuBGxtaYZXiB59Rx-bZCTsea2T_Mp5lM'
h = {'apikey': key, 'Authorization': f'Bearer {key}'}

# Get ALL entries for the chunk group
r = requests.get(
    f'{url}/rest/v1/base64_entries?file_type=like.chunk:mm6hktqo4j6trz:*&select=id,filename,file_type,processed&order=id.asc',
    headers=h
)
entries = r.json()
print(f"Chunks for group mm6hktqo4j6trz: {len(entries)} (expected 10)")
for e in entries:
    ft = e['file_type']
    parts = ft.split(':')
    idx = parts[2] if len(parts) > 2 else '?'
    print(f"  ID={e['id']}  chunk_index={idx}  processed={e['processed']}")

# Check content length of first chunk
if entries:
    first_id = entries[0]['id']
    r2 = requests.get(
        f'{url}/rest/v1/base64_entries?id=eq.{first_id}&select=content',
        headers=h
    )
    data = r2.json()
    if data:
        content_len = len(data[0].get('content', ''))
        print(f"\nFirst chunk content length: {content_len} chars")
    else:
        print("\nFirst chunk: NO CONTENT FOUND")
