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

// Load model defaults from synapse.config.json
let MODEL_DEFAULTS = {};
try {
  const mainConfig = JSON.parse(fs.readFileSync(path.join(SYNAPSE_DIR, 'synapse.config.json'), 'utf8'));
  MODEL_DEFAULTS = mainConfig.models || {};
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

function killPort8400() {
  try {
    const out = execSync('netstat -aon', { encoding: 'utf8', timeout: 5000, shell: 'cmd.exe' });
    const lines = out.split('\n').filter(l => l.includes(':8400') && l.includes('LISTENING'));
    for (const line of lines) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe', shell: 'cmd.exe' }); } catch {}
      }
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
      env: { ...process.env, AWM_COORDINATION: 'true' },
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

  console.log(`\n  Launching ${ws.agents.length} agents in Windows Terminal...\n`);

  // Write temp launcher scripts for each agent (avoids quoting hell in wt args)
  const os = require('os');
  const tmpDir = path.join(os.tmpdir(), 'agentsynapse-launch');
  fs.mkdirSync(tmpDir, { recursive: true });

  const workerBat = path.join(LAUNCHER_DIR, 'start-worker.bat');
  // Agents must cd to AgentSynapse dir (where .claude/agents/ lives) so --agent flag works
  const agentSynapseDir = SYNAPSE_DIR;
  const agentScripts = ws.agents.map(agent => {
    const scriptPath = path.join(tmpDir, `launch-${agent.name.toLowerCase()}.bat`);
    // Resolve model: per-agent override > role default from synapse.config.json > none
    const model = agent.model || MODEL_DEFAULTS[agent.role] || '';
    let content = '@echo off\r\n';
    content += `set WORKER_NAME=${agent.name}\r\n`;
    content += `set PROJECT_DIR=${ws.projectDir}\r\n`;
    if (model) content += `set AGENT_MODEL=${model}\r\n`;
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

  // Launch Windows Terminal
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

  console.log(`  ${ws.name} hive launched (${ws.agents.length} agents):`);
  console.log(`    ${ws.agents.map(a => a.name).join(' + ')}`);
  console.log(`  Project: ${ws.projectDir}`);
  console.log(`\n  Status:   curl http://127.0.0.1:8400/workers`);
  console.log(`  Shutdown: node ${path.join(LAUNCHER_DIR, 'launch-hive.js')} shutdown`);
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
      try { execSync(`"${path.join(LAUNCHER_DIR, 'shutdown.bat')}"`, { stdio: 'inherit' }); }
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
  try { execSync(`"${path.join(LAUNCHER_DIR, 'shutdown.bat')}"`, { stdio: 'inherit' }); }
  catch { console.log('Shutdown failed.'); }
} else {
  console.log(`Unknown command: ${arg}`);
  console.log('Usage: node launch-hive.js [personal|work|status|shutdown]');
}
