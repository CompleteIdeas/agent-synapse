#!/usr/bin/env node
/**
 * Spawn a worker for a specific task.
 * Called by the coordinator via: node launchers/spawn-worker.cjs <name> <project-dir> <task>
 *
 * Opens a new Windows Terminal tab in the existing hive WT window.
 * The worker does the job and stays open for inspection.
 *
 * Model override: Reads role defaults from synapse.config.json "models" section.
 * Spawned workers use the "worker" role default (sonnet) unless overridden.
 *
 * Matches start-worker.bat behavior: cd to project dir, no --bare (workers
 * need hooks/MCP), GA channel syntax (--channels plugin:awm@agentsynapse).
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WINDOWS = process.platform === 'win32';

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

// Load config from synapse.config.json
let agentModel = '';
let channelsEnabled = false;
try {
  const mainConfig = JSON.parse(fs.readFileSync(path.join(synapseDir, 'synapse.config.json'), 'utf8'));
  agentModel = (mainConfig.models && mainConfig.models.worker) || '';
  channelsEnabled = !!(mainConfig.channels && mainConfig.channels.enabled);
} catch { /* no config — skip flags */ }

const systemPrompt = [
  `YOUR IDENTITY: You are ${workerName}.`,
  `Display [${workerName}] at the start of every response.`,
  `WORKER_NAME=${workerName}. WORKSPACE=${workspaceName}.`,
  `PROJECT DIRECTORY: ${projectDir}.`,
  `You were spawned for a SPECIFIC TASK.`,
  `Follow your agent protocol: checkin via POST /next, memory_restore, recall context, work on assignment, chain tasks until queue empty, then stop cleanly.`,
].join(' ');

// Detect agent type: if a .claude/agents/<name>.md exists, use that agent def
// Otherwise default to 'worker'. This lets Dev-Lead, code-reviewer, etc. use their own defs.
let agentType = 'worker';
const agentDefPath = path.join(synapseDir, '.claude', 'agents', `${workerName.toLowerCase()}.md`);
if (fs.existsSync(agentDefPath)) {
  agentType = workerName.toLowerCase();
}

// Copy agent definitions to project dir (same as launch-hive.cjs does)
// so Claude Code loads the project's context (skills, CLAUDE.md, git) but
// uses AgentSynapse's canonical agent defs.
const agentDefsSource = path.join(synapseDir, '.claude', 'agents');
const agentDefsDest = path.join(path.resolve(projectDir), '.claude', 'agents');
try {
  fs.mkdirSync(agentDefsDest, { recursive: true });
  for (const f of fs.readdirSync(agentDefsSource)) {
    if (f.endsWith('.md')) {
      fs.copyFileSync(path.join(agentDefsSource, f), path.join(agentDefsDest, f));
    }
  }
} catch { /* best effort — project may not have .claude dir */ }

const modelFlag = agentModel ? ` --model ${agentModel}` : '';
// GA channel syntax: --channels plugin:awm@agentsynapse (no --dangerously-load-development-channels)
const channelsFlag = channelsEnabled ? ` --channels plugin:awm@agentsynapse` : '';

