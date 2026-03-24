#!/usr/bin/env node
/**
 * Spawn a worker for a specific task.
 * Called by the coordinator via: node launchers/spawn-worker.cjs <name> <project-dir> <task>
 *
 * Opens a new Windows Terminal tab in the existing hive WT window.
 * The worker does the job and stays open for inspection.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const workerName = process.argv[2];
const projectDir = process.argv[3];
const task = process.argv.slice(4).join(' ');

if (!workerName || !task) {
  console.log('Usage: node spawn-worker.cjs <worker-name> <project-dir> <task...>');
  console.log('Example: node spawn-worker.cjs Worker-B "C:\\Users\\robert\\Personal-Projects" Run the AWM edge-case tests');
  process.exit(1);
}

const synapseDir = path.resolve(__dirname, '..');
const tmpDir = path.join(os.tmpdir(), 'agentsynapse-spawn');
fs.mkdirSync(tmpDir, { recursive: true });

// Derive WT window name from project dir (reads workspace config from synapse.config.json)
const resolvedDir = path.resolve(projectDir);
let workspaceName = 'DEFAULT';
try {
  const wsConfig = JSON.parse(fs.readFileSync(path.join(synapseDir, 'synapse.workspaces.json'), 'utf8'));
  const workspaces = wsConfig.workspaces || {};
  for (const [, ws] of Object.entries(workspaces)) {
    if (path.resolve(ws.projectDir).toLowerCase() === resolvedDir.toLowerCase()) {
      workspaceName = ws.name;
      break;
    }
  }
} catch { /* config read failed — use default */ }
const wtWindowName = `AgentSynapse-${workspaceName}`;

// Write temp launcher script
const scriptPath = path.join(tmpDir, `spawn-${workerName.toLowerCase()}.bat`);
const systemPrompt = [
  `YOUR IDENTITY: You are ${workerName}.`,
  `Display [${workerName}] at the start of every response.`,
  `WORKER_NAME=${workerName}.`,
  `PROJECT DIRECTORY: ${projectDir}.`,
  `You were spawned by the coordinator for a SPECIFIC TASK.`,
  `Complete it thoroughly, then report results by updating the assignment status via the coordination API on AWM (port 8400).`,
  `When done, checkin as idle and say TASK COMPLETE with a summary.`,
].join(' ');

let bat = '@echo off\r\n';
bat += `cd /d "${synapseDir}"\r\n`;
bat += `set WORKER_NAME=${workerName}\r\n`;
bat += `set PROJECT_DIR=${projectDir}\r\n`;
bat += `claude --dangerously-skip-permissions --agent worker --append-system-prompt "${systemPrompt}" "${task.replace(/"/g, '""')}"\r\n`;

fs.writeFileSync(scriptPath, bat);

// Launch in Windows Terminal — join existing hive window as a new tab
try {
  spawn('wt', [
    '-w', wtWindowName,
    'new-tab',
    '--title', `${workerName} [task]`,
    'cmd', '/k', scriptPath,
  ], { detached: true, stdio: 'ignore' }).unref();

  console.log(JSON.stringify({
    spawned: true,
    worker: workerName,
    window: wtWindowName,
    task: task.slice(0, 100),
    scriptPath,
  }));
} catch (err) {
  // Fallback: separate window
  spawn('cmd', ['/c', 'start', `"${workerName}"`, 'cmd', '/k', scriptPath], {
    detached: true, stdio: 'ignore', shell: true,
  }).unref();

  console.log(JSON.stringify({
    spawned: true,
    worker: workerName,
    task: task.slice(0, 100),
    fallback: 'separate window',
  }));
}
