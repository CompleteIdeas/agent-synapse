@echo off
setlocal EnableDelayedExpansion
:: AgentSynapse Menu Launcher
:: Interactive menu to select a workspace or set up a new one.

set LAUNCHER_DIR=%~dp0
set SYNAPSE_DIR=%~dp0..

:menu
cls
echo.
echo   ================================================
echo       AgentSynapse Launcher
echo   ================================================
echo.

:: Read workspaces into arrays
set WS_COUNT=0
for /f "tokens=1,2,3,4,5,6 delims==" %%A in ('node "%LAUNCHER_DIR%resolve-workspace.js" --list 2^>nul') do (
    set /a WS_COUNT+=1
    set "WS_NUM_%%A=%%B"
    set "WS_LABEL_%%A=%%C"
    set "WS_DIR_%%A=%%D"
    set "WS_WORKERS_%%A=%%E"
    set "WS_DEVLEAD_%%A=%%F"
    set "WS_IDX_!WS_COUNT!=%%B"
)

if !WS_COUNT! equ 0 (
    echo   No workspaces configured.
    echo.
    goto :setup_new
)

:: Display workspace list
echo   Available workspaces:
echo.
set DISPLAY_IDX=0
for /f "tokens=1,2,3,4,5,6 delims==" %%A in ('node "%LAUNCHER_DIR%resolve-workspace.js" --list 2^>nul') do (
    set /a DISPLAY_IDX+=1
    echo     !DISPLAY_IDX!^)  %%C
    echo         Dir:      %%D
    echo         Workers:  %%E    Dev-Lead: %%F
    echo.
)

set /a NEXT_IDX=WS_COUNT+1
echo     !NEXT_IDX!^)  + Set up new workspace
echo.
echo     S^)  Status dashboard
echo     Q^)  Quit
echo.

:: Check service status
curl -s http://127.0.0.1:8410/health >nul 2>&1
if !errorlevel! equ 0 (
    echo   [Coordinator: RUNNING]
) else (
    echo   [Coordinator: STOPPED]
)
echo.

:: Prompt
set "CHOICE="
set /p "CHOICE=  Select [1-%NEXT_IDX%, S, Q]: "

if /i "!CHOICE!"=="Q" goto :eof
if /i "!CHOICE!"=="S" goto :status

:: Check if it's the "new workspace" option
if "!CHOICE!"=="!NEXT_IDX!" goto :setup_new

:: Validate numeric choice
set /a CHOICE_NUM=!CHOICE! 2>nul
if !CHOICE_NUM! lss 1 (
    echo.
    echo   Invalid choice.
    timeout /t 2 /nobreak >nul
    goto :menu
)
if !CHOICE_NUM! gtr !WS_COUNT! (
    echo.
    echo   Invalid choice.
    timeout /t 2 /nobreak >nul
    goto :menu
)

:: Resolve the selected workspace name
set PICK_IDX=0
set "SELECTED_WS="
for /f "tokens=1,2,3,4,5,6 delims==" %%A in ('node "%LAUNCHER_DIR%resolve-workspace.js" --list 2^>nul') do (
    set /a PICK_IDX+=1
    if !PICK_IDX! equ !CHOICE_NUM! set "SELECTED_WS=%%B"
)

if not defined SELECTED_WS (
    echo   Could not resolve workspace.
    timeout /t 2 /nobreak >nul
    goto :menu
)

:: Launch submenu for selected workspace
goto :ws_menu

:: ============================================================
:ws_menu
cls
echo.
echo   ================================================
echo       Workspace: !SELECTED_WS!
echo   ================================================
echo.
echo     1^)  Start All     (coordinator + AWM log + hive)
echo     2^)  Start Hive    (agents only, coordinator must be running)
echo     3^)  Start Services (coordinator + AWM only, no agents)
echo     4^)  Status
echo     5^)  Freeze        (halt all work)
echo     6^)  Resume        (clear freeze)
echo     7^)  Shutdown      (graceful stop)
echo.
echo     B^)  Back to main menu
echo     Q^)  Quit
echo.

