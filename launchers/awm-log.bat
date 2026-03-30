@echo off
title AWM Log Viewer
echo.
echo  AWM Activity Log
echo  =================
echo.

:: Log is written to data/awm.log by launch-hive.cjs
set LOG_FILE=%~dp0..\data\awm.log

echo  Log: %LOG_FILE%

:: Wait for the log file to exist (up to 60 seconds)
if exist "%LOG_FILE%" goto :tail_log
echo  Waiting for log file...
echo.
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
