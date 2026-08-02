#!/usr/bin/env node
// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-15
// CI-Ready Wrapper — sets project-local TMP/TEMP/TMPDIR to D drive,
// then runs smoke:api + smoke:checkpoint serially.
// Prevents C-drive ENOSPC from vitest/node temp file writes.
// Does NOT run full vitest (test:full is observation-only, not a gate).

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');
const NPM_CACHE = path.join(ROOT, '.cache', 'npm');

fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(NPM_CACHE, { recursive: true });

const env = {
  ...process.env,
  TMP: TMP,
  TEMP: TMP,
  TMPDIR: TMP,
  npm_config_cache: NPM_CACHE,
};

const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

console.log('[ci-ready] ──────────────────────────────────');
console.log('[ci-ready]  cwd:   ', ROOT);
console.log('[ci-ready]  TMP:   ', env.TMP);
console.log('[ci-ready]  TEMP:  ', env.TEMP);
console.log('[ci-ready]  TMPDIR:', env.TMPDIR);
console.log('[ci-ready]  npm_cache:', env.npm_config_cache);
console.log('[ci-ready] ──────────────────────────────────\n');

const steps = [
  { label: 'smoke:api', args: ['run', 'scripts/__tests__/runtime-api-smoke.test.ts'] },
  { label: 'smoke:checkpoint', args: [
    'run',
    'scripts/__tests__/coverage-gap-read-runtime-smoke.test.ts',
    'scripts/__tests__/chat-stream-runtime-smoke.test.ts',
    'scripts/__tests__/websocket-connectivity-runtime-smoke.test.ts',
    'scripts/__tests__/webui-static-runtime-smoke.test.ts',
    'scripts/__tests__/m6-m8-runtime-smoke.test.ts',
    'scripts/__tests__/knowledge-family-runtime-smoke.test.ts',
    'scripts/__tests__/memory-roundtrip-runtime-smoke.test.ts',
    'scripts/__tests__/sse-connectivity-runtime-smoke.test.ts',
    'scripts/__tests__/m5-orchestrator-core-smoke.test.ts',
    'scripts/__tests__/core-flow-runtime-smoke.test.ts',
    'scripts/__tests__/family-graph-db-health.test.ts',
    'scripts/__tests__/provider-selection-smoke.test.ts',
    'scripts/__tests__/no-api-smoke.test.ts',
    'scripts/__tests__/runtime-api-smoke.test.ts',
  ]},
];

let passed = 0;
let failed = 0;

for (const step of steps) {
  const stepName = step.label + ' (' + (step.args.length - 1) + ' suites)';
  console.log(`[ci-ready] ▶ ${stepName}`);
  const result = spawnSync(process.execPath, [VITEST, ...step.args], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.log(`[ci-ready] ❌ ${stepName} FAILED (exit ${result.status})`);
    failed++;
  } else {
    console.log(`[ci-ready] ✅ ${stepName} PASSED`);
    passed++;
  }
  console.log('');
}

console.log('[ci-ready] ──────────────────────────────────');
console.log(`[ci-ready]  Result: ${passed} passed, ${failed} failed`);
console.log('[ci-ready] ──────────────────────────────────');

if (failed > 0) {
  process.exit(1);
}
