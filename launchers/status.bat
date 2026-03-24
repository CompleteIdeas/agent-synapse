@echo off
:: Usage: status.bat [workspace]
::   status.bat           — show all agents
::   status.bat equihub   — show equihub agents only

echo.
echo  === AgentSynapse Status ===
echo.

curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running on port 8410
    echo  Run start-coordinator.bat or start-all.bat first
    exit /b 1
)

if not "%~1"=="" (
    echo  Workspace: %~1
    echo.
    echo  Workers:
    curl -s "http://127.0.0.1:8410/workers?workspace=%~1" 2>nul
    echo.
) else (
    curl -s http://127.0.0.1:8410/status 2>nul
    echo.
)
echo.
