@echo off
:: Usage: findings.bat [workspace]
::   findings.bat           — show all findings
::   findings.bat equihub   — show findings (future: workspace filter)

echo.
echo  === Hive Findings ===
echo.

curl -s http://127.0.0.1:8400/health >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Coordinator not running.
    exit /b 1
)

echo  --- Summary ---
curl -s http://127.0.0.1:8400/findings/summary 2>nul | python -m json.tool

echo.
echo  --- Open Findings (top 20) ---
curl -s "http://127.0.0.1:8400/findings?status=open&limit=20" 2>nul | python -m json.tool
echo.
