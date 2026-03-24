#!/usr/bin/env node
// Copyright 2026 Robert Winter / Complete Ideas
// SPDX-License-Identifier: MIT

import { resolve, relative, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');

const VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8')).version;

const COMMANDS = {
  init: 'Scaffold AgentSynapse into your project',
  start: 'Start all services (memory, coordinator, task-manager)',
  stop: 'Stop all running services',
  shutdown: 'Graceful shutdown: broadcast SHUTDOWN to agents, then stop services',
  status: 'Check service health',
  worker: 'Launch a Claude Code worker',
  orchestrator: 'Launch the Claude Code orchestrator',
  workspaces: 'List registered workspaces',
  help: 'Show this help message',
};

const [,, command, ...args] = process.argv;

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function logOk(msg) { console.log(`  ✓ ${msg}`); }
function logSkip(msg) { console.log(`  - ${msg} (exists)`); }
function logErr(msg) { console.error(`  ✗ ${msg}`); }
function header(msg) { console.log(`\n  ${msg}\n  ${'─'.repeat(msg.length)}`); }

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyIfMissing(src, dest, label, force = false) {
  if (existsSync(dest) && !force) {
    logSkip(label || basename(dest));
    return false;
  }
  copyFileSync(src, dest);
  logOk(`${label || basename(dest)}${force && existsSync(dest) ? ' (updated)' : ''}`);
  return true;
}

function isWindows() {
  return process.platform === 'win32';
}

function checkHealth(url) {
  try {
    execSync(`curl -s --max-time 2 -o /dev/null -w "%{http_code}" ${url}/health`, { encoding: 'utf-8' }).trim();
    return true;
  } catch {
    return false;
  }
}

// ─── init ───────────────────────────────────────────────────────────────────

const KNOWN_FLAGS = new Set(['--force', '-f', '--verbose', '-v', '--dry-run']);

function isFlag(arg) {
  // Check known flags explicitly, then fall back to dash detection
  // Handles ASCII hyphen, en-dash (U+2013), and em-dash (U+2014)
  return KNOWN_FLAGS.has(arg) || /^[-\u2013\u2014]/.test(arg);
}

function cmdInit() {
  const force = args.some(a => KNOWN_FLAGS.has(a) && (a === '--force' || a === '-f'));
  const positionalArgs = args.filter(a => !isFlag(a));
  const projectDir = positionalArgs[0] ? resolve(positionalArgs[0]) : process.cwd();

  if (args.includes('--debug')) {
    log(`DEBUG argv: ${JSON.stringify(process.argv)}`);
    log(`DEBUG command: ${JSON.stringify(command)}`);
    log(`DEBUG args: ${JSON.stringify(args)}`);
    log(`DEBUG positionalArgs: ${JSON.stringify(positionalArgs)}`);
    log(`DEBUG force: ${force}`);
    log(`DEBUG projectDir: ${projectDir}`);
  }

  if (!existsSync(projectDir)) {
    logErr(`Directory not found: ${projectDir}`);
    process.exit(1);
  }

  header(`${force ? 'Updating' : 'Initializing'} AgentSynapse in ${projectDir}`);
  if (force) log('--force: overwriting existing files with latest versions');

  // .claude directories
  const claudeDir = join(projectDir, '.claude');
  const agentsDir = join(claudeDir, 'agents');
  const hooksDir = join(claudeDir, 'hooks');
  ensureDir(agentsDir);
  ensureDir(hooksDir);

  // Copy agent definitions
  log('Agent definitions:');
  copyIfMissing(join(PKG_ROOT, 'agents', 'worker.md'), join(agentsDir, 'worker.md'), 'agents/worker.md', force);
  copyIfMissing(join(PKG_ROOT, 'agents', 'orchestrator.md'), join(agentsDir, 'orchestrator.md'), 'agents/orchestrator.md', force);

  // Copy hooks (into both .claude/hooks/ and project-root hooks/)
  const projectHooksDir = join(projectDir, 'hooks');
  ensureDir(projectHooksDir);
  log('');
  log('Hooks:');
  copyIfMissing(join(PKG_ROOT, 'hooks', 'check-file-lock.sh'), join(hooksDir, 'check-file-lock.sh'), 'hooks/check-file-lock.sh', force);
  copyIfMissing(join(PKG_ROOT, 'hooks', 'worker-cleanup.sh'), join(hooksDir, 'worker-cleanup.sh'), 'hooks/worker-cleanup.sh', force);
  copyIfMissing(join(PKG_ROOT, 'hooks', 'orchestrator-watchdog.sh'), join(projectHooksDir, 'orchestrator-watchdog.sh'), 'hooks/orchestrator-watchdog.sh', force);
  copyIfMissing(join(PKG_ROOT, 'hooks', 'pre-compact.sh'), join(projectHooksDir, 'pre-compact.sh'), 'hooks/pre-compact.sh', force);

  // Copy skills
  log('');
  log('Skills:');
  const skillNames = ['ask-coworker', 'repo-deep-dive', 'ux-audit', 'user-docs-from-code', 'front-end-designer'];
  const skillsDir = join(claudeDir, 'skills');
  for (const skill of skillNames) {
    const srcDir = join(PKG_ROOT, 'skills', skill);
    const destDir = join(skillsDir, skill);
    if (!existsSync(srcDir)) continue;
    if (existsSync(destDir) && !force) {
      logSkip(`skills/${skill}`);
      continue;
    }
    ensureDir(destDir);
    // Copy all files in skill directory
    const files = readdirSync(srcDir);
    for (const file of files) {
      copyFileSync(join(srcDir, file), join(destDir, file));
    }
    logOk(`skills/${skill}${force ? ' (updated)' : ''}`);
  }

  // Copy commands (slash commands)
  log('');
  log('Commands:');
  const commandsDir = join(claudeDir, 'commands');
  ensureDir(commandsDir);
  const cmdFiles = readdirSync(join(PKG_ROOT, 'commands')).filter(f => f.endsWith('.md'));
  for (const cmd of cmdFiles) {
    copyIfMissing(join(PKG_ROOT, 'commands', cmd), join(commandsDir, cmd), `commands/${cmd}`, force);
  }

  // Register workspace (replaces launcher copying)
  log('');
  log('Workspace:');
  const wsName = basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const wsConfigPath = join(PKG_ROOT, 'synapse.workspaces.json');
  let wsConfig;
  try {
    wsConfig = JSON.parse(readFileSync(wsConfigPath, 'utf-8'));
  } catch {
    wsConfig = { default: wsName, workspaces: {} };
  }

  if (wsConfig.workspaces[wsName] && !force) {
    logSkip(`workspace "${wsName}" (already registered)`);
  } else {
    wsConfig.workspaces[wsName] = {
      dir: projectDir,
      label: basename(projectDir),
      namespace: wsName,
      hive: { orchestrator: true, devLead: true, workers: 3 },
    };
    if (!wsConfig.default) wsConfig.default = wsName;
    writeFileSync(wsConfigPath, JSON.stringify(wsConfig, null, 2) + '\n');
    logOk(`workspace "${wsName}" registered → ${projectDir}`);
  }
  log(`  Launchers: ${join(PKG_ROOT, 'launchers')}`);

  // Create/merge .claude/settings.json with hook config
  const settingsPath = join(claudeDir, 'settings.json');
  if (!existsSync(settingsPath) || force) {
    const settings = JSON.parse(readFileSync(join(PKG_ROOT, 'examples', 'claude-settings.json'), 'utf-8'));
    delete settings._comment;
    delete settings.$schema;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    logOk(`.claude/settings.json (${force ? 'updated' : 'created'} with all hooks)`);
  } else {
    logSkip('.claude/settings.json');
    log('  → Run with --force to update hooks config');
  }

  // Create/merge .claude/mcp.json
  const mcpPath = join(claudeDir, 'mcp.json');
  if (!existsSync(mcpPath) || force) {
    const mcpConfig = {
      mcpServers: {
        'agent-working-memory': {
          command: 'npx',
          args: ['tsx', join(process.env.AWM_PROJECT_DIR || join(PKG_ROOT, '..', 'AgentWorkingMemory'), 'src', 'mcp.ts')],
          env: {
            AWM_DB_PATH: join(process.env.AWM_PROJECT_DIR || join(PKG_ROOT, '..', 'AgentWorkingMemory'), 'memory.db'),
          },
        },
      },
    };
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));
    logOk(`.claude/mcp.json (${force ? 'updated' : 'configured'})`);
  } else {
    logSkip('.claude/mcp.json');
    log('  → Run with --force to update MCP config');
  }

  // Create data directories (project-local for coord/tasks, central for memory)
  ensureDir(join(projectDir, 'data'));
  ensureDir(join(PKG_ROOT, 'data'));
  logOk('data/ directories (project + central AWM)');

  // Add data/ to .gitignore if not already there
  const gitignorePath = join(projectDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    if (!gitignore.includes('data/')) {
      writeFileSync(gitignorePath, gitignore.trimEnd() + '\n\n# AgentSynapse\ndata/\norchestrator_state.json\ncoordination.db\n.compact-breadcrumb-*.json\n');
      logOk('.gitignore updated');
    }
  }

  header('Done!');
  log('');
  log('Next steps:');
  if (isWindows()) {
    const launcherPath = join(PKG_ROOT, 'launchers');
    log(`  Option A — Windows Terminal (recommended):`);
    log(`    ${launcherPath}\\start-all.bat ${wsName}`);
    log('');
    log('  Option B — Manual:');
  }
  log('  1. Start services:     npx agent-synapse start');
  log('  2. Launch orchestrator: npx agent-synapse orchestrator');
  log('  3. Launch workers:     npx agent-synapse worker');
  log('');
  log(`  Workspace: "${wsName}" — change default in synapse.workspaces.json`);
  log('');
}

