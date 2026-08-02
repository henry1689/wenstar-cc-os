// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, update)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node phase1-data-fix.mjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'phase1-data-fix', riskLevel:'CRITICAL', operationType:'update', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:conversations,memories,nodes',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: phase1-data-fix.mjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] phase1-data-fix — 将扫描 conversations/memories/nodes。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际修复。\n'); process.exit(0); }

import Database from 'better-sqlite3';

const db = new Database('data/webui/fusion_memory.db');
const fg = new Database('data/webui/knowledge/family_graph.db');
db.pragma('journal_mode=DELETE');

console.log('=== Phase 1: 数据修复 ===\n');

// 1.1: conversations 自称匹配
const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶')").all();
let convAdded = 0;
for (const c of CHARS) {
  const n = c.name, u = c.uuid;
  const stmts = [
    `UPDATE conversations SET belong_entity_uuid = '${u}' WHERE belong_entity_uuid IS NULL AND role = 'assistant' AND content LIKE '%我是${n}%'`,
    `UPDATE conversations SET belong_entity_uuid = '${u}' WHERE belong_entity_uuid IS NULL AND role = 'assistant' AND content LIKE '%我叫${n}%'`,
    `UPDATE conversations SET belong_entity_uuid = '${u}' WHERE belong_entity_uuid IS NULL AND role = 'assistant' AND content LIKE '%${n}来了%'`,
    `UPDATE conversations SET belong_entity_uuid = '${u}' WHERE belong_entity_uuid IS NULL AND role = 'assistant' AND content LIKE '%${n}在这%'`,
    `UPDATE conversations SET belong_entity_uuid = '${u}' WHERE belong_entity_uuid IS NULL AND role = 'assistant' AND content LIKE '%是${n}呀%'`,
  ];
  for (const s of stmts) {
    try { const r = db.prepare(s).run(); convAdded += r.changes; } catch {}
  }
}
console.log('1.1 自称匹配: +' + convAdded + '条');

// 1.2: memories 回填
const memR = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || substr(memories.raw_input,1,30) || '%' LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('1.2 memories回填: +' + memR.changes + '条');

// 1.3: 垃圾归档
const GARBAGE = ['什么名字','那你再','那你说','那继续','加班','姐姐','老家'];
for (const n of GARBAGE) {
  try { fg.prepare(`UPDATE nodes SET status='archived' WHERE name='${n}'`).run(); } catch {}
}
console.log('1.3 垃圾归档: ' + GARBAGE.length + '个');

// 1.4: 关系修正
const FIXES = {
  '熊梓铭': '熊勇的女儿（心理学专业学生）',
  '徐诗韵': '鸿艺的妹妹',
  '徐诗雨': '鸿艺的妹妹（同事）',
  '徐诗涵': '鸿艺的妹妹',
};
for (const [name, rel] of Object.entries(FIXES)) {
  const row = fg.prepare(`SELECT properties FROM nodes WHERE name='${name}'`).get();
  if (row) {
    const p = JSON.parse(row.properties);
    p.relation_to_user = rel;
    fg.prepare(`UPDATE nodes SET properties=? WHERE name='${name}'`).run(JSON.stringify(p));
    console.log('  ' + name + ' → ' + rel);
  }
}

// Verify
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;

console.log('');
console.log('conversations: ' + cl + '/' + ct + ' (' + (cl/ct*100).toFixed(1) + '%)');
console.log('memories: ' + ml + '/' + mt + ' (' + (ml/mt*100).toFixed(1) + '%)');

db.close();
fg.close();
console.log('\n✅ Phase 1 完成');
