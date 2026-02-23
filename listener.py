import os
import time
import base64
import requests
import json
from datetime import datetime

# Supabase configuration
SUPABASE_URL = "https://fkzsmtlryhvccivhdapu.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrenNtdGxyeWh2Y2NpdmhkYXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzM5MzAsImV4cCI6MjA4MjQwOTkzMH0.0_liolRCK4YVuBGxtaYZXiB59Rx-bZCTsea2T_Mp5lM"
DOWNLOAD_DIR = r"c:\base64\downloads"

# Create downloads directory if it doesn't exist
if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def process_entry(entry):
    entry_id = entry['id']
    filename = entry['filename']
    content = entry['content']
    
    # 1. IMMEDIATE UPDATE: Mark as processed FIRST to claim this entry
    # This prevents other instances from picking up the same entry
    update_url = f"{SUPABASE_URL}/rest/v1/base64_entries?id=eq.{entry_id}"
    update_res = requests.patch(update_url, headers=headers, json={"processed": True})
    
    if update_res.status_code not in [200, 201, 204]:
        # If we couldn't update it, someone else might be processing it
        return

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Processing: {filename} (ID: {entry_id})")
    
    try:
        # 2. Decode base64 content
        if "," in content:
            content = content.split(",")[1]
            
        file_data = base64.b64decode(content)
        
        # 3. Save file locally
        file_path = os.path.join(DOWNLOAD_DIR, filename)
        
        # If file exists, we don't need to save it again since it's the same ID
        if os.path.exists(file_path):
            print(f"   ℹ️ File already exists, skipping save.")
            return
            
        with open(file_path, "wb") as f:
            f.write(file_data)
            
        print(f"   ✅ Saved to: {file_path}")
            
    except Exception as e:
        print(f"   ❌ Error processing {filename}: {str(e)}")
        # Optional: set processed back to False if it failed
        # requests.patch(update_url, headers=headers, json={"processed": False})

def start_listener():
    print("🚀 Base64 Listener Started")
    print(f"📁 Monitoring Supabase for new entries...")
    print(f"💾 Files will be saved to: {DOWNLOAD_DIR}")
    print("-" * 50)
    
    while True:
        try:
            # Query for unprocessed entries
            query_url = f"{SUPABASE_URL}/rest/v1/base64_entries?processed=eq.false&select=id,filename,content&order=created_at.asc"
            response = requests.get(query_url, headers=headers)
            
            if response.status_code == 200:
                entries = response.json()
                if entries:
                    for entry in entries:
                        process_entry(entry)
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Error polling Supabase: {response.status_code}")
                
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Connection error: {str(e)}")
            
        # Wait before next poll
        time.sleep(3)

if __name__ == "__main__":
    start_listener()
