@echo off
setlocal EnableDelayedExpansion
title HIVE: Coordinator (8410)
echo.
echo  Starting Coordinator Service...
echo  ================================
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

cd /d "%SYNAPSE_DIR%"

:: Install deps if needed
if not exist node_modules (
    echo  Installing dependencies...
    call npm install
    echo.
)

:: Start with tsx
echo  Launching on http://127.0.0.1:8410
echo  Press Ctrl+C to stop
echo.
npx tsx packages/coordinator/src/index.ts
goto :eof

:resolve_synapse
pushd "%~1"
pushd "%~2"
set SYNAPSE_DIR=%CD%
popd & popd
goto :eof
