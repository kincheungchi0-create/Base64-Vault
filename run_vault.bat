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
echo   Polling Supabase every 3 seconds...
echo ========================================
echo.

python listener.py

pause
