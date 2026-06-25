@echo off
setlocal enabledelayedexpansion

echo.
echo  ======================================================
echo           ASP Editor - Starte Server
echo  ======================================================
echo.

REM ── Port 5000 Check ─────────────────────────────────────
set "PORT5000_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5000  *LISTENING"') do (
    set "PORT5000_PID=%%P"
)

if defined PORT5000_PID (
    echo  [!] Port 5000 ist bereits belegt - PID: !PORT5000_PID!
    echo.
    REM Prozess-Info anzeigen
    for /f "tokens=1,2 delims=," %%A in ('tasklist /FI "PID eq !PORT5000_PID!" /FO CSV /NH 2^>nul') do (
        echo      Prozess:    %%~A
        echo      PID:        %%~B
    )
    echo.
    set /p KILL="  Kill old process and restart? (y/n): "
    if /i "!KILL!"=="y" (
        taskkill /PID !PORT5000_PID! /F >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            echo  [OK] PID !PORT5000_PID! beendet.
            timeout /t 1 /nobreak >nul
        ) else (
            echo  [FEHLER] Couldn't kill PID !PORT5000_PID!
            pause
            exit /b 1
        )
    ) else (
        echo  Server did not start.
        pause
        exit /b 0
    )
    echo.
) else (
    echo  [OK] Port 5000 free.
    echo.
)

echo  Browser opens automatically to http://localhost:5000
echo  Leave this window open - Exit with Ctrl+C
echo.

python asp_server.py
pause
