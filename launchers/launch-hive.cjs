#!/usr/bin/env node
/**
 * AgentSynapse Hive Launcher
 *
 * Usage:
 *   node launch-hive.js personal    — launches personal workspace hive
 *   node launch-hive.js work        — launches work workspace hive
 *   node launch-hive.js             — interactive menu
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const SYNAPSE_DIR = path.resolve(__dirname, '..');
const LAUNCHER_DIR = __dirname;

const WORKSPACES = {
  personal: {
    name: 'PERSONAL',
    projectDir: 'C:\\Users\\robert\\Personal-Projects',
    agents: [
      { name: 'orchestrator', role: 'orchestrator', delay: 0 },
      { name: 'Dev-Lead', role: 'dev-lead', delay: 5 },
      { name: 'Worker-B', role: 'worker', delay: 8 },
      { name: 'Worker-C', role: 'worker', delay: 11 },
    ],
  },
  work: {
    name: 'WORK',
    projectDir: 'C:\\Users\\robert\\project',
    agents: [
      { name: 'orchestrator', role: 'orchestrator', delay: 0 },
      { name: 'Dev-Lead', role: 'dev-lead', delay: 5 },
      { name: 'Worker-A', role: 'worker', delay: 8 },
      { name: 'Worker-B', role: 'worker', delay: 11 },
      { name: 'Worker-C', role: 'worker', delay: 14 },
    ],
  },
};

function isCoordinatorRunning() {
  try {
    execSync('curl -s http://127.0.0.1:8410/health', { stdio: 'pipe', timeout: 3000 });
    return true;
  } catch { return false; }
}

function startCoordinator() {
  console.log('  Starting coordinator...');
  spawn('cmd', ['/c', `cd /d ${SYNAPSE_DIR} && npx tsx packages/coordinator/src/index.ts`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();

  // Wait for it
  for (let i = 0; i < 15; i++) {
    execSync('timeout /t 2 /nobreak >nul', { shell: true });
    if (isCoordinatorRunning()) {
      console.log('  Coordinator: ready');
      return true;
    }
  }
  console.error('  ERROR: Coordinator failed to start!');
  return false;
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

  // Ensure coordinator
  if (isCoordinatorRunning()) {
    console.log('  Coordinator: already running');
  } else {
    if (!startCoordinator()) process.exit(1);
  }

  console.log(`\n  Launching ${ws.agents.length} agents in Windows Terminal...\n`);

  // Build wt command: all tabs in one window
  const workerBat = path.join(LAUNCHER_DIR, 'start-worker.bat');
  const wtArgs = ['-w', `AgentSynapse-${ws.name}`];

  ws.agents.forEach((agent, i) => {
    if (i > 0) wtArgs.push(';');
    wtArgs.push('new-tab');
    wtArgs.push('--title', `${agent.name} [${workspace}]`);

    // Build the command: cd to project, optional delay, then launch worker
    let cmd = `cd /d ${ws.projectDir}`;
    if (agent.delay > 0) cmd += ` && timeout /t ${agent.delay} /nobreak >nul`;
    cmd += ` && "${workerBat}" ${agent.name} "${ws.projectDir}"`;

    wtArgs.push('cmd', '/k', cmd);
  });

  // Launch Windows Terminal
  try {
    spawn('wt', wtArgs, { detached: true, stdio: 'ignore' }).unref();
  } catch (err) {
    console.error('  Windows Terminal (wt) not found. Falling back to separate windows...');
    ws.agents.forEach((agent, i) => {
      setTimeout(() => {
        const cmd = `cd /d ${ws.projectDir} && "${workerBat}" ${agent.name} "${ws.projectDir}"`;
        spawn('cmd', ['/c', 'start', `"${agent.name}"`, 'cmd', '/k', cmd], {
          detached: true, stdio: 'ignore', shell: true,
        }).unref();
      }, agent.delay * 1000);
    });
  }

  console.log(`  ${ws.name} hive launched (${ws.agents.length} agents):`);
  console.log(`    ${ws.agents.map(a => a.name).join(' + ')}`);
  console.log(`  Project: ${ws.projectDir}`);
  console.log(`\n  Status:   curl http://127.0.0.1:8410/workers`);
  console.log(`  Shutdown: node ${path.join(LAUNCHER_DIR, 'launch-hive.js')} shutdown`);
  console.log();
}

// --- Main ---
const arg = process.argv[2]?.toLowerCase();

if (!arg) {
  // Interactive menu
  console.log('\n  AgentSynapse Hive Launcher');
  console.log('  ==========================\n');
  console.log('  1. Personal  (C:\\Users\\robert\\Personal-Projects)');
  console.log('  2. Work      (C:\\Users\\robert\\project)');
  console.log('  3. Status');
  console.log('  4. Shutdown\n');

  process.stdout.write('  Choice [1-4]: ');
  process.stdin.setEncoding('utf8');
  process.stdin.once('data', (data) => {
    const choice = data.trim();
    if (choice === '1') launchHive('personal');
    else if (choice === '2') launchHive('work');
    else if (choice === '3') {
      try {
        const out = execSync('curl -s http://127.0.0.1:8410/workers', { encoding: 'utf8' });
        const j = JSON.parse(out);
        console.log(`\n  Workers: ${j.count} (${j.idle} idle, ${j.working} working)`);
        j.workers.forEach(w => console.log(`    ${w.name.padEnd(12)} ${w.status.padEnd(8)} ${w.alive ? 'alive' : 'STALE'}`));
      } catch { console.log('  Coordinator not running.'); }
    } else if (choice === '4') {
      try { execSync(`"${path.join(LAUNCHER_DIR, 'shutdown.bat')}"`, { stdio: 'inherit' }); }
      catch { console.log('  Shutdown failed.'); }
    }
    process.exit(0);
  });
} else if (arg === 'personal' || arg === 'work') {
  launchHive(arg);
} else if (arg === 'status') {
  try {
    const out = execSync('curl -s http://127.0.0.1:8410/workers', { encoding: 'utf8' });
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
