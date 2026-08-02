#!/usr/bin/env node
// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-07
// Wait for WenstarOS server health endpoint to return "ok".
// Does NOT start the server. Just polls /api/health until ready or timeout.
//
// Usage:
//   node scripts/wait-for-health.cjs
//   node scripts/wait-for-health.cjs --url http://localhost:3000/api/health --timeout 30000 --interval 1000

const DEFAULT_URL = 'http://localhost:3000/api/health';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_INTERVAL_MS = 1000;

function parseArgs() {
  const args = { url: DEFAULT_URL, timeout: DEFAULT_TIMEOUT_MS, interval: DEFAULT_INTERVAL_MS };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--url' && process.argv[i + 1]) { args.url = process.argv[++i]; }
    else if (process.argv[i] === '--timeout' && process.argv[i + 1]) { args.timeout = parseInt(process.argv[++i], 10) || DEFAULT_TIMEOUT_MS; }
    else if (process.argv[i] === '--interval' && process.argv[i + 1]) { args.interval = parseInt(process.argv[++i], 10) || DEFAULT_INTERVAL_MS; }
    else if (process.argv[i] === '--help') {
      console.log('Usage: node scripts/wait-for-health.cjs [--url <url>] [--timeout <ms>] [--interval <ms>]');
      console.log('Defaults: --url http://localhost:3000/api/health --timeout 30000 --interval 1000');
      process.exit(0);
    }
  }
  return args;
}

async function checkHealth(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.status === 200) {
      try { const data = await r.json(); return data.status === 'ok' ? 'ok' : 'bad-status'; }
      catch { return 'bad-json'; }
    }
    return 'http-' + r.status;
  } catch (e) {
    clearTimeout(t);
    return 'no-connection';
  }
}

async function main() {
  const args = parseArgs();
  const start = Date.now();
  let attempt = 0;

  console.log(`[wait] Polling ${args.url} (timeout=${args.timeout}ms, interval=${args.interval}ms)`);

  while (Date.now() - start < args.timeout) {
    attempt++;
    const status = await checkHealth(args.url);

    if (status === 'ok') {
      const elapsed = Date.now() - start;
      console.log(`[wait] ✅ Server healthy after ${attempt} attempts (${elapsed}ms)`);
      process.exit(0);
    }

    if (attempt === 1 || attempt % 5 === 0) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[wait] Attempt ${attempt}: ${status} (${elapsed}s elapsed)`);
    }

    await new Promise(r => setTimeout(r, args.interval));
  }

  console.error(`[wait] ❌ Timeout after ${attempt} attempts (${args.timeout}ms). Server not ready.`);
  console.error('Start server with: node start.cjs');
  process.exit(1);
}

main();
