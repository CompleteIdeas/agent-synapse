#!/usr/bin/env node
/**
 * Restart a worker: kill existing process, then respawn.
 * Called by the coordinator via: node launchers/restart-worker.cjs <worker-name> <project-dir> [task...]
 *
 * If no task is provided, respawns with a generic "Resume previous work" prompt.
 * The worker will pick up any pending assignment via POST /next on checkin.
 */

const { execSync } = require('child_process');
const path = require('path');

const workerName = process.argv[2];
const projectDir = process.argv[3];
const task = process.argv.slice(4).join(' ') || `Resume work. Check in via POST /next, pick up any pending assignment.`;

if (!workerName) {
  console.log('Usage: node restart-worker.cjs <worker-name> <project-dir> [task...]');
  console.log('Example: node restart-worker.cjs Worker-A "C:\\Users\\robert\\project\\EquiHub" Fix the login bug');
  console.log('Example: node restart-worker.cjs Worker-A "C:\\Users\\robert\\project\\EquiHub"  (resumes with /next)');
  process.exit(1);
}

if (!projectDir) {
  console.log('Error: project-dir is required');
  process.exit(1);
}

const launchersDir = __dirname;

async function main() {
  const result = { worker: workerName, action: 'restart' };

  // Step 1: Kill existing worker
  try {
    const killOutput = execSync(
      `node "${path.join(launchersDir, 'kill-worker.cjs')}" "${workerName}"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    result.kill = JSON.parse(killOutput.trim());
  } catch (err) {
    result.kill = { error: err.message };
  }

  // Brief pause to let processes fully terminate
  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Respawn
  try {
    const spawnOutput = execSync(
      `node "${path.join(launchersDir, 'spawn-worker.cjs')}" "${workerName}" "${projectDir}" ${task}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    result.spawn = JSON.parse(spawnOutput.trim());
  } catch (err) {
    result.spawn = { error: err.message };
  }

  console.log(JSON.stringify(result));
}

main();
