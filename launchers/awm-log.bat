@echo off
title AWM Log Viewer
echo.
echo  AWM Activity Log
echo  =================
echo.

:: Find AWM log file — check known locations
if exist "%~dp0..\packages\memory\data\awm.log" (
    set LOG_FILE=%~dp0..\packages\memory\data\awm.log
) else if exist "%~dp0..\node_modules\agent-synapse\packages\memory\data\awm.log" (
    set LOG_FILE=%~dp0..\node_modules\agent-synapse\packages\memory\data\awm.log
) else (
    :: Try npm global install location
    for /f "delims=" %%G in ('npm root -g 2^>nul') do (
        if exist "%%G\agent-synapse\packages\memory\data\awm.log" (
            set LOG_FILE=%%G\agent-synapse\packages\memory\data\awm.log
        )
    )
    :: Default to project data dir if nothing else found
    if not defined LOG_FILE set LOG_FILE=%~dp0..\data\awm.log
)

echo  Log: %LOG_FILE%
echo  Waiting for log file...
echo.

:: Wait for the log file to exist (up to 60 seconds)
set TRIES=0
:wait_log
if exist "%LOG_FILE%" goto :tail_log
timeout /t 2 /nobreak >nul
set /a TRIES+=1
if %TRIES% lss 30 goto :wait_log
echo  WARNING: Log file not created yet. AWM may not be running.
echo  Expected: %LOG_FILE%
echo.
echo  Press any key to keep waiting, or Ctrl+C to exit.
pause >nul
goto :wait_log

:tail_log
echo  === Tailing AWM log (Ctrl+C to stop) ===
echo.
powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 50 -Wait | ForEach-Object { $line = $_; if ($line -match '\| write \|') { Write-Host $line -ForegroundColor Green } elseif ($line -match '\| recall \|') { Write-Host $line -ForegroundColor Cyan } elseif ($line -match '\| retract \|') { Write-Host $line -ForegroundColor Red } elseif ($line -match '\| feedback \|') { Write-Host $line -ForegroundColor Yellow } elseif ($line -match '\| startup \|') { Write-Host $line -ForegroundColor Magenta } else { Write-Host $line } }"
