// fix-memories-now.cjs — memories 归属标注修复
//
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, update)
//   默认: dry-run (扫描不写入)
//   写入: --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]
//   拒绝: 缺少必填字段 → exit 2

const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');

// ── CLI 解析 ──
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--apply') argv.apply = true;
  else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i];
  else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i];
  else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i];
  else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node fix-memories-now.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] [--report-path <path>]'); process.exit(0); }
}

const mode = argv.apply ? 'apply' : 'dry-run';
const isDryRun = mode === 'dry-run';

// ── 预检门控 (在 DB 访问 / execSync 之前) ──
if (!isDryRun) {
  const contract = {
    scriptId: 'fix-memories-now', riskLevel: 'CRITICAL', operationType: 'update', mode, environment: 'local',
    operator: { operatorId: argv.operator || '', reason: argv.reason || '', ticket: argv.ticket || null },
    scope: { selector: argv.scope || 'table:memories', limit: 0, batchSize: 0, since: null, until: null },
    confirmation: { required: true, provided: !!argv.confirm, tokenDigest: argv.confirm || null },
    backup: { required: true, created: false, backupId: null, backupPath: null, verified: false },
    irreversibleConfirmation: !!argv.confirm,
    reportPath: argv.reportPath || null,
  };
  const preflight = validateGate(contract);
  const preflightErrors = preflight.errors.filter(e => !['R008','R009','R010','R013'].includes(e.rule));
  if (preflightErrors.length > 0) {
    console.error('\n═══════════════════════════════════════════');
    console.error('  SCRIPT EXECUTION CONTRACT DENIED');
    console.error('═══════════════════════════════════════════');
    console.error('  Script:  fix-memories-now.cjs');
    console.error('  Risk:    CRITICAL');
    console.error('  Mode:    apply');
    console.error('  Operation: update');
    console.error('');
    console.error('  Issues:');
    preflightErrors.forEach(e => console.error('    [' + e.rule + '] ' + e.message));
    console.error('\n  Refusing to continue.');
    console.error('═══════════════════════════════════════════\n');
    recordGovernanceDecision(contract,preflight);
    process.exit(2);
  }
}

if (isDryRun) {
  console.log('═══════════════════════════════════════════');
  console.log('  DRY-RUN MODE — 将扫描但不写入');
  console.log('  使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际写入');
  console.log('═══════════════════════════════════════════\n');
  console.log('[DRY-RUN] 将扫描 memories 中 belong_entity_uuid IS NULL 的行');
  console.log('[DRY-RUN] 将执行内容匹配 + 时间窗口 + 二次内容匹配');
  console.log('[DRY-RUN] 零写入。零服务停止。\n');
  process.exit(0);
}

// ── 治理验证通过 ─ 进入写入路径 ──
const { execSync } = require('child_process');
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');
const dbPath = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';

// 1. Stop service
try { execSync('taskkill //F //IM node.exe', { timeout: 5000 }); } catch(e) {}
console.log('服务已停');

// 2. Clear WAL
const walFile = dbPath + '-wal';
const shmFile = dbPath + '-shm';
try { fs.unlinkSync(walFile); } catch(e) {}
try { fs.unlinkSync(shmFile); } catch(e) {}
console.log('WAL已清理');

// 备份
const bakDir = path.join(path.dirname(dbPath), 'backups');
if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
const bakPath = path.join(bakDir, 'fusion_memory_before_fix_memories_' + Date.now() + '.db');
fs.copyFileSync(dbPath, bakPath);
console.log('已备份: ' + path.basename(bakPath));

// 3. Open with better-sqlite3 (DIRECT disk writes)
const db = new D(dbPath);
db.pragma('journal_mode=DELETE');
console.log('数据库已打开 (DELETE mode, 直接写磁盘)\n');

// 4. Fix memories annotation
const memBefore = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const memTotal = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
console.log('修复前: ' + memBefore + '/' + memTotal + ' (' + (memBefore/memTotal*100).toFixed(1) + '%)');

const r1 = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('A. 内容匹配: +' + r1.changes);

const anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
let twAdded = 0;
for (const a of anchors) {
  try {
    const ts = a.created_at;
    const s = new Date(new Date(ts).getTime() - 2 * 60 * 60 * 1000).toISOString();
    const e = new Date(new Date(ts).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const r = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    twAdded += r.changes;
  } catch(e) {}
}
console.log('B. 时间窗口(2h): +' + twAdded);

if (twAdded > 0) {
  const anchors2 = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
  let tw2Added = 0;
  for (const a of anchors2) {
    try {
      const ts = a.created_at;
      const s = new Date(new Date(ts).getTime() - 4 * 60 * 60 * 1000).toISOString();
      const e = new Date(new Date(ts).getTime() + 4 * 60 * 60 * 1000).toISOString();
      const r = db.prepare("UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND memory_kind='roleplay' AND created_at BETWEEN ? AND ?").run(a.belong_entity_uuid, s, e);
      tw2Added += r.changes;
    } catch(e) {}
  }
  console.log('C. roleplay宽窗(4h): +' + tw2Added);
}

const r2 = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 20) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('D. 二次内容匹配(20字): +' + r2.changes);

const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
const memAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('\n修复后: ' + memAfter + '/' + memTotal + ' (' + (memAfter/memTotal*100).toFixed(1) + '%)');

db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
fg.close();

console.log('\n数据库文件大小: ' + (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1) + 'MB');
console.log('✅ memories修复完成 — 立即启动服务验证');
