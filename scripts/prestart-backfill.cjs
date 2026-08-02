// prestart-backfill.cjs — 在服务启动前用 better-sqlite3 直接写磁盘
// sql.js 的 flush() 无法持久化子查询 UPDATE，必须用本机 better-sqlite3
//
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, backfill)
//   默认: dry-run (扫描不写入)
//   写入: --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]
//   拒绝: 缺少必填字段 → exit 2

const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');

// ── 治理 CLI 参数解析 ──
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
  else if (a === '--help') { console.log('Usage: node prestart-backfill.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] [--report-path <path>]'); process.exit(0); }
}

const mode = argv.apply ? 'apply' : 'dry-run';
const isDryRun = mode === 'dry-run';

// ── 预检门控 (在 DB/FS 访问之前) ──
if (!isDryRun) {
  const contract = {
    scriptId: 'prestart-backfill', riskLevel: 'CRITICAL', operationType: 'backfill', mode, environment: 'local',
    operator: { operatorId: argv.operator || '', reason: argv.reason || '', ticket: argv.ticket || null },
    scope: { selector: argv.scope || 'table:memories', limit: 0, batchSize: 0, since: null, until: null },
    confirmation: { required: true, provided: !!argv.confirm, tokenDigest: argv.confirm || null },
    backup: { required: true, created: false, backupId: null, backupPath: null, verified: false },
    irreversibleConfirmation: !!argv.confirm,
    reportPath: argv.reportPath || null,
  };

  const preflight = validateGate(contract);
  const preflightErrors = preflight.errors.filter(e => !['R008','R009','R010','R013'].includes(e.rule));
  if (preflight.warnings.length > 0) preflight.warnings.forEach(w => console.warn('  [' + w.rule + '] ' + w.message));
  if (preflightErrors.length > 0) {
    console.error('\n═══════════════════════════════════════════');
    console.error('  SCRIPT EXECUTION CONTRACT DENIED');
    console.error('═══════════════════════════════════════════');
    console.error('  Script:  prestart-backfill.cjs');
    console.error('  Risk:    CRITICAL');
    console.error('  Mode:    apply');
    console.error('  Operation: backfill');
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
  console.log('[DRY-RUN] 将扫描 memories 表中 belong_entity_uuid IS NULL 的行');
  console.log('[DRY-RUN] 将执行 JOIN + 时间窗口回填');
  console.log('[DRY-RUN] 零写入。使用 --apply 执行实际回填。\n');
  process.exit(0);
}

// ── 治理验证通过 ─ 进入写入路径 ──
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.SCRIPT_GOV_TEST_DB || 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';

// 备份
const bakDir = path.join(path.dirname(dbPath), 'backups');
if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
const bakPath = path.join(bakDir, 'fusion_memory_before_prestart_backfill_' + Date.now() + '.db');
fs.copyFileSync(dbPath, bakPath);
console.log('已备份: ' + path.basename(bakPath));

const db = new D(dbPath);
db.pragma('journal_mode=DELETE');

const memBefore = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const memTotal = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
console.log('memories标注: ' + memBefore + '/' + memTotal + ' (' + (memBefore/memTotal*100).toFixed(1) + '%)');

// 直接 JOIN 更新——better-sqlite3 直接写磁盘
const r = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('JOIN回填: +' + r.changes + '条');

// 时间窗口补充
const anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
let tw = 0;
for (const a of anchors) {
  try {
    const s = new Date(new Date(a.created_at).getTime() - 2*60*60*1000).toISOString();
    const e = new Date(new Date(a.created_at).getTime() + 2*60*60*1000).toISOString();
    const rr = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    tw += rr.changes;
  } catch(e) {}
}
console.log('时间窗口: +' + tw + '条');

const memAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('修复后: ' + memAfter + '/' + memTotal + ' (' + (memAfter/memTotal*100).toFixed(1) + '%)');

// 验证几个关键角色 (skip if family_graph.db unavailable in test env)
try {
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
for (const name of ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬']) {
  const u = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get().uuid;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  const ck = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%${name}%'`).get().c;
  console.log(name + ': mems=' + cm + '/' + ck);
}
fg.close();
} catch(e) { /* SCRIPT-GOV-C: family_graph.db unavailable in test env — verification skipped */ }

try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
db.close();

const sz = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1);
console.log('\nDB文件: ' + sz + 'MB');
console.log('✅ prestart-backfill 完成');
