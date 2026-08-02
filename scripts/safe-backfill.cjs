// safe-backfill.cjs — 修正后回填算法 + 安全垃圾清除
// 🔴 修正: 禁止将对话标注到垃圾实体UUID
//
// SCRIPT-GOV-A2c: 治理合约门控 (CRITICAL, backfill)
//   默认: dry-run (扫描不写入)
//   写入: --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]
//   拒绝: 缺少必填字段 → exit 2

const { validateGate, recordGovernanceDecision } = require('./_governance-gate.cjs');

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
  else if (a === '--help') { console.log('Usage: node safe-backfill.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] [--report-path <path>]'); process.exit(0); }
}

const mode = argv.apply ? 'apply' : 'dry-run';
const isDryRun = mode === 'dry-run';

// ── 构建治理合约 (预检: 不含 DB 依赖的字段) ──
function buildPreflightContract() {
  return {
    scriptId: 'safe-backfill',
    riskLevel: 'CRITICAL',
    operationType: 'backfill',
    mode: mode,
    environment: 'local',
    operator: { operatorId: argv.operator || '', reason: argv.reason || '', ticket: argv.ticket || null },
    scope: { selector: argv.scope || 'table:conversations,memories,black_diamond', limit: 0, batchSize: 0, since: null, until: null },
    confirmation: { required: true, provided: !!argv.confirm, tokenDigest: argv.confirm || null },
    // backup 字段在预检阶段为 false — 实际备份在 DB 连接后创建
    backup: { required: true, created: false, backupId: null, backupPath: null, verified: false },
    irreversibleConfirmation: !!argv.confirm,
    reportPath: argv.reportPath || null,
  };
}

// ── 🔴 预检门控 (在 DB 访问之前) ──
if (!isDryRun) {
  var preflightContract = buildPreflightContract();
  var preflight = validateGate(preflightContract);
  // 仅检查非备份错误 (R001-R007, R011, R012 — 排除 R008-R010, R013)
  var preflightErrors = preflight.errors.filter(function(e) { return ['R008','R009','R010','R013'].indexOf(e.rule) === -1; });
  var preflightWarnings = preflight.warnings;

  if (preflightWarnings.length > 0) {
    console.warn('治理合约警告:');
    preflightWarnings.forEach(w => console.warn(`  [${w.rule}] ${w.message}`));
  }

  if (preflightErrors.length > 0) {
    console.error('\n═══════════════════════════════════════════');
    console.error('  SCRIPT EXECUTION CONTRACT DENIED');
    console.error('═══════════════════════════════════════════');
    console.error('  Script:  safe-backfill.cjs');
    console.error('  Risk:    CRITICAL');
    console.error('  Mode:    apply');
    console.error('  Operation: backfill');
    console.error('');
    console.error('  Issues:');
    preflightErrors.forEach(e => console.error('    [' + e.rule + '] ' + e.message));
    console.error('');
    console.error('  Refusing to continue.');
    console.error('═══════════════════════════════════════════\n');
    recordGovernanceDecision(preflightContract, preflight); process.exit(2);
  }
}

if (isDryRun) {
  console.log('═══════════════════════════════════════════');
  console.log('  DRY-RUN MODE — 将扫描但不写入');
  console.log('  使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际写入');
  console.log('═══════════════════════════════════════════\n');
}

const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const DB_PATH = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const FG_PATH = 'D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db';

// ── 备份 (apply 模式下, 写入前) ──
let bakCreated = false, bakPath = null, bakSize = null, bakVerified = false;
if (!isDryRun) {
  const fs = require('fs');
  const path = require('path');
  const bakDir = path.join(path.dirname(DB_PATH), 'backups');
  if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
  bakPath = path.join(bakDir, 'fusion_memory_before_safe_backfill_' + Date.now() + '.db');
  fs.copyFileSync(DB_PATH, bakPath);
  bakCreated = fs.existsSync(bakPath);
  bakSize = bakCreated ? fs.statSync(bakPath).size : null;
  bakVerified = bakCreated && bakSize > 0;
  console.log('已备份:', path.basename(bakPath), bakVerified ? '(已验证 ✓)' : '(验证失败)');

  // 用备份信息重建合约, 运行完整验证 (含 R008-R010, R013)
  const finalContract = buildPreflightContract();
  finalContract.backup = { required: true, created: bakCreated, backupId: bakPath, backupPath: bakPath, verified: bakVerified };

  const validation = validateGate(finalContract);
  if (!validation.allowed) {
    console.error('\n═══════════════════════════════════════════');
    console.error('  SCRIPT EXECUTION CONTRACT DENIED');
    console.error('═══════════════════════════════════════════');
    console.error('  Script:  safe-backfill.cjs');
    console.error('  Risk:    CRITICAL');
    console.error('  Mode:    apply');
    console.error('  Operation: backfill');
    console.error('');
    console.error('  Issues:');
    validation.errors.forEach(e => console.error('    [' + e.rule + '] ' + e.message));
    console.error('');
    console.error('  Refusing to continue.');
    console.error('═══════════════════════════════════════════\n');
    recordGovernanceDecision(finalContract, validation); process.exit(2);
  }
  console.log('治理合约验证: 通过 ✓');
}

const db = new D(DB_PATH);
const fg = new D(FG_PATH, {readonly: true});
db.pragma('journal_mode=DELETE');

