@echo off
:: Usage: start-hive.bat [project-dir]
:: Launches orchestrator + 3 workers for a specific project.
:: Services (coordinator) must already be running — use start-services.bat first.

echo.
echo  AgentSynapse Hive Launcher
echo  ==========================
echo.

set LAUNCHER_DIR=%~dp0

:: Find PROJECT_DIR
if exist "%~dp0..\..\..\..\node_modules\agent-synapse\launchers" (
    set DEFAULT_PROJECT=%~dp0..\..\..
) else if exist "%~dp0..\node_modules\agent-synapse" (
    set DEFAULT_PROJECT=%~dp0..
) else (
    set DEFAULT_PROJECT=%~dp0..
)

:: Determine project directory
if not "%~1"=="" (
    set PROJECT_DIR=%~1
) else if defined SYNAPSE_PROJECT_DIR (
    set PROJECT_DIR=%SYNAPSE_PROJECT_DIR%
) else (
    set PROJECT_DIR=%DEFAULT_PROJECT%
)

echo  Project: %PROJECT_DIR%
echo.

:: Check coordinator is running
curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running! Start services first:
    echo    %LAUNCHER_DIR%start-services.bat
    exit /b 1
)

echo  Coordinator OK. Launching agents...
echo.

:: Check for Windows Terminal
where wt >nul 2>&1
if %errorlevel% equ 0 (
    wt new-tab --title "Orchestrator [%PROJECT_DIR%]" cmd /k "%LAUNCHER_DIR%start-worker.bat orchestrator %PROJECT_DIR%" ; ^
       new-tab --title "Dev-Lead [%PROJECT_DIR%]" cmd /k "timeout /t 5 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat dev-lead %PROJECT_DIR%" ; ^
       new-tab --title "Worker-A [%PROJECT_DIR%]" cmd /k "timeout /t 8 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%" ; ^
       new-tab --title "Worker-B [%PROJECT_DIR%]" cmd /k "timeout /t 11 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%" ; ^
       new-tab --title "Worker-C [%PROJECT_DIR%]" cmd /k "timeout /t 14 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-C %PROJECT_DIR%"
) else (
    start "Orchestrator [%PROJECT_DIR%]" cmd /k "%LAUNCHER_DIR%start-worker.bat orchestrator %PROJECT_DIR%"
    timeout /t 5 /nobreak >nul
    start "Dev-Lead [%PROJECT_DIR%]" cmd /k "%LAUNCHER_DIR%start-worker.bat dev-lead %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-A [%PROJECT_DIR%]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-B [%PROJECT_DIR%]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-C [%PROJECT_DIR%]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-C %PROJECT_DIR%"
)

echo.
echo  Hive launched (5 windows):
echo    Orchestrator  — manages and assigns work
echo    Dev-Lead      — reads, scopes, plans
echo    Worker-A      — executes tasks
echo    Worker-B      — executes tasks
echo    Worker-C      — executes tasks
echo.
echo  All agents working in: %PROJECT_DIR%
echo  Add more workers: start-worker.bat Worker-D %PROJECT_DIR%
echo.
