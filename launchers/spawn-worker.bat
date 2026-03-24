@echo off
:: Spawn a worker for a specific task. Called by the coordinator.
:: Usage: spawn-worker.bat <worker-name> <project-dir> <task-description>
:: Example: spawn-worker.bat Worker-B "C:\Users\robert\Personal-Projects" "Run the AWM edge-case tests"
::
:: The worker launches in a new Windows Terminal tab, does the task, and stays open.
:: No polling loop — the task IS the prompt.

set WORKER_NAME=%~1
set PROJECT_DIR=%~2
set TASK=%~3
set SYNAPSE_DIR=%~dp0..

if "%WORKER_NAME%"=="" (
    echo Usage: spawn-worker.bat worker-name project-dir "task description"
    exit /b 1
)
if "%TASK%"=="" (
    echo Usage: spawn-worker.bat worker-name project-dir "task description"
    exit /b 1
)

:: Write a temp launcher script (avoids quoting issues with wt)
set TMPSCRIPT=%TEMP%\agentsynapse-spawn-%WORKER_NAME%.bat
echo @echo off > "%TMPSCRIPT%"
echo cd /d "%SYNAPSE_DIR%" >> "%TMPSCRIPT%"
echo set WORKER_NAME=%WORKER_NAME% >> "%TMPSCRIPT%"
echo set PROJECT_DIR=%PROJECT_DIR% >> "%TMPSCRIPT%"
echo claude --dangerously-skip-permissions --agent worker --append-system-prompt "YOUR IDENTITY: You are %WORKER_NAME%. Display [%WORKER_NAME%] at the start of every response. WORKER_NAME=%WORKER_NAME%. PROJECT DIRECTORY: %PROJECT_DIR%. You were spawned by the coordinator for a SPECIFIC TASK. Complete it, report results via POST /findings or POST /assign update, then checkin as idle and wait for further instructions." "%TASK%" >> "%TMPSCRIPT%"

:: Derive workspace from project dir (must match launch-hive.cjs WORKSPACES)
set WT_WINDOW=AgentSynapse-PERSONAL
echo %PROJECT_DIR% | findstr /i "\\project" >nul && set WT_WINDOW=AgentSynapse-WORK

:: Launch in a new Windows Terminal tab (joins existing hive window)
wt -w "%WT_WINDOW%" new-tab --title "%WORKER_NAME% [task]" cmd /k "%TMPSCRIPT%"

echo Spawned %WORKER_NAME% for task: %TASK%
