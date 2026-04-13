@echo off
setlocal EnableDelayedExpansion
:: Graceful shutdown: broadcast SHUTDOWN to agents, wait for idle, then stop services
:: Usage: shutdown.bat [workspace] [--now]
::   shutdown.bat              — global shutdown (all workspaces + kill coordinator)
::   shutdown.bat equihub      — shutdown equihub agents only (coordinator stays running)
::   shutdown.bat --now        — global shutdown, skip wait
::   shutdown.bat equihub --now

echo.
echo  AgentSynapse Graceful Shutdown
echo  ==============================
echo.

:: Parse args: workspace and --now flag
set WS_ARG=
set SKIP_WAIT=0
for %%A in (%*) do (
    if /i "%%A"=="--now" (
        set SKIP_WAIT=1
    ) else (
        set WS_ARG=%%A
    )
)

:: Check if coordinator is running
curl -s --max-time 2 http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  Coordinator not running — nothing to shut down.
    echo.
    pause
    exit /b 0
)

:: Build workspace-specific JSON and query params
if defined WS_ARG (
    set WS_JSON=,"workspace":"%WS_ARG%"
    set WS_QUERY=?workspace=%WS_ARG%
    echo  Workspace: %WS_ARG% (agents only — coordinator stays running)
) else (
    set WS_JSON=
    set WS_QUERY=
    echo  Scope: ALL workspaces + coordinator
)
echo.

:: Step 1: Show current hive status
echo  Current hive status:
curl -s http://127.0.0.1:8400/status 2>nul
echo.
echo.

:: Step 2: Broadcast SHUTDOWN command
echo  Broadcasting SHUTDOWN...
curl -s -X POST http://127.0.0.1:8400/command -H "Content-Type: application/json" -d "{\"command\":\"SHUTDOWN\",\"reason\":\"graceful shutdown via launcher\",\"issuedBy\":\"cli\"%WS_JSON%}" >nul 2>&1
if %errorlevel% equ 0 (
    echo    SHUTDOWN broadcast sent.
) else (
    echo    WARNING: Failed to broadcast SHUTDOWN.
)
echo.

:: Step 3: Skip wait if --now
if "%SKIP_WAIT%"=="1" (
    echo  --now flag: skipping wait.
    goto :stop_services
)

:: Step 4: Wait for agents to go idle (up to 60 seconds)
echo  Waiting for agents to finish up (up to 60s)...
set TRIES=0

:wait_idle
timeout /t 3 /nobreak >nul
set /a TRIES+=1

for /f "delims=" %%R in ('curl -s --max-time 2 "http://127.0.0.1:8400/command/wait%WS_QUERY%" 2^>nul') do (
    echo %%R | findstr /i "\"allReady\":true" >nul 2>&1
    if not errorlevel 1 (
        echo    All agents idle — safe to stop.
        goto :stop_services
    )
)

if %TRIES% lss 20 (
    echo    Still waiting... (%TRIES%/20)
    goto :wait_idle
)

echo    Timeout — proceeding with stop.

:stop_services
:: If workspace-scoped, don't kill coordinator
if defined WS_ARG (
    echo.
    echo  Workspace %WS_ARG% agents shut down. Coordinator still running.
    echo.
    pause
    exit /b 0
)

echo.
echo  Stopping coordinator...

:: Find and kill node processes on known ports
for %%P in (8400) do (
    for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":%%P "') do (
        taskkill /F /PID %%A >nul 2>&1
        if not errorlevel 1 (
            echo    Stopped process on port %%P (PID %%A)
        )
    )
)

echo.
echo  Shutdown complete.
echo.
pause
