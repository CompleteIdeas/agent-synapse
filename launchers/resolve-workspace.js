#!/usr/bin/env node
// Reads synapse.workspaces.json and prints key=value pairs for batch consumption.
// Usage: node resolve-workspace.js [workspace-name]
//   If no workspace name given, uses the "default" from config.
//   If workspace name is "--list", prints available workspace names.
//   If workspace name is "--add", adds a new workspace:
//     node resolve-workspace.js --add <name> <dir> <label> [workers] [devLead] [orchestrator]

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = resolve(__dirname, '..', 'synapse.workspaces.json');

let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch (err) {
  console.error(`ERROR=Cannot read ${configPath}`);
  process.exit(1);
}

const arg = process.argv[2];

// List mode: print available workspaces (numbered for menu)
if (arg === '--list') {
  let i = 1;
  for (const [name, ws] of Object.entries(config.workspaces)) {
    const workers = ws.hive?.workers ?? 3;
    const devLead = ws.hive?.devLead ? 'yes' : 'no';
    console.log(`${i}=${name}=${ws.label || name}=${ws.dir}=${workers}=${devLead}`);
    i++;
  }
  process.exit(0);
}

// Add mode: create a new workspace
if (arg === '--add') {
  const name = process.argv[3];
  const dir = process.argv[4];
  const label = process.argv[5];
  const workers = parseInt(process.argv[6] || '3', 10);
  const devLead = (process.argv[7] || '1') === '1';
  const orchestrator = (process.argv[8] || '1') === '1';

  if (!name || !dir || !label) {
    console.error('ERROR=Usage: --add <name> <dir> <label> [workers] [devLead] [orchestrator]');
    process.exit(1);
  }
  if (config.workspaces[name]) {
    console.error(`ERROR=Workspace "${name}" already exists`);
    process.exit(1);
  }

  config.workspaces[name] = {
    dir,
    label,
    namespace: name,
    hive: { orchestrator, devLead, workers }
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`OK=Added workspace "${name}" (${label})`);
  process.exit(0);
}

// Resolve workspace name
const wsName = arg || config.default;
if (!wsName) {
  console.error('ERROR=No workspace specified and no default set');
  process.exit(1);
}

const ws = config.workspaces[wsName];
if (!ws) {
  console.error(`ERROR=Workspace "${wsName}" not found in config`);
  console.error(`AVAILABLE=${Object.keys(config.workspaces).join(',')}`);
  process.exit(1);
}

// Print key=value pairs for batch consumption
console.log(`WORKSPACE=${wsName}`);
console.log(`PROJECT_DIR=${ws.dir}`);
console.log(`NAMESPACE=${ws.namespace || wsName}`);
console.log(`LABEL=${ws.label || wsName}`);
console.log(`WORKERS=${ws.hive?.workers ?? 3}`);
console.log(`DEV_LEAD=${ws.hive?.devLead ? 1 : 0}`);
console.log(`ORCHESTRATOR=${ws.hive?.orchestrator !== false ? 1 : 0}`);
