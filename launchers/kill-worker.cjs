#!/usr/bin/env node
/**
 * Kill a specific worker by name.
 * Called by the coordinator via: node launchers/kill-worker.cjs <worker-name>
 *
 * Finds the worker's claude.exe process by matching WORKER_NAME in command line,
 * kills the process tree, then checks out the agent from AWM coordination.
 */

const { execSync } = require('child_process');
const http = require('http');

const IS_WINDOWS = process.platform === 'win32';
const AWM_PORT = 8400;

const workerName = process.argv[2];
if (!workerName) {
  console.log('Usage: node kill-worker.cjs <worker-name>');
  console.log('Example: node kill-worker.cjs Worker-A');
  process.exit(1);
}

/**
 * Find PIDs of processes whose command line contains WORKER_NAME=<name>
 */
function findWorkerPids(name) {
  const pids = [];
  try {
    if (IS_WINDOWS) {
      // Use WMIC to find claude.exe processes with matching worker identity in command line
      // The spawn script passes --append-system-prompt "YOUR IDENTITY: You are <name>..."
      const wmicOut = execSync(
        `wmic process where "Name='claude.exe' and CommandLine like '%You are ${name}.%'" get ProcessId /format:list`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      for (const line of wmicOut.split('\n')) {
        const match = line.match(/ProcessId=(\d+)/);
        if (match) pids.push(parseInt(match[1], 10));
      }
      // Also find cmd.exe running the spawn bat file (always, not just as fallback)
      try {
        const cmdOut = execSync(
          `wmic process where "Name='cmd.exe' and CommandLine like '%spawn-${name.toLowerCase()}%'" get ProcessId /format:list`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        for (const line of cmdOut.split('\n')) {
          const match = line.match(/ProcessId=(\d+)/);
          if (match) {
            const cmdPid = parseInt(match[1], 10);
            if (!pids.includes(cmdPid)) pids.push(cmdPid);
          }
        }
      } catch { /* no cmd matches */ }
    } else {
      // Unix: use pgrep
      try {
        const pgrepOut = execSync(`pgrep -f "You are ${name}."`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        for (const line of pgrepOut.trim().split('\n')) {
          const pid = parseInt(line.trim(), 10);
          if (pid) pids.push(pid);
        }
      } catch { /* no matches */ }
    }
  } catch { /* query failed */ }
  return pids;
}

/**
 * Kill a process tree
 */
function killProcess(pid) {
  try {
    if (IS_WINDOWS) {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    } else {
      execSync(`kill -9 ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Look up agent in AWM by name and check it out
 */
function checkoutAgent(name) {
  return new Promise((resolve) => {
    // First get the agent ID from /workers
    const req = http.get(`http://127.0.0.1:${AWM_PORT}/workers`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const worker = (json.workers || []).find(w => w.name === name);
          if (!worker) {
            resolve({ checkedOut: false, reason: 'not found in AWM' });
            return;
          }
          // POST /checkout
          const body = JSON.stringify({ agentId: worker.id });
          const coReq = http.request({
            hostname: '127.0.0.1', port: AWM_PORT, path: '/checkout',
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, (coRes) => {
            let coData = '';
            coRes.on('data', (chunk) => coData += chunk);
            coRes.on('end', () => resolve({ checkedOut: true, agentId: worker.id, response: coData }));
          });
          coReq.on('error', () => resolve({ checkedOut: false, reason: 'checkout request failed' }));
          coReq.write(body);
          coReq.end();
        } catch {
          resolve({ checkedOut: false, reason: 'parse error' });
        }
      });
    });
    req.on('error', () => resolve({ checkedOut: false, reason: 'AWM unreachable' }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ checkedOut: false, reason: 'timeout' }); });
  });
}

async function main() {
  const result = { worker: workerName, killed: false, pidsFound: 0, checkedOut: false };

  // Step 1: Find and kill processes
  const pids = findWorkerPids(workerName);
  result.pidsFound = pids.length;

  if (pids.length > 0) {
    let killed = 0;
    for (const pid of pids) {
      if (killProcess(pid)) killed++;
    }
    result.killed = killed > 0;
    result.pidsKilled = killed;
  }

  // Step 2: Checkout from AWM (clean up coordination state)
  const checkout = await checkoutAgent(workerName);
  result.checkedOut = checkout.checkedOut;
  if (checkout.agentId) result.agentId = checkout.agentId;
  if (checkout.reason) result.checkoutNote = checkout.reason;

  console.log(JSON.stringify(result));
}

main();
