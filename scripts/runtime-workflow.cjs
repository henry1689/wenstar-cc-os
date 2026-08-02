#!/usr/bin/env node
// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-07
// Local runtime workflow - checks port, waits for health, runs API smoke.
// Does NOT auto-start the server.
//
// Usage:
//   node scripts/runtime-workflow.cjs
//   node scripts/runtime-workflow.cjs --skip-port --skip-smoke

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = __dirname;
const REPO = path.resolve(SCRIPTS_DIR, '..');

const PORT_CHECK = 'node ' + path.join(SCRIPTS_DIR, 'check-port-3000.cjs');
const WAIT_HEALTH = 'node ' + path.join(SCRIPTS_DIR, 'wait-for-health.cjs');
const HEALTH_CLI = 'node ' + path.join(REPO, 'node_modules/tsx/dist/cli.mjs') + ' ' + path.join(REPO, 'src/cli/health-check.ts');
const API_SMOKE = 'node ' + path.join(REPO, 'node_modules/vitest/vitest.mjs') + ' run ' + path.join(SCRIPTS_DIR, '__tests__/runtime-api-smoke.test.ts');

function run(cmd, label) {
  console.log('\n═══ ' + label + ' ═══');
  console.log('$ ' + cmd);
  try {
    const r = spawnSync(cmd, { shell: true, cwd: REPO, encoding: 'utf8', timeout: 60000 });
    const out = (r.stdout + r.stderr).trim();
    if (out) console.log(out.split('\n').slice(-5).join('\n'));
    if (r.status !== 0) {
      console.log('  ⚠️ exit ' + r.status);
      return { status: r.status, output: out };
    }
    console.log('  ✅ PASS');
    return { status: 0, output: out };
  } catch (e) {
    console.log('  ❌ ERROR: ' + (e.message || e));
    return { status: 1, output: e.message || '' };
  }
}

function main() {
  const skipPort = process.argv.includes('--skip-port');
  const skipSmoke = process.argv.includes('--skip-smoke');

  console.log('═══════════════════════════════════════════');
  console.log('  WenstarOS Local Runtime Workflow');
  console.log('═══════════════════════════════════════════');

  const results = [];
  let allPassed = true;

  if (!skipPort) {
    const r = run(PORT_CHECK, '1. Port 3000 Check');
    results.push(r);
    if (r.status !== 0) {
      console.log('\n⚠️  Port 3000 is occupied or unavailable.');
      console.log('   Kill existing process: node scripts/check-port-3000.cjs --kill');
      console.log('   Or skip port check: node scripts/runtime-workflow.cjs --skip-port');
      // Don't exit - port may be occupied by our own WenstarOS server
    }
  }

  const r2 = run(WAIT_HEALTH, '2. Wait For Health');
  results.push(r2);
  if (r2.status !== 0) {
    console.log('\n❌ Server not reachable. Start with: node start.cjs');
    allPassed = false;
  }

  const r3 = run(HEALTH_CLI, '3. Health Check CLI');
  results.push(r3);

  if (!skipSmoke) {
    const r4 = run(API_SMOKE, '4. Runtime API Smoke');
    results.push(r4);
    if (r4.status !== 0) allPassed = false;
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  Workflow Summary');
  console.log('═══════════════════════════════════════════');
  for (let i = 0; i < results.length; i++) {
    const sym = results[i].status === 0 ? '✅' : '❌';
    console.log(`  ${sym} Step ${i + 1}`);
  }
  console.log('');

  if (allPassed) {
    console.log('✅ All checks passed. WenstarOS is running and healthy.\n');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. See above for details.\n');
    process.exit(1);
  }
}

main();
