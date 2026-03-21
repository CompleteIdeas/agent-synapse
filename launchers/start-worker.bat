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
    claude --dangerously-skip-permissions --agent orchestrator --append-system-prompt "YOUR IDENTITY: You are the ORCHESTRATOR. Display this at the start of every response: [ORCHESTRATOR]. You manage the hive. NEVER use the Agent tool. NEVER spawn subagents or background tasks. You NEVER do substantive work yourself — ALL work is assigned to workers or the Dev-Lead. Check GET /workers to see who's online before assigning work. PROJECT DIRECTORY: %PROJECT_DIR%" "Execute hive protocol: read synapse.config.json for mode and services, checkin to coordinator, memory_restore. Then WAIT for workers — poll GET /workers every 10 seconds until at least 2 workers show alive:true (up to 60s). Only after workers are online, report the hive status and ask me what to assign."
    exit /b 0
)

:: Handle dev-lead specially
if /i "%~1"=="dev-lead" (
    title HIVE: Dev-Lead [%PROJECT_DIR%]
    claude --dangerously-skip-permissions --agent dev-lead --append-system-prompt "YOUR IDENTITY: You are the Dev-Lead. Display this at the start of every response: [DEV-LEAD]. You read, analyze, and scope work — then report task breakdowns back to the orchestrator. You NEVER implement or edit files. PROJECT DIRECTORY: %PROJECT_DIR%" "Execute hive protocol: checkin to coordinator as Dev-Lead, check commands, memory_restore, GET /assignment. If no task, enter idle poll loop (every 30s). Never exit until SHUTDOWN."
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
claude --dangerously-skip-permissions --agent worker --append-system-prompt "YOUR IDENTITY: You are %WORKER_NAME%. Display this at the start of every response: [%WORKER_NAME%]. Set WORKER_NAME=%WORKER_NAME% for all checkin calls. You are a generic worker — your role is determined by whatever task the orchestrator assigns you. PROJECT DIRECTORY: %PROJECT_DIR%" "Execute hive protocol: checkin to coordinator as %WORKER_NAME%, check commands, memory_restore, GET /assignment. If no task, enter idle poll loop (every 30s). Never exit until SHUTDOWN."
