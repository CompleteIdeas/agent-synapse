@echo off
:: AgentSynapse Setup — Run once per machine
:: Registers the local marketplace and installs the AWM channel plugin
::
:: Usage: setup.bat
:: Requires: Claude Code CLI (claude) installed and authenticated

echo.
echo  AgentSynapse Setup
echo  ====================
echo.

:: Check claude is available
where claude >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Claude Code CLI not found.
    echo  Install from: https://claude.ai/download
    echo.
    pause
    exit /b 1
)

:: Get script directory (AgentSynapse root)
set SYNAPSE_DIR=%~dp0
:: Remove trailing backslash
if "%SYNAPSE_DIR:~-1%"=="\" set SYNAPSE_DIR=%SYNAPSE_DIR:~0,-1%

echo  [1/4] Checking Claude Code version...
claude --version 2>&1
echo.

:: Register local marketplace
echo  [2/4] Registering AgentSynapse marketplace...
claude plugin marketplace add "%SYNAPSE_DIR%\marketplace" 2>&1
echo.

:: Install AWM channel plugin
echo  [3/4] Installing AWM channel plugin...
claude plugin install awm@agentsynapse 2>&1
echo.

:: Verify
echo  [4/4] Verifying installation...
claude plugin list 2>&1 | findstr /i "awm"
if %errorlevel% equ 0 (
    echo.
    echo  ========================================
    echo  Setup complete!
    echo.
    echo  To launch the work hive:
    echo    %SYNAPSE_DIR%\launchers\start-all-work.bat
    echo.
    echo  To launch the personal hive:
    echo    %SYNAPSE_DIR%\launchers\start-all-personal.bat
    echo.
    echo  To check status:
    echo    curl http://127.0.0.1:8400/workers
    echo  ========================================
) else (
    echo.
    echo  WARNING: AWM plugin not found in plugin list.
    echo  Try running setup again or check for errors above.
)
echo.
pause
