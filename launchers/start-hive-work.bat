@echo off
:: Launches hive for WORK workspace: coordinator + dev-lead + 3 workers
:: Coordinator must already be running.

echo.
echo  AgentSynapse Hive — WORK
echo  =========================
echo.

set LAUNCHER_DIR=%~dp0
set PROJECT_DIR=C:\Users\robert\project
set WORKSPACE=WORK

echo  Project: %PROJECT_DIR%
echo.

:: Check coordinator is running
curl -s http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running! Start services first.
    exit /b 1
)

echo  Coordinator OK. Launching 5 agents...
echo.

:: Check for Windows Terminal
where wt >nul 2>&1
if %errorlevel% equ 0 (
    wt new-tab --title "Coordinator [work]" cmd /k "%LAUNCHER_DIR%start-worker.bat coordinator %PROJECT_DIR%" ; ^
       new-tab --title "Dev-Lead [work]" cmd /k "timeout /t 5 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat dev-lead %PROJECT_DIR%" ; ^
       new-tab --title "Worker-A [work]" cmd /k "timeout /t 8 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%" ; ^
       new-tab --title "Worker-B [work]" cmd /k "timeout /t 11 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%" ; ^
       new-tab --title "Worker-C [work]" cmd /k "timeout /t 14 /nobreak >nul && %LAUNCHER_DIR%start-worker.bat Worker-C %PROJECT_DIR%"
) else (
    start "Coordinator [work]" cmd /k "%LAUNCHER_DIR%start-worker.bat coordinator %PROJECT_DIR%"
    timeout /t 5 /nobreak >nul
    start "Dev-Lead [work]" cmd /k "%LAUNCHER_DIR%start-worker.bat dev-lead %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-A [work]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-A %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-B [work]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-B %PROJECT_DIR%"
    timeout /t 3 /nobreak >nul
    start "Worker-C [work]" cmd /k "%LAUNCHER_DIR%start-worker.bat Worker-C %PROJECT_DIR%"
)

echo.
echo  Work hive launched (5 agents):
echo    Coordinator + Dev-Lead + Worker-A + Worker-B + Worker-C
echo  Project: %PROJECT_DIR%
echo.