#!/usr/bin/env node
/**
 * 太虚境·WebUI 启动器
 * 在 tsx 启动前加载 .env 到 process.env，确保所有 import 的模块能读到环境变量
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const TSC_CLI = path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');

// 加载 .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (key) process.env[key] = val;
  }
  console.log('[Start] .env 已加载');
}

// ── 启动前脚本（非阻断，静默收集结果） ──
// 🔴 V15: prestart-patch.ts 已删除
// 🔴 V15: rebuild-memories → SQLiteAdapter._rebuildMemoryAnchors()
// 🔴 V16: backfill-uuid → repairDataIntegrity, fix-xsy-kb → _fixKnowledgeBase,
//         fix-all-entities-final → _fixEntityRelations + _fixKnowledgeBase
const prestartScripts = [
  { label: 'KB闸门', cmd: `node "${path.join(__dirname, 'scripts', 'fix-kb-gates.cjs')}"` },
  { label: 'Edge清理', cmd: `node "${path.join(__dirname, 'scripts', 'clean-all-person-edges.cjs')}"` },
  { label: '时空回填', cmd: `node "${path.join(__dirname, 'scripts', 'backfill-temporals.cjs')}"` },
];

const prestartResults = [];
// V20: 写库脚本守卫 — 若端口 3000 已被旧实例占用，跳过所有写库脚本（并发写 fusion_memory.db 会 SQLITE_CORRUPT）
const PORT = process.env.PORT || '3000';
let _portBusy = false;
try {
  const out = execSync(`netstat -ano | findstr ":${PORT}.*LISTENING"`, { encoding: 'utf8', timeout: 5000, shell: 'cmd' }).toString().trim();
  _portBusy = out.length > 0;
} catch { _portBusy = false; }
if (_portBusy) {
  console.warn(`[Start] ⚠️ 端口 ${PORT} 已被占用，跳过 ${prestartScripts.length} 个写库脚本（防 DB 损坏）。`);
}

for (const s of prestartScripts) {
  if (_portBusy) { prestartResults.push({ label: s.label, ok: false, reason: '端口占用，跳过写库' }); continue; }
  try {
    execSync(s.cmd, { cwd: __dirname, stdio: 'pipe', timeout: 30000 });
    prestartResults.push({ label: s.label, ok: true });
  } catch (e) {
    prestartResults.push({ label: s.label, ok: false, reason: (e.stderr || e.message || '').toString().split('\n')[0] });
  }
}

// 汇总非阻断结果
const failed = prestartResults.filter(r => !r.ok);
if (failed.length > 0) {
  console.warn('[Start] ' + failed.length + ' 个启动前脚本跳过（不影响启动）:');
  for (const f of failed) console.warn('  - ' + f.label + ': ' + (f.reason || 'unknown'));
}

// 启动 server.ts
console.log('[Start] 启动 server.ts (端口 ' + (process.env.PORT || '3000') + ')...');
const memLimit = process.env.TIANQUAN_LITE === 'true'
  ? '--max-old-space-size=10240'
  : '--max-old-space-size=12288';
const child = spawn('node', [TSC_CLI, 'src/webui/server.ts'], { shell: true,
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: memLimit },
});

child.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n[Start] ❌ 端口 ' + (process.env.PORT || '3000') + ' 已被占用。');
    console.error('[Start]    可能已有实例在运行 → http://localhost:' + (process.env.PORT || '3000') + '/api/health');
    console.error('[Start]    如需重启: npm run port:3000  # 先检查端口');
  } else {
    console.error('[Start] 启动失败:', err.message);
  }
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
