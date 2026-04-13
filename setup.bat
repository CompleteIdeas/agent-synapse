@echo off
:: AgentSynapse Setup — Run once per machine
:: Creates workspace config, registers marketplace, installs AWM channel plugin
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

:: =============================================
:: Step 1: Create synapse.workspaces.json
:: =============================================
echo  [1/5] Checking workspace configuration...

if exist "%SYNAPSE_DIR%\synapse.workspaces.json" (
    echo  Found existing synapse.workspaces.json — skipping.
    echo.
) else (
    echo  No synapse.workspaces.json found. Creating one now...
    echo.

    :: Detect current Windows username
    set "CURRENT_USER=%USERNAME%"
    echo  Detected Windows user: %USERNAME%
    echo.

    :: Ask for project directory
    set "DEFAULT_PROJECT_DIR=C:\Users\%USERNAME%\project"
    set /p "PROJECT_DIR=  Project directory [%DEFAULT_PROJECT_DIR%]: "
    if "%PROJECT_DIR%"=="" set "PROJECT_DIR=%DEFAULT_PROJECT_DIR%"

    :: Ask for number of workers
    set "NUM_WORKERS=2"
    set /p "NUM_WORKERS=  Number of worker agents [2]: "
    if "%NUM_WORKERS%"=="" set "NUM_WORKERS=2"

    :: Build the JSON config
    echo  Generating synapse.workspaces.json...

    > "%SYNAPSE_DIR%\synapse.workspaces.json" (
        echo {
        echo   "workspaces": {
        echo     "work": {
        echo       "name": "WORK",
        echo       "projectDir": "%PROJECT_DIR:\=\\%",
        echo       "agents": [
        echo         { "name": "coordinator", "role": "coordinator", "delay": 0 },
        echo         { "name": "Dev-Lead", "role": "dev-lead", "delay": 5 }
    )

    :: Add worker agents
    set /a DELAY=8
    set /a WORKER_NUM=0
    set "LETTERS=ABCDEFGH"

    :worker_loop
    if %WORKER_NUM% geq %NUM_WORKERS% goto worker_done
    set /a IDX=%WORKER_NUM%
    call set "LETTER=%%LETTERS:~%IDX%,1%%"
    >> "%SYNAPSE_DIR%\synapse.workspaces.json" (
        echo         ,{ "name": "Worker-%LETTER%", "role": "worker", "delay": %DELAY% }
    )
    set /a WORKER_NUM+=1
    set /a DELAY+=3
    goto worker_loop

    :worker_done
    >> "%SYNAPSE_DIR%\synapse.workspaces.json" (
        echo       ]
        echo     }
        echo   }
        echo }
    )

    echo.
    echo  Created synapse.workspaces.json:
    echo    Project dir: %PROJECT_DIR%
    echo    Agents: coordinator + dev-lead + %NUM_WORKERS% workers
    echo.
)

:: =============================================
:: Step 2-5: Claude plugin setup
:: =============================================
echo  [2/5] Checking Claude Code version...
claude --version 2>&1
echo.

:: Register local marketplace
echo  [3/5] Registering AgentSynapse marketplace...
claude plugin marketplace add "%SYNAPSE_DIR%\marketplace" 2>&1
echo.

:: Install AWM channel plugin
echo  [4/5] Installing AWM channel plugin...
claude plugin install awm@agentsynapse 2>&1
echo.

:: Verify
echo  [5/5] Verifying installation...
claude plugin list 2>&1 | findstr /i "awm"
if %errorlevel% equ 0 (
    echo.
    echo  ========================================
    echo  Setup complete!
    echo.
    echo  IMPORTANT — Claude Team admin must configure:
    echo    Go to: https://claude.ai/admin-settings/claude-code
    echo    Add to managed settings:
    echo      "channelsEnabled": true
    echo      "allowedChannelPlugins": [
    echo        { "marketplace": "agentsynapse", "plugin": "awm" }
    echo      ]
    echo.
    echo  Without this, agents won't receive push notifications.
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
