@echo off
:: Usage: start-worker.bat [worker-name] [project-dir]
:: Must be run from AgentSynapse directory (where .claude/agents/ lives)

:: Get args
if not "%~1"=="" set WORKER_NAME=%~1
if not "%~2"=="" set PROJECT_DIR=%~2

:: Fallback defaults
if not defined WORKER_NAME set WORKER_NAME=Worker-A
if not defined PROJECT_DIR set PROJECT_DIR=%cd%

:: DO NOT cd away from AgentSynapse — agent definitions live here
:: The PROJECT_DIR is passed to Claude via system prompt

:: Check coordinator is running
curl -s http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running!
    pause
    exit /b 1
)

:: Handle coordinator
if /i "%WORKER_NAME%"=="coordinator" (
    title HIVE: Coordinator
    claude --dangerously-skip-permissions --agent coordinator --append-system-prompt "YOUR IDENTITY: You are the COORDINATOR. Display [COORDINATOR] at the start of every response. You manage the hive. NEVER use the Agent tool. NEVER spawn subagents. Check GET /workers to see who is online before assigning work. PROJECT DIRECTORY: %PROJECT_DIR%\launchers\.." "Execute hive protocol: read synapse.config.json for mode and services, checkin to coordinator, memory_restore. Then WAIT for workers - poll GET /workers every 10 seconds until at least 2 workers show alive:true (up to 60s). Only after workers are online, report the hive status and ask me what to assign."
    exit /b 0
)

:: Handle dev-lead
if /i "%WORKER_NAME%"=="dev-lead" (
    title HIVE: Dev-Lead
    set WORKER_NAME=Dev-Lead
    claude --dangerously-skip-permissions --agent dev-lead --append-system-prompt "YOUR IDENTITY: You are the DEV-LEAD. Display [DEV-LEAD] at the start of every response. WORKER_NAME=Dev-Lead. PROJECT DIRECTORY: %PROJECT_DIR%. CRITICAL: After EVERY completed task or response, you MUST immediately poll for new assignments. NEVER stop. Use /loop 2m to auto-poll if available, otherwise manually checkin and check assignments after each action." "Begin hive protocol: checkin, check commands, poll for assignments. After completing any work, IMMEDIATELY poll again. Never park or stop — keep working."
    exit /b 0
)

:: Handle generic worker
title HIVE: %WORKER_NAME%
claude --dangerously-skip-permissions --agent worker --append-system-prompt "YOUR IDENTITY: You are %WORKER_NAME%. Display [%WORKER_NAME%] at the start of every response. WORKER_NAME=%WORKER_NAME% for all checkin calls. PROJECT DIRECTORY: %PROJECT_DIR%. CRITICAL: After EVERY completed task or response, you MUST immediately poll for new assignments. NEVER stop. Use /loop 2m to auto-poll if available, otherwise manually checkin and check assignments after each action." "Begin hive protocol: checkin, check commands, poll for assignments. After completing any work, IMMEDIATELY poll again. Never park or stop — keep working."
