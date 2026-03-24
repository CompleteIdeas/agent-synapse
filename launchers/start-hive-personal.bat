@echo off
:: Launches hive for PERSONAL workspace: orchestrator + 2 workers (no dev-lead)
:: Coordinator must already be running.

echo.
echo  AgentSynapse Hive — PERSONAL
echo  ==============================
echo.

set LAUNCHER_DIR=%~dp0
set PROJECT_DIR=C:\Users\robert\Personal-Projects

echo  Project: %PROJECT_DIR%
echo.

:: Check coordinator is running
curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running! Start services first.
    exit /b 1
)

echo  Coordinator OK. Launching 3 agents...
echo.

:: Check for Windows Terminal
where wt >nul 2>&1
if %errorlevel% equ 0 (
    wt new-tab --title "Orchestrator [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat orchestrator %PROJECT_DIR%" ; ^
       new-tab --title "Worker-A [personal]" cmd /k "timeout /t 5 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%" ; ^
       new-tab --title "Worker-B [personal]" cmd /k "timeout /t 8 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%"
) else (
    start "Orchestrator [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat orchestrator %PROJECT_DIR%"
    timeout /t 5 /nobreak >nul
    start "Worker-A [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-B [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%"
)

echo.
echo  Personal hive launched (3 agents):
echo    Orchestrator + Worker-A + Worker-B
echo  Project: %PROJECT_DIR%
echo.