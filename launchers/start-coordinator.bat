@echo off
setlocal EnableDelayedExpansion
title HIVE: AWM + Coordination (8400)
echo.
echo  Starting AWM with Coordination Module...
echo  =========================================
echo.
echo  NOTE: The coordinator is now part of AWM (port 8400).
echo  This script starts AWM with AWM_COORDINATION=true.
echo.

:: Find AWM directory
set AWM_DIR=
if exist "%~dp0..\packages\awm" (
    set AWM_DIR=%~dp0..\packages\awm
) else if exist "%~dp0..\node_modules\agent-synapse\packages\awm" (
    set AWM_DIR=%~dp0..\node_modules\agent-synapse\packages\awm
)
if not defined AWM_DIR (
    echo  ERROR: Cannot find AWM directory (packages/awm).
    pause
    exit /b 1
)

cd /d "%AWM_DIR%"

:: Install deps if needed
if not exist node_modules (
    echo  Installing dependencies...
    call npm install
    echo.
)

REM Start AWM with coordination enabled.
REM WORKER_ROLE makes any channel-server.js spawned via MCP plugin
REM auto-register with role=coordinator (AWM 0.7.4).
REM WORKSPACE default avoids workers landing in workspace=DEFAULT.
set AWM_COORDINATION=true
set WORKER_ROLE=coordinator
if not defined WORKSPACE set WORKSPACE=WORK
echo  Launching AWM on http://127.0.0.1:8400 (coordination enabled)
echo  WORKER_ROLE=%WORKER_ROLE%  WORKSPACE=%WORKSPACE%
echo  Press Ctrl+C to stop
echo.
npx tsx src/index.ts
