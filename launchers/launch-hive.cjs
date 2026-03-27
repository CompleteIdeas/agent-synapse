#!/usr/bin/env node
/**
 * AgentSynapse Hive Launcher
 *
 * Usage:
 *   node launch-hive.js personal    — launches personal workspace hive
 *   node launch-hive.js work        — launches work workspace hive
 *   node launch-hive.js             — interactive menu
 *
 * Model overrides:
 *   Each agent can have a "model" field in synapse.workspaces.json (per-agent)
 *   or fall back to role defaults in synapse.config.json "models" section.
 *   The model is passed to start-worker.bat via AGENT_MODEL env var.
 *
 * --bare flag (Claude Code v2.1.81+):
 *   Use --bare for scripted -p calls that skip hooks/LSP/plugins/skills.
 *   Faster execution for non-interactive single-prompt invocations.
 *   NOT used for hive agents (they need hooks for file-lock checking, compaction, etc).
 *   Use case: coordinator spawning quick one-shot queries like:
 *     claude --bare -p "Summarize this file"
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const fs = require('fs');

const SYNAPSE_DIR = path.resolve(__dirname, '..');

// Load config from synapse.config.json
let MODEL_DEFAULTS = {};
let CHANNELS_ENABLED = false;
try {
  const mainConfig = JSON.parse(fs.readFileSync(path.join(SYNAPSE_DIR, 'synapse.config.json'), 'utf8'));
  MODEL_DEFAULTS = mainConfig.models || {};
  CHANNELS_ENABLED = !!(mainConfig.channels && mainConfig.channels.enabled);
} catch { /* use empty defaults */ }

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
const LAUNCHER_DIR = __dirname;

// Load workspace config from synapse.workspaces.json (user-specific, gitignored)
const wsConfigPath = path.join(SYNAPSE_DIR, 'synapse.workspaces.json');
let WORKSPACES = {};
try {
  const wsConfig = JSON.parse(fs.readFileSync(wsConfigPath, 'utf8'));
  WORKSPACES = wsConfig.workspaces || {};
} catch (err) {
  console.error(`  ERROR: Cannot read ${wsConfigPath}: ${err.message}`);
  console.error('  Copy synapse.workspaces.example.json to synapse.workspaces.json and fill in your paths.');
  process.exit(1);
}

if (Object.keys(WORKSPACES).length === 0) {
  console.error('  ERROR: No workspaces defined in synapse.workspaces.json.');
  console.error('  Copy synapse.workspaces.example.json to synapse.workspaces.json and fill in your paths.');
  process.exit(1);
}

const IS_WINDOWS = process.platform === 'win32';

function killPort8400() {
  try {
    if (IS_WINDOWS) {
      const out = execSync('netstat -aon', { encoding: 'utf8', timeout: 5000, shell: 'cmd.exe' });
      const lines = out.split('\n').filter(l => l.includes(':8400') && l.includes('LISTENING'));
      for (const line of lines) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) {
          try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe', shell: 'cmd.exe' }); } catch {}
        }
      }
    } else {
      // Unix: lsof -ti:8400 returns PIDs listening on port 8400
      try {
        const pids = execSync('lsof -ti:8400', { encoding: 'utf8', timeout: 5000 }).trim();
        if (pids) {
          for (const pid of pids.split('\n').filter(Boolean)) {
            try { execSync(`kill -9 ${pid}`, { stdio: 'pipe' }); } catch {}
          }
        }
      } catch {}
    }
  } catch {}
}

