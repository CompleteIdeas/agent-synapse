@echo off
:: Usage: start-worker.bat [worker-name] [project-dir]
:: Must be run from AgentSynapse directory (where .claude/agents/ lives)

:: Get args
if not "%~1"=="" set WORKER_NAME=%~1
if not "%~2"=="" set PROJECT_DIR=%~2

:: Fallback defaults
if not defined WORKER_NAME set WORKER_NAME=Worker-A
if not defined PROJECT_DIR set PROJECT_DIR=%cd%

:: Derive WORKSPACE from PROJECT_DIR if not set by caller
if not defined WORKSPACE (
    echo %PROJECT_DIR% | findstr /i "Personal-Projects" >nul && set WORKSPACE=PERSONAL
)
if not defined WORKSPACE (
    echo %PROJECT_DIR% | findstr /i "\\project" >nul && set WORKSPACE=WORK
)
if not defined WORKSPACE set WORKSPACE=DEFAULT

:: DO NOT cd away from AgentSynapse — agent definitions live here
:: The PROJECT_DIR is passed to Claude via system prompt

:: Check AWM is running
curl -s http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: AWM not running on port 8400!
    pause
    exit /b 1
)

:: Handle coordinator
if /i "%WORKER_NAME%"=="coordinator" (
    title HIVE: Coordinator
    claude --dangerously-skip-permissions --agent coordinator --append-system-prompt "YOUR IDENTITY: You are the COORDINATOR. Display [COORDINATOR] at the start of every response. You manage the hive. NEVER use the Agent tool. NEVER spawn subagents. WORKER_NAME=coordinator. WORKSPACE=%WORKSPACE%. PROJECT DIRECTORY: %PROJECT_DIR%." "Execute hive protocol: read synapse.config.json for mode and services, checkin to coordinator, memory_restore. Check GET /workers to see who is online. Report hive status and ask what to assign. If no workers online, queue work as pending — workers auto-claim via /next when launched."
    exit /b 0
)

:: Handle dev-lead
if /i "%WORKER_NAME%"=="dev-lead" (
    title HIVE: Dev-Lead
    set WORKER_NAME=Dev-Lead
    claude --dangerously-skip-permissions --agent dev-lead --append-system-prompt "YOUR IDENTITY: You are the DEV-LEAD. Display [DEV-LEAD] at the start of every response. WORKER_NAME=Dev-Lead. WORKSPACE=%WORKSPACE%. PROJECT DIRECTORY: %PROJECT_DIR%." "Begin hive protocol: follow your agent definition exactly. Checkin, memory_restore, recall context, work assignments, poll for more between tasks."
    exit /b 0
)

:: Handle generic worker
title HIVE: %WORKER_NAME%
claude --dangerously-skip-permissions --agent worker --append-system-prompt "YOUR IDENTITY: You are %WORKER_NAME%. Display [%WORKER_NAME%] at the start of every response. WORKER_NAME=%WORKER_NAME%. WORKSPACE=%WORKSPACE%. PROJECT DIRECTORY: %PROJECT_DIR%." "Begin hive protocol: follow your agent definition exactly. Checkin, memory_restore, recall context, work assignments, poll for more between tasks. Sync with AWM during idle."
