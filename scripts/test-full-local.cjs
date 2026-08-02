#!/usr/bin/env node
// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-18
// Full Vitest Wrapper — sets project-local TMP/TEMP/TMPDIR to D drive,
// then runs full vitest suite.
// Prevents C-drive ENOSPC from vitest/node temp file writes.
// Emits concise env summary. Propagates vitest exit code.

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

console.log('[test:full] ──────────────────────────────────');
console.log('[test:full]  cwd:   ', ROOT);
console.log('[test:full]  TMP:   ', env.TMP);
console.log('[test:full]  TEMP:  ', env.TEMP);
console.log('[test:full]  TMPDIR:', env.TMPDIR);
console.log('[test:full]  npm_cache:', env.npm_config_cache);
console.log('[test:full]  runner:', VITEST);
console.log('[test:full] ──────────────────────────────────\n');

const result = spawnSync(process.execPath, [VITEST, 'run'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
