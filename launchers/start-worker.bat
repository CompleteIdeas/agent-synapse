@echo off
:: Usage: start-worker.bat [worker-name] [project-dir]
:: Examples:
::   start-worker.bat                          — auto-assigns Worker-A
::   start-worker.bat Worker-A                 — specific worker
::   start-worker.bat orchestrator             — launches the orchestrator agent
::   start-worker.bat Worker-A C:\path\to\proj — worker in a specific project

:: Determine project directory
if not "%~2"=="" (
    set PROJECT_DIR=%~2
) else if defined SYNAPSE_PROJECT_DIR (
    set PROJECT_DIR=%SYNAPSE_PROJECT_DIR%
) else (
    :: Find project root from launcher location
    if exist "%~dp0..\..\..\..\node_modules\agent-synapse\launchers" (
        set PROJECT_DIR=%~dp0..\..\..
    ) else if exist "%~dp0..\node_modules\agent-synapse" (
        set PROJECT_DIR=%~dp0..
    ) else (
        set PROJECT_DIR=%~dp0..
    )
)

:: Change to the project directory so agents see the right files
cd /d "%PROJECT_DIR%"

:: Check coordinator is running first
curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running! Start services first.
    echo  Run: start-services.bat
    exit /b 1
)

:: Handle orchestrator specially
if /i "%~1"=="orchestrator" (
    title HIVE: Orchestrator [%PROJECT_DIR%]
    claude --dangerously-skip-permissions --agent orchestrator --append-system-prompt "YOUR IDENTITY: You are the ORCHESTRATOR. Display [ORCHESTRATOR] at the start of every response. PROJECT DIRECTORY: %PROJECT_DIR%" "Begin hive protocol."
    exit /b 0
)

:: Handle dev-lead specially
if /i "%~1"=="dev-lead" (
    title HIVE: Dev-Lead [%PROJECT_DIR%]
    claude --dangerously-skip-permissions --agent dev-lead --append-system-prompt "YOUR IDENTITY: You are the DEV-LEAD. Display [DEV-LEAD] at the start of every response. PROJECT DIRECTORY: %PROJECT_DIR%" "Begin hive protocol."
    exit /b 0
)

if "%~1"=="" (
    :: Auto-assign: find next available worker name
    for %%L in (A B C D E F G H) do (
        curl -s http://127.0.0.1:8410/workers 2>nul | findstr /i "Worker-%%L" >nul 2>&1
        if errorlevel 1 (
            set WORKER_NAME=Worker-%%L
            goto :found
        )
    )
    echo  ERROR: All worker slots A-H are taken!
    exit /b 1
) else (
    set WORKER_NAME=%~1
)

:found
title HIVE: %WORKER_NAME% [%PROJECT_DIR%]
set WORKER_NAME=%WORKER_NAME%

:: Launch generic worker with identity
claude --dangerously-skip-permissions --agent worker --append-system-prompt "YOUR IDENTITY: You are %WORKER_NAME%. Display [%WORKER_NAME%] at the start of every response. WORKER_NAME=%WORKER_NAME% for all checkin calls. PROJECT DIRECTORY: %PROJECT_DIR%" "Begin hive protocol."