// ─── start ──────────────────────────────────────────────────────────────────

function cmdStart() {
  const services = ['coordinator', 'task-manager'];
  const ports = { coordinator: 8410, 'task-manager': 8420 };

  header('Starting AgentSynapse services (AWM runs externally)');

  // Check if already running
  for (const svc of services) {
    if (checkHealth(`http://127.0.0.1:${ports[svc]}`)) {
      logSkip(`${svc} (already running on port ${ports[svc]})`);
      services.splice(services.indexOf(svc), 1);
    }
  }

  if (services.length === 0) {
    log('All services already running.');
    return;
  }

  // Build first if dist/ doesn't exist
  for (const svc of services) {
    const distPath = join(PKG_ROOT, 'packages', svc, 'dist');
    if (!existsSync(distPath)) {
      log(`Building ${svc}...`);
      try {
        execSync(`npm -w @agent-synapse/${svc} run build`, { cwd: PKG_ROOT, stdio: 'inherit' });
      } catch (err) {
        logErr(`Failed to build ${svc}`);
        process.exit(1);
      }
    }
  }

  // Start each service as a detached background process
  for (const svc of services) {
    const entryPoint = join(PKG_ROOT, 'packages', svc, 'dist', 'index.js');
    const logFile = join(PKG_ROOT, 'data', `${svc}.log`);

    ensureDir(join(PKG_ROOT, 'data'));

    const env = { ...process.env };
    // AWM (memory) runs externally — not started by AgentSynapse
    if (svc === 'coordinator') env.COORD_DB = env.COORD_DB || join(process.cwd(), 'data', 'coord.db');
    if (svc === 'task-manager') env.TM_DB_PATH = env.TM_DB_PATH || join(process.cwd(), 'data', 'task.db');

    const child = spawn('node', [entryPoint], {
      cwd: PKG_ROOT,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.unref();

    // Write PID for stop command
    const pidFile = join(PKG_ROOT, 'data', `${svc}.pid`);
    writeFileSync(pidFile, String(child.pid));

    logOk(`${svc} started (PID ${child.pid}, port ${ports[svc]})`);
  }

  // Wait a moment and verify
  log('');
  log('Waiting for services to come up...');
  setTimeout(() => {
    const allPorts = { coordinator: 8410, 'task-manager': 8420 };
    for (const [svc, port] of Object.entries(allPorts)) {
      const healthy = checkHealth(`http://127.0.0.1:${port}`);
      if (healthy) {
        logOk(`${svc} healthy on port ${port}`);
      } else {
        logErr(`${svc} not responding on port ${port}`);
      }
    }
    log('');
  }, 3000);
}

// ─── stop ───────────────────────────────────────────────────────────────────

function cmdStop() {
  const services = ['memory', 'coordinator', 'task-manager'];

  header('Stopping AgentSynapse services');

  for (const svc of services) {
    const pidFile = join(PKG_ROOT, 'data', `${svc}.pid`);
    if (!existsSync(pidFile)) {
      logSkip(`${svc} (no PID file)`);
      continue;
    }

    const pid = readFileSync(pidFile, 'utf-8').trim();
    try {
      if (isWindows()) {
        execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(parseInt(pid, 10), 'SIGTERM');
      }
      logOk(`${svc} stopped (PID ${pid})`);
    } catch {
      logSkip(`${svc} (PID ${pid} not running)`);
    }

    // Clean up PID file
    try { unlinkSync(pidFile); } catch { /* ignore */ }
  }

  log('');
}

// ─── status ─────────────────────────────────────────────────────────────────

function cmdStatus() {
  const services = [
    { name: 'AWM (external)', port: 8400 },
    { name: 'coordinator', port: 8410 },
    { name: 'task-manager', port: 8420 },
  ];

  header(`AgentSynapse v${VERSION} — Service Status`);

  for (const { name, port } of services) {
    const healthy = checkHealth(`http://127.0.0.1:${port}`);
    if (healthy) {
      logOk(`${name} — running on port ${port}`);
    } else {
      logErr(`${name} — not responding on port ${port}`);
    }
  }

  // Check coordinator for workers
  try {
    const result = execSync('curl -s --max-time 2 http://127.0.0.1:8410/workers', { encoding: 'utf-8' });
    const data = JSON.parse(result);
    log('');
    if (data.count > 0) {
      log(`Workers online: ${data.count}`);
      for (const w of data.workers || []) {
        log(`  ${w.name} (${w.role}) — ${w.status || 'active'}`);
      }
    } else {
      log('No workers online.');
    }
  } catch {
    // Coordinator not running
  }

  log('');
}

// ─── worker ─────────────────────────────────────────────────────────────────

function cmdWorker() {
  const workerName = args[0] || null;
  const projectDir = args[1] ? resolve(args[1]) : process.cwd();

  // Check coordinator is running
  if (!checkHealth('http://127.0.0.1:8410')) {
    logErr('Coordinator not running! Start services first: npx agent-synapse start');
    process.exit(1);
  }

  // Auto-assign name if not provided
  let name = workerName;
  if (!name) {
    try {
      const result = execSync('curl -s --max-time 2 http://127.0.0.1:8410/workers', { encoding: 'utf-8' });
      const data = JSON.parse(result);
      const taken = (data.workers || []).map(w => w.name);
      for (const letter of 'ABCDEFGH'.split('')) {
        const candidate = `Worker-${letter}`;
        if (!taken.includes(candidate)) {
          name = candidate;
          break;
        }
      }
      if (!name) {
        logErr('All worker slots A-H are taken!');
        process.exit(1);
      }
    } catch {
      name = 'Worker-A';
    }
  }

  header(`Launching ${name} in ${projectDir}`);

  const agentFile = join(projectDir, '.claude', 'agents', 'worker.md');
  if (!existsSync(agentFile)) {
    logErr('worker.md not found. Run "npx agent-synapse init" first.');
    process.exit(1);
  }

  const systemPrompt = `YOUR IDENTITY: You are ${name}. Display this at the start of every response: [${name}]. Set WORKER_NAME=${name} for all checkin calls. You are a generic worker — your role is determined by whatever task the orchestrator assigns you. PROJECT DIRECTORY: ${projectDir}`;
  const startPrompt = `Execute hive protocol: checkin to coordinator as ${name}, check commands, memory_restore, GET /assignment. If no task, enter idle poll loop (every 30s). Never exit until SHUTDOWN.`;

  const claudeArgs = [
    '--dangerously-skip-permissions',
    '--agent', 'worker',
    '--append-system-prompt', systemPrompt,
    startPrompt,
  ];

  const child = spawn('claude', claudeArgs, {
    cwd: projectDir,
    stdio: 'inherit',
    env: { ...process.env, WORKER_NAME: name },
    shell: true,
  });

  child.on('exit', (code) => {
    log(`${name} exited with code ${code}`);
  });
}

// ─── orchestrator ───────────────────────────────────────────────────────────

function cmdOrchestrator() {
  const projectDir = args[0] ? resolve(args[0]) : process.cwd();

  // Check coordinator is running
  if (!checkHealth('http://127.0.0.1:8410')) {
    logErr('Coordinator not running! Start services first: npx agent-synapse start');
    process.exit(1);
  }

  header(`Launching Orchestrator in ${projectDir}`);

  const agentFile = join(projectDir, '.claude', 'agents', 'orchestrator.md');
  if (!existsSync(agentFile)) {
    logErr('orchestrator.md not found. Run "npx agent-synapse init" first.');
    process.exit(1);
  }

  const systemPrompt = `YOUR IDENTITY: You are the ORCHESTRATOR. Display this at the start of every response: [ORCHESTRATOR]. You manage the hive. NEVER use the Agent tool. NEVER spawn subagents or background tasks. Workers are generic (Worker-A, Worker-B, etc.) and adapt to whatever task you assign. Check GET /workers to see who's online before assigning work. PROJECT DIRECTORY: ${projectDir}`;
  const startPrompt = `Execute hive protocol: read synapse.config.json for mode and services, checkin to coordinator, memory_restore. Then WAIT for workers — poll GET /workers every 10 seconds until at least 2 workers show alive:true (up to 60s). Only after workers are online, report the hive status and ask me what to assign.`;

  const claudeArgs = [
    '--dangerously-skip-permissions',
    '--agent', 'orchestrator',
    '--append-system-prompt', systemPrompt,
    startPrompt,
  ];

  const child = spawn('claude', claudeArgs, {
    cwd: projectDir,
    stdio: 'inherit',
    env: { ...process.env, WORKER_NAME: 'orchestrator' },
    shell: true,
  });

  child.on('exit', (code) => {
    log(`Orchestrator exited with code ${code}`);
  });
}

// ─── shutdown ────────────────────────────────────────────────────────────────

function cmdShutdown() {
  const waitSecs = parseInt(args.find(a => /^\d+$/.test(a)) || '30', 10);
  const skipWait = args.includes('--now');

  header('Graceful Shutdown');

  // Step 1: Check if coordinator is running
  if (!checkHealth('http://127.0.0.1:8410')) {
    log('Coordinator not running — skipping agent shutdown broadcast.');
    log('Stopping services directly...');
    cmdStop();
    return;
  }

  // Step 2: Broadcast SHUTDOWN command to all agents
  log('Broadcasting SHUTDOWN to all agents...');
  try {
    const result = execSync(
      `curl -s -X POST http://127.0.0.1:8410/command -H "Content-Type: application/json" -d "{\\"command\\":\\"SHUTDOWN\\",\\"reason\\":\\"graceful shutdown via CLI\\",\\"issuedBy\\":\\"cli\\"}"`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(result);
    if (data.ok) {
      logOk('SHUTDOWN command broadcast');
    } else {
      logErr(`Broadcast failed: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    logErr('Failed to broadcast SHUTDOWN');
  }

  if (skipWait) {
    log('--now: skipping wait, stopping services immediately.');
    cmdStop();
    return;
  }

  // Step 3: Wait for agents to finish up
  log(`Waiting up to ${waitSecs}s for agents to wrap up...`);
  const deadline = Date.now() + waitSecs * 1000;

  const pollAgents = () => {
    try {
      const result = execSync(
        'curl -s --max-time 2 http://127.0.0.1:8410/command/wait?status=idle',
        { encoding: 'utf-8' }
      );
      const data = JSON.parse(result);
      if (data.allReady) {
        logOk('All agents idle — safe to stop.');
        return true;
      }
      const waiting = (data.waiting || []).map(w => w.name).join(', ');
      log(`  Still working: ${waiting}`);
      return false;
    } catch {
      return true; // coordinator died, proceed
    }
  };

  const waitLoop = () => {
    if (pollAgents() || Date.now() >= deadline) {
      if (Date.now() >= deadline) {
        log(`Timeout after ${waitSecs}s — proceeding with stop.`);
      }
      log('');
      cmdStop();
      return;
    }
    setTimeout(waitLoop, 3000);
  };

  waitLoop();
}

// ─── workspaces ─────────────────────────────────────────────────────────────

function cmdWorkspaces() {
  const wsConfigPath = join(PKG_ROOT, 'synapse.workspaces.json');
  if (!existsSync(wsConfigPath)) {
    logErr('No workspaces configured. Run "npx agent-synapse init" in a project first.');
    process.exit(1);
  }

  const wsConfig = JSON.parse(readFileSync(wsConfigPath, 'utf-8'));
  const defaultWs = wsConfig.default;

  header('Registered Workspaces');

  for (const [name, ws] of Object.entries(wsConfig.workspaces)) {
    const isDefault = name === defaultWs ? ' (default)' : '';
    log(`  ${name}${isDefault}`);
    log(`    Dir:       ${ws.dir}`);
    log(`    Namespace: ${ws.namespace || name}`);
    log(`    Hive:      ${ws.hive?.workers ?? 3} workers${ws.hive?.devLead ? ' + dev-lead' : ''}`);
    log('');
  }

  log(`Launchers: ${join(PKG_ROOT, 'launchers')}`);
  log(`Config:    ${wsConfigPath}`);
  log('');
}

// ─── help ───────────────────────────────────────────────────────────────────

function cmdHelp() {
  console.log(`
  agent-synapse v${VERSION}
  Multi-agent orchestration with persistent memory for Claude Code.

  Usage:
    npx agent-synapse <command> [options]

  Commands:
    init [dir] [--force]  Scaffold AgentSynapse into a project (--force to update existing)
    start                 Start all services (memory, coordinator, task-manager)
    stop                  Stop all running services (services only)
    shutdown [--now]       Graceful shutdown: SHUTDOWN agents, wait, then stop services
    status                Check service health and list workers
    worker [name] [dir]   Launch a Claude Code worker agent
    orchestrator [dir]    Launch the Claude Code orchestrator agent
    help                  Show this help message

  Examples:
    npx agent-synapse init                        # Init in current directory
    npx agent-synapse init ./my-project           # Init in a specific project
    npx agent-synapse init --force                # Update existing install with latest
    npx agent-synapse start                       # Start services
    npx agent-synapse worker                      # Auto-named worker (Worker-A)
    npx agent-synapse worker Worker-B             # Named worker
    npx agent-synapse worker Worker-A ./my-project  # Worker in specific project
    npx agent-synapse orchestrator                # Launch orchestrator
    npx agent-synapse status                      # Health check

  Workflow:
    1. npx agent-synapse init        # One-time setup per project
    2. npx agent-synapse start       # Start services (once per session)
    3. npx agent-synapse orchestrator # Terminal 1: orchestrator
    4. npx agent-synapse worker      # Terminal 2: Worker-A
    5. npx agent-synapse worker      # Terminal 3: Worker-B

  Docs: https://github.com/CompleteIdeas/agent-synapse
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

switch (command) {
  case 'init':
    cmdInit();
    break;
  case 'start':
    cmdStart();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'shutdown':
    cmdShutdown();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'worker':
    cmdWorker();
    break;
  case 'orchestrator':
    cmdOrchestrator();
    break;
  case 'workspaces':
  case 'ws':
    cmdWorkspaces();
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    cmdHelp();
    break;
  case '--version':
  case '-v':
    console.log(VERSION);
    break;
  default:
    logErr(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
