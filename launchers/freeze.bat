@echo off
setlocal EnableDelayedExpansion
:: Usage: freeze.bat [workspace] [reason]
:: Issues a BUILD_FREEZE and waits for all agents to go idle
::   freeze.bat                     — global freeze
::   freeze.bat equihub             — freeze equihub only
::   freeze.bat equihub "deploying" — freeze with reason

set WS_ARG=%~1
set REASON=%~2
if "%REASON%"=="" set REASON=manual freeze

:: Check if first arg looks like a reason (contains spaces or no workspace match)
if "%WS_ARG%"=="" set WS_ARG=

echo.
echo  BUILD FREEZE
echo  =============
if defined WS_ARG (echo  Workspace: %WS_ARG%)
echo  Reason: %REASON%
echo.

curl -s http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running.
    exit /b 1
)

:: Build workspace JSON
if defined WS_ARG (
    set WS_JSON=,"workspace":"%WS_ARG%"
    set WS_QUERY=?workspace=%WS_ARG%
) else (
    set WS_JSON=
    set WS_QUERY=
)

:: Issue freeze
echo  Issuing BUILD_FREEZE...
curl -s -X POST http://127.0.0.1:8400/command -H "Content-Type: application/json" -d "{\"command\":\"BUILD_FREEZE\",\"reason\":\"%REASON%\"%WS_JSON%}" >nul

:: Wait for all workers to go idle
echo  Waiting for all agents to reach idle...
:wait_idle
timeout /t 2 /nobreak >nul
for /f "delims=" %%R in ('curl -s "http://127.0.0.1:8400/command/wait%WS_QUERY%" 2^>nul') do (
    echo %%R | findstr /i "\"allReady\":true" >nul 2>&1
    if not errorlevel 1 (
        goto :done
    )
)
echo  ...still waiting
goto :wait_idle

:done
echo.
echo  All agents idle. Safe to merge/build/deploy.
echo  Run resume.bat%WS_ARG: = % when done.
echo.
