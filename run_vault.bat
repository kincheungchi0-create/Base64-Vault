@echo off
title Base64 Vault - Listener
cd /d "%~dp0"

echo ========================================
echo   Base64 Vault - Listener
echo ========================================
echo.
echo   Webapp:    Deployed on Vercel
echo   Downloads: %~dp0downloads
echo.
echo   Stopping any previous listener...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | Where-Object { $_.CommandLine -like '*listener.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
echo   Starting new listener...
echo   Polling Supabase every 3 seconds...
echo ========================================
echo.

python listener.py

pause
