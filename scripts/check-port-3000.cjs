#!/usr/bin/env node
// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-06
// Port 3000 check script — detects WenstarOS occupancy, supports --kill
const { execSync } = require('child_process');
const os = require('os');

const PORT = '3000';

function findPid() {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      const out = execSync(`netstat -ano | findstr ":${PORT}"`, { encoding: 'utf8' });
      const lines = out.trim().split('\n').filter(l => l.includes('LISTENING'));
      if (!lines.length) return null;
      const pid = lines[0].trim().split(/\s+/).pop();
      return pid;
    } else {
      // Unix/Mac
      const out = execSync(`lsof -ti :${PORT}`, { encoding: 'utf8' }).trim();
      return out || null;
    }
  } catch {
    return null;
  }
}

function getProcessName(pid) {
  try {
    if (os.platform() === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
      return out.split(',')[0]?.replace(/"/g, '') || 'unknown';
    } else {
      const out = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
      return out.trim() || 'unknown';
    }
  } catch {
    return 'unknown';
  }
}

function killPid(pid) {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' });
    } else {
      execSync(`kill -9 ${pid}`, { encoding: 'utf8' });
    }
    console.log(`Killed PID ${pid}`);
    return true;
  } catch (e) {
    console.error(`Failed to kill PID ${pid}:`, e.message);
    return false;
  }
}

function main() {
  const shouldKill = process.argv.includes('--kill') || process.argv.includes('-k');

  const pid = findPid();
  if (!pid) {
    console.log(`Port ${PORT}: free`);
    process.exit(0);
  }

  const name = getProcessName(pid);
  console.log(`Port ${PORT}: OCCUPIED by PID ${pid} (${name})`);

  if (shouldKill) {
    if (name.toLowerCase().includes('node') || name.toLowerCase().includes('tsx')) {
      console.log('Looks like a Node/TSX process — killing...');
      const ok = killPid(pid);
      process.exit(ok ? 0 : 1);
    } else {
      console.log(`Process "${name}" does not appear to be Node/TSX.`);
      console.log('Use --kill-force to kill anyway, or kill manually:');
      console.log(os.platform() === 'win32' ? `  taskkill /PID ${pid} /F` : `  kill -9 ${pid}`);
      if (process.argv.includes('--kill-force')) {
        killPid(pid);
      }
      process.exit(1);
    }
  } else {
    console.log('To kill: node scripts/check-port-3000.cjs --kill');
    process.exit(1);
  }
}

main();
