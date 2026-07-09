@echo off
setlocal enabledelayedexpansion

call :header

REM ── Config Check ────────────────────────────────────────
if not exist "%~dp0asp_config.json" (
    echo  [FEHLER] asp_config.json fehlt!
    echo.
    echo      Please run install.bat first to create the config.
    echo.
    pause
    exit /b 1
)

REM ── Port 5000 Check ─────────────────────────────────────
REM Locale-independent: netstat prints "LISTENING"/"ABHOEREN"/... depending on
REM the Windows language, so we ask Windows directly via Get-NetTCPConnection.
set "PORT5000_PID="
for /f %%P in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique" 2^>nul') do (
    set "PORT5000_PID=!PORT5000_PID! %%P"
)

if defined PORT5000_PID (
    echo  Port 5000 is already in use by another instance.
    echo.
    set /p KILL="  Kill it and restart the server? (y/n): "
    if /i "!KILL!"=="y" (
        for %%P in (!PORT5000_PID!) do taskkill /PID %%P /F >nul 2>&1
        timeout /t 1 /nobreak >nul
        cls
        call :header
        echo  [OK] Freed port 5000 - starting fresh.
    ) else (
        echo.
        echo  Aborted - server not started.
        pause
        exit /b 0
    )
) else (
    echo  [OK] Port 5000 is free.
)

echo.
echo  Browser opens automatically to http://localhost:5000
echo  Leave this window open - Exit with Ctrl+C
echo.

python asp_server.py
pause
exit /b 0

:header
echo.
echo  ======================================================
echo           ASP Editor - Starte Server
echo  ======================================================
echo.
goto :eof
