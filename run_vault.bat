@echo off
title Base64 Vault System
set BASE_DIR=%~dp0
cd /d "%BASE_DIR%"

echo ========================================
echo   Base64 Vault - Starting Services
echo ========================================
echo.

:: Start the Python Listener in a new window
echo [1/2] Starting Python Listener (Background)...
start /b python listener.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to start listener.py
    pause
    exit /b 1
)

:: Start the Web Server
echo [2/2] Starting Web Server on http://localhost:5500...
cd webapp
start /b python -m http.server 5500
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to start web server
    pause
    exit /b 1
)

echo.
echo ========================================
echo   System is UP and RUNNING!
echo   Web App: http://localhost:5500
echo   Downloads: %BASE_DIR%downloads
echo ========================================
echo.
echo Press any key to stop all services...
pause > nul

:: Kill processes on exit
echo Stopping services...
taskkill /f /im python.exe /t > nul
echo Done.
exit
