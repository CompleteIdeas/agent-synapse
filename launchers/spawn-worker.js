#!/usr/bin/env node
/**
 * Spawn a worker for a specific task.
 * Called by the orchestrator via: node launchers/spawn-worker.js <name> <project-dir> <task>
 *
 * Opens a new Windows Terminal tab with a Claude worker that has a specific task prompt.
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
  console.log('Usage: node spawn-worker.js <worker-name> <project-dir> <task...>');
  console.log('Example: node spawn-worker.js Worker-B "C:\\Users\\robert\\Personal-Projects" Run the AWM edge-case tests');
  process.exit(1);
}

const synapseDir = path.resolve(__dirname, '..');
const tmpDir = path.join(os.tmpdir(), 'agentsynapse-spawn');
fs.mkdirSync(tmpDir, { recursive: true });

// Write temp launcher script
const scriptPath = path.join(tmpDir, `spawn-${workerName.toLowerCase()}.bat`);
const systemPrompt = [
  `YOUR IDENTITY: You are ${workerName}.`,
  `Display [${workerName}] at the start of every response.`,
  `WORKER_NAME=${workerName}.`,
  `PROJECT DIRECTORY: ${projectDir}.`,
  `You were spawned by the orchestrator for a SPECIFIC TASK.`,
  `Complete it thoroughly, then report results by updating the assignment status via the coordinator API.`,
  `When done, checkin as idle and say TASK COMPLETE with a summary.`,
].join(' ');

let bat = '@echo off\r\n';
bat += `cd /d "${synapseDir}"\r\n`;
bat += `set WORKER_NAME=${workerName}\r\n`;
bat += `set PROJECT_DIR=${projectDir}\r\n`;
bat += `claude --dangerously-skip-permissions --agent worker --append-system-prompt "${systemPrompt}" "${task.replace(/"/g, '""')}"\r\n`;

fs.writeFileSync(scriptPath, bat);

// Launch in Windows Terminal (add to existing window if open, or create new)
try {
  spawn('wt', [
    '-w', 'AgentSynapse-Personal',
    'new-tab',
    '--title', `${workerName} [task]`,
    'cmd', '/k', scriptPath,
  ], { detached: true, stdio: 'ignore' }).unref();

  console.log(JSON.stringify({
    spawned: true,
    worker: workerName,
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
