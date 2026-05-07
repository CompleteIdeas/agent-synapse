@echo off
cd /d "C:\Users\robert\Personal-Projects\AgentSynapse\packages\awm"
set AWM_COORDINATION=true
set WORKER_ROLE=coordinator
set WORKSPACE=WORK
echo Launching AWM 0.7.4 on http://127.0.0.1:8400
echo WORKER_ROLE=%WORKER_ROLE% WORKSPACE=%WORKSPACE%
echo Press Ctrl+C to stop
npx tsx src/index.ts
