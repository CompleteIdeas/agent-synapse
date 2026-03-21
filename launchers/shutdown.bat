@echo off
:: Graceful shutdown: broadcast SHUTDOWN to agents, wait for idle, then stop services
:: Usage: shutdown.bat [--now]

echo.
echo  AgentSynapse Graceful Shutdown
echo  ==============================
echo.

:: Check if coordinator is running
curl -s --max-time 2 http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  Coordinator not running — nothing to shut down.
    echo.
    pause
    exit /b 0
)

:: Step 1: Show current hive status
echo  Current hive status:
curl -s http://127.0.0.1:8410/status 2>nul
echo.
echo.

:: Step 2: Broadcast SHUTDOWN command
echo  Broadcasting SHUTDOWN to all agents...
curl -s -X POST http://127.0.0.1:8410/command -H "Content-Type: application/json" -d "{\"command\":\"SHUTDOWN\",\"reason\":\"graceful shutdown via launcher\",\"issuedBy\":\"cli\"}" >nul 2>&1
if %errorlevel% equ 0 (
    echo    SHUTDOWN broadcast sent.
) else (
    echo    WARNING: Failed to broadcast SHUTDOWN.
)
echo.

:: Step 3: Skip wait if --now
if /i "%~1"=="--now" (
    echo  --now flag: skipping wait.
    goto :stop_services
)

:: Step 4: Wait for agents to go idle (up to 60 seconds)
echo  Waiting for agents to finish up (up to 60s)...
set TRIES=0

:wait_idle
timeout /t 3 /nobreak >nul
set /a TRIES+=1

:: Check if all agents are idle
for /f "delims=" %%R in ('curl -s --max-time 2 "http://127.0.0.1:8410/command/wait?status=idle" 2^>nul') do (
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
echo.
echo  Stopping services...

:: Kill coordinator
for /f "delims=" %%P in ('curl -s http://127.0.0.1:8410/health 2^>nul ^| findstr /r "."') do (
    echo    Shutting down coordinator...
)

:: Find and kill node processes on known ports
for %%P in (8410 8420 8400) do (
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
