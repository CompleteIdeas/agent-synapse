@echo off
:: Launches hive for PERSONAL workspace: coordinator + 2 workers (no dev-lead)
:: Coordinator must already be running.

echo.
echo  AgentSynapse Hive — PERSONAL
echo  ==============================
echo.

set LAUNCHER_DIR=%~dp0
set SYNAPSE_DIR=%LAUNCHER_DIR%..
set WORKSPACE=PERSONAL

:: Read PROJECT_DIR from synapse.workspaces.json
for /f "delims=" %%a in ('node -e "process.stdout.write(require('%SYNAPSE_DIR:\=/%/synapse.workspaces.json').workspaces.personal.projectDir)" 2^>nul') do set "PROJECT_DIR=%%a"
if not defined PROJECT_DIR (
    echo  WARNING: Could not read synapse.workspaces.json, using fallback
    set PROJECT_DIR=%SYNAPSE_DIR%\..
)

echo  Project: %PROJECT_DIR%
echo.

:: Check coordinator is running
curl -s http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running! Start services first.
    exit /b 1
)

echo  Coordinator OK. Launching 3 agents...
echo.

:: Check for Windows Terminal
where wt >nul 2>&1
if %errorlevel% equ 0 (
    wt new-tab --title "Coordinator [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat coordinator %PROJECT_DIR%" ; ^
       new-tab --title "Worker-A [personal]" cmd /k "timeout /t 5 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%" ; ^
       new-tab --title "Worker-B [personal]" cmd /k "timeout /t 8 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%"
) else (
    start "Coordinator [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat coordinator %PROJECT_DIR%"
    timeout /t 5 /nobreak >nul
    start "Worker-A [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-B [personal]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%"
)

echo.
echo  Personal hive launched (3 agents):
echo    Coordinator + Worker-A + Worker-B
echo  Project: %PROJECT_DIR%
echo.