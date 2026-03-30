@echo off
:: Legacy entrypoint — redirects to launch-hive.cjs
:: Use start-all-work.bat or start-all-personal.bat instead.
cd /d "%~dp0"
if not "%~1"=="" (
    echo  start-hive.bat is deprecated. Use: node launch-hive.cjs [workspace]
    echo  Trying to launch with argument: %~1
    node launch-hive.cjs %*
) else (
    echo  start-hive.bat is deprecated. Use one of:
    echo    start-all-work.bat       — launch work workspace
    echo    start-all-personal.bat   — launch personal workspace
    echo    node launch-hive.cjs     — interactive menu
    echo.
    node launch-hive.cjs
)