function isAWMRunning() {
  try {
    execSync('curl -s http://127.0.0.1:8400/health', { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch { return false; }
}

function isCoordinationRunning() {
  try {
    const out = execSync('curl -s http://127.0.0.1:8400/workers', { stdio: 'pipe', timeout: 3000, encoding: 'utf8' });
    const j = JSON.parse(out);
    return typeof j.count === 'number';
  } catch { return false; }
}

function launchHive(workspace) {
  const ws = WORKSPACES[workspace];
  if (!ws) {
    console.error(`Unknown workspace: ${workspace}`);
    console.log('Available: personal, work');
    process.exit(1);
  }

  console.log(`\n  AgentSynapse Hive — ${ws.name}`);
  console.log(`  ${'='.repeat(30)}`);
  console.log(`  Project: ${ws.projectDir}\n`);

  // Ensure AWM is running WITH coordination enabled
  const awmDir = path.join(SYNAPSE_DIR, 'packages', 'awm');
  if (isCoordinationRunning()) {
    console.log('  AWM + Coordination: already running');
  } else {
    if (isAWMRunning()) {
      console.log('  AWM is running but coordination is NOT enabled. Restarting...');
      // Kill process on port 8400 (no /shutdown endpoint exists)
      killPort8400();
      sleepSync(3000);
    }

    console.log('  Starting AWM with coordination...');
    const dataDir = path.join(SYNAPSE_DIR, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const awmLogFd = fs.openSync(path.join(dataDir, 'awm.log'), 'a');
    spawn('npx tsx src/index.ts', [], {
      cwd: awmDir,
      detached: true,
      stdio: ['ignore', awmLogFd, awmLogFd],
      windowsHide: true,
      shell: true,
      env: {
        ...process.env,
        AWM_COORDINATION: 'true',
        // Load synapse-push as an AWM plugin when channels are enabled.
        // Polls /events for assignment_created and pushes to each agent's channel server.
        ...(CHANNELS_ENABLED && {
          AWM_PLUGINS: path.join(SYNAPSE_DIR, 'packages', 'synapse-push', 'dist', 'awm-plugin.js'),
        }),
      },
    }).unref();

    // Wait for coordination to be ready (not just health)
    let awmReady = false;
    for (let i = 0; i < 20; i++) {
      sleepSync(2000);
      if (isCoordinationRunning()) {
        console.log('  AWM + Coordination: ready');
        awmReady = true;
        break;
      }
    }
    if (!awmReady) {
      console.error('  ERROR: AWM with coordination failed to start within 40 seconds.');
      process.exit(1);
    }
  }

  console.log(`\n  Launching ${ws.agents.length} agents...\n`);

  // Write temp launcher scripts for each agent (avoids quoting hell in terminal args)
  const os = require('os');
  const tmpDir = path.join(os.tmpdir(), 'agentsynapse-launch');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Agents must cd to AgentSynapse dir (where .claude/agents/ lives) so --agent flag works
  const agentSynapseDir = SYNAPSE_DIR;

  if (IS_WINDOWS) {
    const workerBat = path.join(LAUNCHER_DIR, 'start-worker.bat');
    const agentScripts = ws.agents.map(agent => {
      const scriptPath = path.join(tmpDir, `launch-${agent.name.toLowerCase()}.bat`);
      const model = agent.model || MODEL_DEFAULTS[agent.role] || '';
      let content = '@echo off\r\n';
      content += `set WORKER_NAME=${agent.name}\r\n`;
      content += `set PROJECT_DIR=${ws.projectDir}\r\n`;
      if (model) content += `set AGENT_MODEL=${model}\r\n`;
      if (CHANNELS_ENABLED) {
        const channelPort = 50000 + Math.floor(Math.random() * 9999);
        content += `set CHANNELS_ENABLED=1\r\n`;
        content += `set AWM_CHANNEL_PORT=${channelPort}\r\n`;
      }
      content += `cd /d "${agentSynapseDir}"\r\n`;
      if (agent.delay > 0) content += `timeout /t ${agent.delay} /nobreak >nul\r\n`;
      content += `call "${workerBat}" ${agent.name} "${ws.projectDir}"\r\n`;
      fs.writeFileSync(scriptPath, content);
      return { agent, scriptPath };
    });

    // Build wt command: all tabs in one window
    const wtArgs = ['-w', `AgentSynapse-${ws.name}`];
    agentScripts.forEach(({ agent, scriptPath }, i) => {
      if (i > 0) wtArgs.push(';');
      wtArgs.push('new-tab');
      wtArgs.push('--title', `${agent.name} [${workspace}]`);
      wtArgs.push('cmd', '/k', scriptPath);
    });

    try {
      spawn('wt', wtArgs, { detached: true, stdio: 'ignore' }).unref();
    } catch (err) {
      console.error('  Windows Terminal (wt) not found. Falling back to separate windows...');
      agentScripts.forEach(({ agent, scriptPath }) => {
        spawn('cmd', ['/c', 'start', `"${agent.name}"`, 'cmd', '/k', scriptPath], {
          detached: true, stdio: 'ignore', shell: true,
        }).unref();
      });
    }
  } else {
    // Unix: generate .sh launcher scripts
    const workerSh = path.join(LAUNCHER_DIR, 'start-worker.sh');
    const agentScripts = ws.agents.map(agent => {
      const scriptPath = path.join(tmpDir, `launch-${agent.name.toLowerCase()}.sh`);
      const model = agent.model || MODEL_DEFAULTS[agent.role] || '';
      let content = '#!/usr/bin/env bash\n';
      content += `export WORKER_NAME=${agent.name}\n`;
      content += `export PROJECT_DIR="${ws.projectDir}"\n`;
      if (model) content += `export AGENT_MODEL=${model}\n`;
      if (CHANNELS_ENABLED) content += `export CHANNELS_ENABLED=1\n`;
      content += `cd "${agentSynapseDir}"\n`;
      if (agent.delay > 0) content += `sleep ${agent.delay}\n`;
      content += `bash "${workerSh}" ${agent.name} "${ws.projectDir}"\n`;
      fs.writeFileSync(scriptPath, content, { mode: 0o755 });
      return { agent, scriptPath };
    });

    // Try gnome-terminal, then xterm, then fallback to background bash
    const hasGnome = (() => { try { execSync('which gnome-terminal', { stdio: 'pipe' }); return true; } catch { return false; } })();
    const hasXterm  = (() => { try { execSync('which xterm',         { stdio: 'pipe' }); return true; } catch { return false; } })();
    const hasMacos  = (() => { try { execSync('which osascript',     { stdio: 'pipe' }); return true; } catch { return false; } })();

    if (hasMacos) {
      // macOS: open each in a new Terminal tab via osascript
      agentScripts.forEach(({ agent, scriptPath }) => {
        const osa = `tell application "Terminal" to do script "bash '${scriptPath}'"`;
        try { spawn('osascript', ['-e', osa], { detached: true, stdio: 'ignore' }).unref(); } catch {}
      });
    } else if (hasGnome) {
      const gnomeArgs = ['--'];
      agentScripts.forEach(({ agent, scriptPath }, i) => {
        if (i > 0) gnomeArgs.push('--tab', '--');
        gnomeArgs.push('--title', `${agent.name} [${workspace}]`);
        gnomeArgs.push('bash', scriptPath);
      });
      try { spawn('gnome-terminal', gnomeArgs, { detached: true, stdio: 'ignore' }).unref(); } catch {}
    } else if (hasXterm) {
      agentScripts.forEach(({ agent, scriptPath }) => {
        spawn('xterm', ['-title', `${agent.name} [${workspace}]`, '-e', `bash "${scriptPath}"; bash`], {
          detached: true, stdio: 'ignore',
        }).unref();
      });
    } else {
      // Fallback: run each agent in a background bash process (no separate terminal)
      console.log('  No GUI terminal found. Launching agents as background processes...');
      console.log('  Logs: tail -f data/awm.log');
      agentScripts.forEach(({ agent, scriptPath }) => {
        const logPath = path.join(SYNAPSE_DIR, 'data', `${agent.name.toLowerCase()}.log`);
        const logFd = fs.openSync(logPath, 'a');
        spawn('bash', [scriptPath], { detached: true, stdio: ['ignore', logFd, logFd] }).unref();
        console.log(`  ${agent.name}: logs at data/${agent.name.toLowerCase()}.log`);
      });
    }
  }

  console.log(`  ${ws.name} hive launched (${ws.agents.length} agents):`);
  console.log(`    ${ws.agents.map(a => a.name).join(' + ')}`);
  console.log(`  Project: ${ws.projectDir}`);
  console.log(`\n  Status:   curl http://127.0.0.1:8400/workers`);
  console.log(`  Shutdown: node ${path.join(LAUNCHER_DIR, 'launch-hive.cjs')} shutdown`);
  console.log();
}

// --- Main ---
const arg = process.argv[2]?.toLowerCase();

if (!arg) {
  // Interactive menu — built from workspace config
  const wsKeys = Object.keys(WORKSPACES);
  console.log('\n  AgentSynapse Hive Launcher');
  console.log('  ==========================\n');
  wsKeys.forEach((key, i) => {
    const ws = WORKSPACES[key];
    console.log(`  ${i + 1}. ${key.charAt(0).toUpperCase() + key.slice(1).padEnd(10)} (${ws.projectDir})`);
  });
  console.log(`  ${wsKeys.length + 1}. Status`);
  console.log(`  ${wsKeys.length + 2}. Shutdown\n`);

  process.stdout.write(`  Choice [1-${wsKeys.length + 2}]: `);
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (data) => {
    const choice = parseInt(data.trim(), 10);
    if (choice >= 1 && choice <= wsKeys.length) {
      launchHive(wsKeys[choice - 1]);
    } else if (choice === wsKeys.length + 1) {
      try {
        const out = execSync('curl -s http://127.0.0.1:8400/workers', { encoding: 'utf8' });
        const j = JSON.parse(out);
        console.log(`\n  Workers: ${j.count} (${j.idle} idle, ${j.working} working)`);
        j.workers.forEach(w => console.log(`    ${w.name.padEnd(12)} ${w.status.padEnd(8)} ${w.alive ? 'alive' : 'STALE'}`));
      } catch { console.log('  Coordinator not running.'); }
    } else if (choice === wsKeys.length + 2) {
      const shutdownScript = IS_WINDOWS
        ? `"${path.join(LAUNCHER_DIR, 'shutdown.bat')}"`
        : `bash "${path.join(LAUNCHER_DIR, 'shutdown.sh')}"`;
      try { execSync(shutdownScript, { stdio: 'inherit' }); }
      catch { console.log('  Shutdown failed.'); }
    }
    process.exit(0);
  });
} else if (WORKSPACES[arg]) {
  launchHive(arg);
} else if (arg === 'status') {
  try {
    const out = execSync('curl -s http://127.0.0.1:8400/workers', { encoding: 'utf8' });
    const j = JSON.parse(out);
    console.log(`Workers: ${j.count} (${j.idle} idle, ${j.working} working)`);
    j.workers.forEach(w => console.log(`  ${w.name.padEnd(12)} ${w.status.padEnd(8)} ${w.alive ? 'alive' : 'STALE'}`));
  } catch { console.log('Coordinator not running.'); }
} else if (arg === 'shutdown') {
  const shutdownScript = IS_WINDOWS
    ? `"${path.join(LAUNCHER_DIR, 'shutdown.bat')}"`
    : `bash "${path.join(LAUNCHER_DIR, 'shutdown.sh')}"`;
  try { execSync(shutdownScript, { stdio: 'inherit' }); }
  catch { console.log('Shutdown failed.'); }
} else {
  console.log(`Unknown command: ${arg}`);
  console.log('Usage: node launch-hive.js [personal|work|status|shutdown]');
}
