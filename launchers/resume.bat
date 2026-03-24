@echo off
:: Usage: resume.bat [workspace]
::   resume.bat           — resume all workspaces
::   resume.bat equihub   — resume equihub only

echo.
echo  Resuming agents...
echo.

curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running.
    exit /b 1
)

if not "%~1"=="" (
    curl -s -X POST http://127.0.0.1:8410/command -H "Content-Type: application/json" -d "{\"command\":\"RESUME\",\"workspace\":\"%~1\"}" >nul
    echo  RESUME issued for workspace: %~1
) else (
    curl -s -X POST http://127.0.0.1:8410/command -H "Content-Type: application/json" -d "{\"command\":\"RESUME\"}" >nul
    echo  RESUME issued. All agents cleared to work.
)
echo.
