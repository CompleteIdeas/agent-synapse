@echo off
setlocal EnableDelayedExpansion
:: Start everything: services + hive
:: Usage: start-all.bat [project-dir]

echo.
echo  AgentSynapse Full Startup
echo  =========================
echo.

set LAUNCHER_DIR=%~dp0

:: Find SYNAPSE_DIR (where packages/coordinator lives)
if exist "%~dp0..\packages\coordinator" (
    set SYNAPSE_DIR=%~dp0..
) else if exist "%~dp0..\node_modules\agent-synapse\packages\coordinator" (
    set SYNAPSE_DIR=%~dp0..\node_modules\agent-synapse
) else if exist "%~dp0.synapse-path" (
    set /p _REL_PATH=<"%~dp0.synapse-path"
    call :resolve_synapse "%~dp0" "!_REL_PATH!"
) else (
    for /f "delims=" %%G in ('npm root -g 2^>nul') do (
        if exist "%%G\agent-synapse\packages\coordinator" set SYNAPSE_DIR=%%G\agent-synapse
    )
)
if not defined SYNAPSE_DIR (
    echo  ERROR: Cannot find AgentSynapse packages directory.
    echo  Run "agent-synapse init --force" to fix, or set SYNAPSE_DIR manually.
    pause
    exit /b 1
)

:: Find PROJECT_DIR (the user's project root)
:: If launchers/ is inside node_modules/agent-synapse/, project is 3 levels up
if exist "%~dp0..\..\..\..\node_modules\agent-synapse\launchers" (
    :: We are at: project/node_modules/agent-synapse/launchers/
    set PROJECT_DIR=%~dp0..\..\..
) else if exist "%~dp0..\node_modules\agent-synapse" (
    :: We are at: project/launchers/ (copied by init)
    set PROJECT_DIR=%~dp0..
) else (
    :: We are in AgentSynapse dev root
    set PROJECT_DIR=%~dp0..
)

:: Override project dir if argument provided
if not "%~1"=="" set PROJECT_DIR=%~1
if defined SYNAPSE_PROJECT_DIR if "%~1"=="" set PROJECT_DIR=%SYNAPSE_PROJECT_DIR%

echo  Project:  %PROJECT_DIR%
echo  Synapse:  %SYNAPSE_DIR%
echo.

:: Check if Windows Terminal (wt) is available
where wt >nul 2>&1
if %errorlevel% equ 0 (
    set USE_WT=1
) else (
    set USE_WT=0
    echo  Note: Windows Terminal not found, using cmd windows instead.
    echo.
)

:: Step 1: Start coordinator
echo  Step 1: Starting coordinator...
if "%USE_WT%"=="1" (
    wt new-tab --title "Coordinator (8410)" cmd /k "cd /d %SYNAPSE_DIR% && npx tsx packages/coordinator/src/index.ts"
) else (
    start "Coordinator (8410)" cmd /k "cd /d %SYNAPSE_DIR% && npx tsx packages/coordinator/src/index.ts"
)

:: Wait for coordinator to come up (poll health endpoint, up to 40 seconds)
echo  Waiting for coordinator...
set COORD_TRIES=0

:wait_coord
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% equ 0 (
    echo        Coordinator ready!
    goto :coord_ok
)
set /a COORD_TRIES+=1
if %COORD_TRIES% lss 20 goto :wait_coord

echo  ERROR: Coordinator did not start within 40 seconds.
echo  Check the Coordinator window for errors.
exit /b 1

:coord_ok

:: Step 2: Start task manager if mode is full
set TM_LOCAL=0
if exist "%PROJECT_DIR%\synapse.config.json" (
    findstr /i "127.0.0.1:8420" "%PROJECT_DIR%\synapse.config.json" >nul 2>&1
    if not errorlevel 1 set TM_LOCAL=1
)

if "%TM_LOCAL%"=="1" (
    echo  Step 2: Starting Task Manager...
    if "%USE_WT%"=="1" (
        wt new-tab --title "Task Manager (8420)" cmd /k "cd /d %SYNAPSE_DIR% && npx tsx packages/task-manager/src/index.ts"
    ) else (
        start "Task Manager (8420)" cmd /k "cd /d %SYNAPSE_DIR% && npx tsx packages/task-manager/src/index.ts"
    )
    timeout /t 3 /nobreak >nul
) else (
    echo  Task Manager: remote or not configured (skipping local start)
)

:: Step 3: Launch AWM log viewer
echo  Step 3: Starting AWM log viewer...
if "%USE_WT%"=="1" (
    wt new-tab --title "AWM Log" cmd /k "%LAUNCHER_DIR%awm-log.bat"
) else (
    start "AWM Log" cmd /k "%LAUNCHER_DIR%awm-log.bat"
)

:: Step 4: Launch hive
echo  Step 4: Launching hive for %PROJECT_DIR%...
call %LAUNCHER_DIR%start-hive.bat %PROJECT_DIR%

echo.
echo  Everything launched!
echo.
goto :eof

:resolve_synapse
:: Resolves a relative path from launcher dir to an absolute SYNAPSE_DIR
pushd "%~1"
pushd "%~2"
set SYNAPSE_DIR=%CD%
popd & popd
goto :eof
