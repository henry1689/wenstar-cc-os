#!/usr/bin/env node
// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-17
// Chat Latency Profiling — measures /api/health, /api/chat, /api/chat/stream.
// Zero dependencies. Read-only. Does NOT write DB. Does NOT start server.

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const RUNS = parseInt(process.env.RUNS || '3', 10);
const CHAT_MSG = process.env.CHAT_MSG || '你好';
const TIMEOUT_MS = 35000;

const hrt = () => BigInt(Date.now()) * 1_000_000n; // ms-precision via Date.now

// ── GET helper ──
async function get(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const r = await fetch(BASE + path, { signal: ctrl.signal });
    const dt = performance.now() - start;
    clearTimeout(t);
    const text = await r.text();
    return { status: r.status, dt: Math.round(dt), text };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, dt: Math.round(performance.now() - start), error: e.code || e.message };
  }
}

// ── POST helper ──
async function post(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const dt = performance.now() - start;
    clearTimeout(t);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, dt: Math.round(dt), text, json };
  } catch (e) {
    clearTimeout(t);
    return { status: 0, dt: Math.round(performance.now() - start), error: e.code || e.message };
  }
}

// ── Stream helper ──
async function streamFirstChunk(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = performance.now();
  let headersAt = 0;
  let firstChunkAt = 0;
  let totalChunks = 0;
  let totalDuration = 0;
  const chunks = [];
  let respStatus = 0;

  try {
    const resp = await fetch(BASE + path, { signal: ctrl.signal });
    respStatus = resp.status;
    headersAt = Math.round(performance.now() - start);
    const reader = resp.body?.getReader();
    if (!reader) {
      clearTimeout(t);
      return { status: respStatus, headersAt, firstChunkAt: -1, totalChunks: 0, totalDuration: headersAt, error: 'no reader' };
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && totalChunks === 0) firstChunkAt = Math.round(performance.now() - start);
      totalChunks++;
      chunks.push(new TextDecoder().decode(value));
    }
    reader.releaseLock();
    totalDuration = Math.round(performance.now() - start);
    clearTimeout(t);
  } catch (e) {
    clearTimeout(t);
    const dt = Math.round(performance.now() - start);
    return { status: respStatus || 0, headersAt: headersAt || dt, firstChunkAt: firstChunkAt || dt, totalChunks, totalDuration: dt, error: e.code || e.message };
  }

  return { status: respStatus, headersAt, firstChunkAt, totalChunks, totalDuration, chunkSample: chunks.slice(0, 2).map(c => c.substring(0, 80)).join(' | ') };
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  WenstarOS Chat Latency Profiling');
  console.log('  BASE: ' + BASE + '  RUNS: ' + RUNS + '  MSG: "' + CHAT_MSG + '"');
  console.log('═══════════════════════════════════════════\n');

  // 1. Health baseline
  console.log('── 1. Health Baseline ──');
  const health = await get('/api/health');
  console.log('  health: ' + health.dt + 'ms  status:' + health.status + '\n');

  if (health.status !== 200) {
    console.log('[profile] ❌ Server not healthy. Aborting.');
    process.exit(1);
  }

  // 2. Chat total latency
  console.log('── 2. POST /api/chat Total Latency (' + RUNS + ' runs) ──');
  const chatTimes = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write('  run ' + (i + 1) + '/' + RUNS + '... ');
    const r = await post('/api/chat', { message: CHAT_MSG });
    const dt = r.dt;
    chatTimes.push(dt);
    const replyLen = r.json?.reply?.length || 0;
    const note = r.status === 200 ? '200 reply=' + replyLen + 'ch' : (r.status + ' ' + (r.error || ''));
    console.log(dt + 'ms  ' + note);
  }
  const chatAvg = Math.round(chatTimes.reduce((a, b) => a + b, 0) / chatTimes.length);
  const chatMin = Math.min(...chatTimes);
  const chatMax = Math.max(...chatTimes);
  console.log('  avg:' + chatAvg + 'ms  min:' + chatMin + 'ms  max:' + chatMax + 'ms\n');

  // 3. Stream latency
  console.log('── 3. GET /api/chat/stream Latency (' + RUNS + ' runs) ──');
  const streamHeaders = [];
  const streamFirstChunks = [];
  const streamTotals = [];
  const streamChunkCounts = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write('  run ' + (i + 1) + '/' + RUNS + '... ');
    const r = await streamFirstChunk('/api/chat/stream?message=' + encodeURIComponent(CHAT_MSG));
    streamHeaders.push(r.headersAt);
    streamFirstChunks.push(r.firstChunkAt);
    streamTotals.push(r.totalDuration);
    streamChunkCounts.push(r.totalChunks);
    const line = [
      'headers:' + r.headersAt + 'ms',
      'firstChunk:' + r.firstChunkAt + 'ms',
      'total:' + r.totalDuration + 'ms',
      'chunks:' + r.totalChunks,
    ];
    if (r.error) line.push(r.error);
    console.log(line.join('  '));
  }
  const shAvg = Math.round(streamHeaders.reduce((a, b) => a + b, 0) / streamHeaders.length);
  const sfcAvg = Math.round(streamFirstChunks.filter(x => x > 0).reduce((a, b) => a + b, 0) / streamFirstChunks.filter(x => x > 0).length || 1);
  const stAvg = Math.round(streamTotals.reduce((a, b) => a + b, 0) / streamTotals.length);
  const scAvg = Math.round(streamChunkCounts.reduce((a, b) => a + b, 0) / streamChunkCounts.length);
  console.log('  avg headers:' + shAvg + 'ms  firstChunk:' + sfcAvg + 'ms  total:' + stAvg + 'ms  chunks:' + scAvg + '\n');

  // 4. Summary
  console.log('═══════════════════════════════════════════');
  console.log('  Latency Summary');
  console.log('═══════════════════════════════════════════');
  console.log('  health:              ' + health.dt + 'ms');
  console.log('  chat (non-stream):   avg=' + chatAvg + 'ms  min=' + chatMin + 'ms  max=' + chatMax + 'ms  (x' + RUNS + ')');
  console.log('  stream headers:      avg=' + shAvg + 'ms');
  console.log('  stream first chunk:  avg=' + sfcAvg + 'ms');
  console.log('  stream total:        avg=' + stAvg + 'ms  (x' + RUNS + ', ~' + scAvg + ' chunks)');
  console.log('═══════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