if (IS_WINDOWS) {
  // Windows: generate .bat and launch via Windows Terminal
  const scriptPath = path.join(tmpDir, `spawn-${workerName.toLowerCase()}.bat`);
  let bat = '@echo off\r\n';
  bat += `cd /d "${path.resolve(projectDir)}"\r\n`;
  bat += `set WORKER_NAME=${workerName}\r\n`;
  bat += `set WORKSPACE=${workspaceName}\r\n`;
  bat += `set AWM_WORKSPACE=${workspaceName}\r\n`;
  bat += `set PROJECT_DIR=${projectDir}\r\n`;
  bat += `set SYNAPSE_DIR=${synapseDir}\r\n`;
  if (agentModel) bat += `set AGENT_MODEL=${agentModel}\r\n`;
  if (channelsEnabled) bat += `set CHANNELS_ENABLED=1\r\n`;
  bat += `claude --dangerously-skip-permissions${modelFlag}${channelsFlag} --agent ${agentType} --append-system-prompt "${systemPrompt}" "${task.replace(/"/g, '""')}"\r\n`;
  bat += `exit\r\n`;
  fs.writeFileSync(scriptPath, bat);

  try {
    spawn('wt', ['-w', wtWindowName, 'new-tab', '--title', `${workerName} [task]`, 'cmd', '/c', scriptPath],
      { detached: true, stdio: 'ignore' }).unref();
    console.log(JSON.stringify({ spawned: true, worker: workerName, window: wtWindowName, task: task.slice(0, 100), scriptPath }));
  } catch (err) {
    spawn('cmd', ['/c', 'start', `"${workerName}"`, 'cmd', '/c', scriptPath],
      { detached: true, stdio: 'ignore', shell: true }).unref();
    console.log(JSON.stringify({ spawned: true, worker: workerName, task: task.slice(0, 100), fallback: 'separate window' }));
  }
} else {
  // Unix: generate .sh and launch via available terminal emulator
  const scriptPath = path.join(tmpDir, `spawn-${workerName.toLowerCase()}.sh`);
  let sh = '#!/usr/bin/env bash\n';
  sh += `cd "${path.resolve(projectDir)}"\n`;
  sh += `export WORKER_NAME=${workerName}\n`;
  sh += `export WORKSPACE=${workspaceName}\n`;
  sh += `export AWM_WORKSPACE=${workspaceName}\n`;
  sh += `export PROJECT_DIR="${projectDir}"\n`;
  sh += `export SYNAPSE_DIR="${synapseDir}"\n`;
  if (agentModel) sh += `export AGENT_MODEL=${agentModel}\n`;
  if (channelsEnabled) sh += `export CHANNELS_ENABLED=1\n`;
  sh += `claude --dangerously-skip-permissions${modelFlag}${channelsFlag} --agent ${agentType} --append-system-prompt "${systemPrompt}" "${task.replace(/"/g, '\\"')}"\n`;
  fs.writeFileSync(scriptPath, sh, { mode: 0o755 });

  const hasGnome = (() => { try { execSync('which gnome-terminal', { stdio: 'pipe' }); return true; } catch { return false; } })();
  const hasXterm  = (() => { try { execSync('which xterm',         { stdio: 'pipe' }); return true; } catch { return false; } })();
  const hasMacos  = (() => { try { execSync('which osascript',     { stdio: 'pipe' }); return true; } catch { return false; } })();

  try {
    if (hasMacos) {
      const osa = `tell application "Terminal" to do script "bash '${scriptPath}'"`;
      spawn('osascript', ['-e', osa], { detached: true, stdio: 'ignore' }).unref();
    } else if (hasGnome) {
      spawn('gnome-terminal', ['--', '--title', `${workerName} [task]`, 'bash', scriptPath],
        { detached: true, stdio: 'ignore' }).unref();
    } else if (hasXterm) {
      spawn('xterm', ['-title', `${workerName} [task]`, '-e', `bash "${scriptPath}"; bash`],
        { detached: true, stdio: 'ignore' }).unref();
    } else {
      // Fallback: background process with log file
      const logPath = path.join(synapseDir, 'data', `${workerName.toLowerCase()}-spawn.log`);
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      const logFd = fs.openSync(logPath, 'a');
      spawn('bash', [scriptPath], { detached: true, stdio: ['ignore', logFd, logFd] }).unref();
      console.log(JSON.stringify({ spawned: true, worker: workerName, task: task.slice(0, 100), fallback: 'background', log: logPath }));
      process.exit(0);
    }
    console.log(JSON.stringify({ spawned: true, worker: workerName, task: task.slice(0, 100), scriptPath }));
  } catch (err) {
    // Last resort: background
    const logPath = path.join(synapseDir, 'data', `${workerName.toLowerCase()}-spawn.log`);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const logFd = fs.openSync(logPath, 'a');
    spawn('bash', [scriptPath], { detached: true, stdio: ['ignore', logFd, logFd] }).unref();
    console.log(JSON.stringify({ spawned: true, worker: workerName, task: task.slice(0, 100), fallback: 'background', log: logPath }));
  }
}