// 🔴 垃圾UUID黑名单——永不被标注
const GARBAGE_UUIDS = fg.prepare(`SELECT uuid FROM nodes WHERE name IN
  ('什么名字','那你再','那你说','那继续','加班','姐姐','老家',
   '公司','学生','小说','开心','时候你','纪实小','计划吗','姑姑','上司','小龙','老邱','老大','焦虑','方案','无聊','徐茜','徐敏')`).all().map(r => r.uuid).filter(Boolean);
const GARBAGE_SET = new Set(GARBAGE_UUIDS);

console.log('垃圾UUID名单: ' + GARBAGE_SET.size + '个');
console.log('');

// 合法角色
const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶')").all()
  .filter(c => !GARBAGE_SET.has(c.uuid));

console.log('合法角色: ' + CHARS.length + '个');
console.log('');

// === PHASE 1: 回填 (禁止标注到垃圾UUID) ===
let convAdded = 0, memAdded = 0;

if (!isDryRun) {

for (const c of CHARS) {
  const n = c.name, u = c.uuid;

  // 关键词回填 — 但只在内容真正匹配时才标注
  try {
    const r = db.prepare(`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND content LIKE '%${n}%'`).run();
    convAdded += r.changes;
  } catch(e) {}

  // 自称检测
  const selfPatterns = [
    `content LIKE '%我是${n}%'`, `content LIKE '%我就是${n}%'`, `content LIKE '%我叫${n}%'`,
    `content LIKE '%${n}来了%'`, `content LIKE '%${n}在呢%'`, `content LIKE '%是${n}呀%'`,
    `content LIKE '%${n}就在%'`, `content LIKE '%${n}说%'`,
  ];
  for (const p of selfPatterns) {
    try {
      const r = db.prepare(`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND ${p}`).run();
      convAdded += r.changes;
    } catch(e) {}
  }
}

// memories 从 conversations 回填
const mr = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
memAdded = mr.changes;

// 时间窗口扩散
const anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
let tw = 0;
for (const a of anchors) {
  if (GARBAGE_SET.has(a.belong_entity_uuid)) continue;
  try {
    const s = new Date(new Date(a.created_at).getTime() - 2*60*60*1000).toISOString();
    const e = new Date(new Date(a.created_at).getTime() + 2*60*60*1000).toISOString();
    const r = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    tw += r.changes;
  } catch(e) {}
}

// black_diamond
const bdr = db.prepare("UPDATE black_diamond SET belong_entity_uuid = (SELECT m.belong_entity_uuid FROM memories m WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").run();

console.log('Phase 1 回填: convs +' + convAdded + ' mems +' + memAdded + '(JOIN) +' + tw + '(TW) BD +' + bdr.changes);

} else {
  // Dry-run: scan only
  const convNeed = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL").get().c;
  const memNeed = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL").get().c;
  const bdNeed = db.prepare("SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").get().c;
  console.log('[DRY-RUN] Phase 1 would backfill: convs ~' + convNeed + ', mems ~' + memNeed + ', BD ~' + bdNeed);
  console.log('[DRY-RUN] 使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行写入');
}

// 标记 (两种模式都运行)
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('');
console.log('convs: ' + cl + '/' + ct + ' (' + (cl/ct*100).toFixed(1) + '%)');
console.log('mems:  ' + ml + '/' + mt + ' (' + (ml/mt*100).toFixed(1) + '%)');

// === PHASE 2: 安全清除 ===
let delConv = 0, delMem = 0, delGarbage = 0;

if (!isDryRun) {

// 清除标注到垃圾UUID的对话
for (const gu of GARBAGE_SET) {
  try {
    const dc = db.prepare(`DELETE FROM conversations WHERE belong_entity_uuid='${gu}'`).run();
    const dm = db.prepare(`DELETE FROM memories WHERE belong_entity_uuid='${gu}'`).run();
    delGarbage += dc.changes + dm.changes;
  } catch(e) {}
}
console.log('');
console.log('Phase 2: 删除标注在垃圾UUID的记录: ' + delGarbage + '条');

// 删除完全未标注的
const dc = db.prepare('DELETE FROM conversations WHERE belong_entity_uuid IS NULL').run();
const dm = db.prepare('DELETE FROM memories WHERE belong_entity_uuid IS NULL').run();
const dbd = db.prepare('DELETE FROM black_diamond WHERE belong_entity_uuid IS NULL AND source_id IS NULL').run();
delConv = dc.changes; delMem = dm.changes;
console.log('删除未标注: convs ' + delConv + ' mems ' + delMem + ' BD ' + dbd.changes);

} else {
  const gc = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IN (SELECT uuid FROM nodes WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家','公司','学生','小说','开心','时候你','纪实小','计划吗','姑姑','上司','小龙','老邱','老大','焦虑','方案','无聊','徐茜','徐敏'))").get().c;
  const nc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
  const nm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
  console.log('[DRY-RUN] Phase 2 would delete: garbage ~' + gc + ', unlabeled convs ~' + nc + ', unlabeled mems ~' + nm);
}

// 验证
const cta = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cla = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const cua = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
const mta = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const mla = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const mua = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
console.log('');
console.log('convs: ' + cta + '条, 标注=' + cla + ' (' + (cla/cta*100).toFixed(1) + '%), NULL=' + cua);
console.log('mems:  ' + mta + '条, 标注=' + mla + ' (' + (mla/mta*100).toFixed(1) + '%), NULL=' + mua);

// 关键角色
console.log('');
console.log('═══ 关键角色验证 ═══');
for (const name of ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬','熊勇','林土锋','阿珍']) {
  const u = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get().uuid;
  const cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  console.log(name + ': convs=' + cc + ' mems=' + cm);
}

db.close();
fg.close();
console.log('\n✅ 安全回填完成');
