@echo off
setlocal EnableDelayedExpansion
:: Start AgentSynapse backend services (Coordinator + Memory)

echo.
echo  AgentSynapse Services
echo  =====================
echo.

:: Find SYNAPSE_DIR
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

:: Start coordinator
if "%USE_WT%"=="1" (
    wt new-tab --title "Coordinator (8410)" cmd /k "cd /d %SYNAPSE_DIR% && npx tsx packages/coordinator/src/index.ts"
) else (
    start "Coordinator (8410)" cmd /k "cd /d %SYNAPSE_DIR% && npx tsx packages/coordinator/src/index.ts"
)

echo.
echo  Services starting:
echo    Coordinator: http://127.0.0.1:8410
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
