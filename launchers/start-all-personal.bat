@echo off
:: Start AgentSynapse for PERSONAL workspace
:: Ensures coordinator is running, then launches personal hive.

set LAUNCHER_DIR=%~dp0
set SYNAPSE_DIR=%~dp0..

echo.
echo  AgentSynapse - PERSONAL Projects
echo  ==================================
echo.

:: Ensure coordinator is running
curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% equ 0 (
    echo  Coordinator: running
    goto :launch
)

echo  Coordinator: starting...
start "" cmd /c "cd /d %SYNAPSE_DIR% && npx tsx packages/coordinator/src/index.ts"

:wait_coord
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8410/health >nul 2>&1
if %errorlevel% equ 0 goto :launch
goto :wait_coord

:launch
echo  Launching personal hive...
echo.
call "%LAUNCHER_DIR%start-hive-personal.bat"