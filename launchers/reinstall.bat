@echo off
:: AgentSynapse Reinstall Script
:: Run this from your project folder (e.g. C:\Users\jason\claude_project)

echo.
echo  AgentSynapse Reinstall
echo  ======================
echo.

:: Check we're in a project directory
if not exist "package.json" (
    echo  ERROR: Run this from your project folder (where package.json is).
    echo  Example: cd C:\Users\jason\claude_project
    pause
    exit /b 1
)

:: Step 1: Clean npm cache
echo  [1/5] Cleaning npm cache...
call npm cache clean --force >nul 2>&1
echo        Done.

:: Step 2: Reinstall from git
echo  [2/5] Installing latest AgentSynapse from GitHub...
call npm install -g "git+https://github.com/CompleteIdeas/agent-synapse.git"
if %errorlevel% neq 0 (
    echo  ERROR: npm install failed.
    pause
    exit /b 1
)
echo        Done.

:: Step 3: Remove old generated files so init regenerates them
echo  [3/5] Removing old config files...
if exist "launchers" rmdir /s /q launchers 2>nul
if exist ".claude\settings.json" del /q ".claude\settings.json" 2>nul
if exist ".claude\mcp.json" del /q ".claude\mcp.json" 2>nul
echo        Done.

:: Step 4: Re-run init
echo  [4/5] Running agent-synapse init...
call npx agent-synapse init
echo.

:: Step 5: Verify
echo  [5/5] Verifying install...
echo.
if exist "launchers\start-all.bat" (
    echo    OK  launchers\start-all.bat
) else (
    echo    MISSING  launchers\start-all.bat
)
if exist ".claude\settings.json" (
    echo    OK  .claude\settings.json
) else (
    echo    MISSING  .claude\settings.json
)
if exist ".claude\mcp.json" (
    echo    OK  .claude\mcp.json
) else (
    echo    MISSING  .claude\mcp.json
)
if exist ".claude\agents\worker.md" (
    echo    OK  .claude\agents\worker.md
) else (
    echo    MISSING  .claude\agents\worker.md
)
if exist ".claude\agents\orchestrator.md" (
    echo    OK  .claude\agents\orchestrator.md
) else (
    echo    MISSING  .claude\agents\orchestrator.md
)

echo.
echo  Reinstall complete! Next:
echo    launchers\start-all.bat
echo.
pause