set "WSCHOICE="
set /p "WSCHOICE=  Select [1-7, B, Q]: "

if /i "!WSCHOICE!"=="Q" goto :eof
if /i "!WSCHOICE!"=="B" goto :menu

if "!WSCHOICE!"=="1" (
    echo.
    echo   Starting all services for !SELECTED_WS!...
    echo.
    call "%LAUNCHER_DIR%start-all.bat" !SELECTED_WS!
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)
if "!WSCHOICE!"=="2" (
    echo.
    echo   Starting hive for !SELECTED_WS!...
    echo.
    call "%LAUNCHER_DIR%start-hive.bat" !SELECTED_WS!
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)
if "!WSCHOICE!"=="3" (
    echo.
    echo   Starting services only...
    echo.
    call "%LAUNCHER_DIR%start-coordinator.bat"
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)
if "!WSCHOICE!"=="4" (
    echo.
    call "%LAUNCHER_DIR%status.bat" !SELECTED_WS!
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)
if "!WSCHOICE!"=="5" (
    set "FREEZE_REASON="
    set /p "FREEZE_REASON=  Freeze reason (optional): "
    echo.
    call "%LAUNCHER_DIR%freeze.bat" !SELECTED_WS! !FREEZE_REASON!
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)
if "!WSCHOICE!"=="6" (
    echo.
    call "%LAUNCHER_DIR%resume.bat" !SELECTED_WS!
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)
if "!WSCHOICE!"=="7" (
    echo.
    call "%LAUNCHER_DIR%shutdown.bat" !SELECTED_WS!
    echo.
    echo   Press any key to return to menu...
    pause >nul
    goto :ws_menu
)

echo   Invalid choice.
timeout /t 2 /nobreak >nul
goto :ws_menu

:: ============================================================
:setup_new
cls
echo.
echo   ================================================
echo       Set Up New Workspace
echo   ================================================
echo.

set "NEW_NAME="
set /p "NEW_NAME=  Workspace name (short, no spaces, e.g. client-x): "
if not defined NEW_NAME goto :menu

set "NEW_DIR="
set /p "NEW_DIR=  Project directory (full path, e.g. C:\Users\robert\project\ClientX): "
if not defined NEW_DIR goto :menu

set "NEW_LABEL="
set /p "NEW_LABEL=  Display label (e.g. Client X Project): "
if not defined NEW_LABEL set "NEW_LABEL=!NEW_NAME!"

set "NEW_WORKERS=3"
set /p "NEW_WORKERS=  Number of workers [3]: "

set "NEW_DEVLEAD=1"
set /p "NEW_DEVLEAD=  Include Dev-Lead? (1=yes, 0=no) [1]: "

set "NEW_ORCH=1"
set /p "NEW_ORCH=  Include Orchestrator? (1=yes, 0=no) [1]: "

echo.
echo   Creating workspace: !NEW_NAME!
echo     Dir:          !NEW_DIR!
echo     Label:        !NEW_LABEL!
echo     Workers:      !NEW_WORKERS!
echo     Dev-Lead:     !NEW_DEVLEAD!
echo     Orchestrator: !NEW_ORCH!
echo.

node "%LAUNCHER_DIR%resolve-workspace.js" --add "!NEW_NAME!" "!NEW_DIR!" "!NEW_LABEL!" !NEW_WORKERS! !NEW_DEVLEAD! !NEW_ORCH! 2>&1
if !errorlevel! equ 0 (
    echo.
    echo   Workspace created! You can now select it from the main menu.
) else (
    echo.
    echo   Failed to create workspace. Check the error above.
)

echo.
echo   Press any key to return to menu...
pause >nul
goto :menu

:: ============================================================
:status
cls
echo.
echo   ================================================
echo       AgentSynapse Status
echo   ================================================
echo.
call "%LAUNCHER_DIR%status.bat"
echo.
echo   Press any key to return to menu...
pause >nul
goto :menu
