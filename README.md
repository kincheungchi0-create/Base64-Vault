# Base64 Vault

A premium self-hosted tool to paste Base64 content, auto-detect file types, and automatically convert them back to local files via Supabase.

## 🚀 Features

- **Beautiful UI**: Modern dark-mode interface with glassmorphism effects.
- **Auto-Detection**: Automatically identifies file types (PDF, PNG, JPG, DOCX, ZIP, etc.) from Base64 signatures.
- **Auto-Conversion**: A Python listener monitors the cloud and saves files to your local `downloads/` folder instantly.
- **Smart Cleanup**: Automatically keeps only the last 10 entries to save space.
- **One-Click Start**: Includes a Windows batch file to launch everything at once.

## 🛠️ Setup

### 1. Supabase Preparation
Create a table in your Supabase project using the following SQL:

```sql
CREATE TABLE IF NOT EXISTS base64_entries (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE
);

ALTER TABLE base64_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_all" ON base64_entries FOR ALL TO anon USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE base64_entries;
```

### 2. Configuration
Update the Supabase URL and Keys in:
- `webapp/app.js`
- `listener.py`

### 3. Installation
```bash
pip install requests
```

## 🏃 Usage
Run the following file on Windows:
```bash
run_vault.bat
```
Then open `http://localhost:5500` in your browser.

## 📂 Project Structure
- `/webapp`: The frontend interface.
- `listener.py`: The background worker that saves files locally.
- `run_vault.bat`: Easy launcher for Windows.
- `downloads/`: Where your converted files appear.
