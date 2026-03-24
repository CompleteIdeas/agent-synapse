@echo off
setlocal EnableDelayedExpansion
:: Start AgentSynapse backend services (AWM with Coordination)

echo.
echo  AgentSynapse Services
echo  =====================
echo.

:: Find SYNAPSE_DIR
if exist "%~dp0..\packages\awm" (
    set SYNAPSE_DIR=%~dp0..
) else if exist "%~dp0..\node_modules\agent-synapse\packages\awm" (
    set SYNAPSE_DIR=%~dp0..\node_modules\agent-synapse
) else if exist "%~dp0.synapse-path" (
    set /p _REL_PATH=<"%~dp0.synapse-path"
    call :resolve_synapse "%~dp0" "!_REL_PATH!"
) else (
    for /f "delims=" %%G in ('npm root -g 2^>nul') do (
        if exist "%%G\agent-synapse\packages\awm" set SYNAPSE_DIR=%%G\agent-synapse
    )
)
if not defined SYNAPSE_DIR (
    echo  ERROR: Cannot find AgentSynapse packages directory.
    echo  Run "agent-synapse init --force" to fix, or set SYNAPSE_DIR manually.
    pause
    exit /b 1
)

:: Find PROJECT_DIR
if exist "%~dp0..\..\..\..\node_modules\agent-synapse\launchers" (
    set PROJECT_DIR=%~dp0..\..\..
) else if exist "%~dp0..\node_modules\agent-synapse" (
    set PROJECT_DIR=%~dp0..
) else (
    set PROJECT_DIR=%~dp0..
)

:: Check for Windows Terminal
where wt >nul 2>&1
if %errorlevel% equ 0 (
    set USE_WT=1
) else (
    set USE_WT=0
)

:: Start AWM with coordination enabled
set AWM_COORDINATION=true
if "%USE_WT%"=="1" (
    wt new-tab --title "AWM + Coordination (8400)" cmd /k "cd /d %SYNAPSE_DIR%\packages\awm && set AWM_COORDINATION=true && npx tsx src/index.ts"
) else (
    start "AWM + Coordination (8400)" cmd /k "cd /d %SYNAPSE_DIR%\packages\awm && set AWM_COORDINATION=true && npx tsx src/index.ts"
)

echo.
echo  Services starting:
echo    AWM + Coordination: http://127.0.0.1:8400
echo    Memory: MCP stdio (per-agent, shared DB)
echo.
echo  To start the hive for a project:
echo    start-hive.bat %PROJECT_DIR%
echo.
goto :eof

:resolve_synapse
pushd "%~1"
pushd "%~2"
set SYNAPSE_DIR=%CD%
popd & popd
goto :eof
