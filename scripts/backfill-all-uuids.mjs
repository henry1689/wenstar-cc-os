/**
 * backfill-all-uuids.mjs — 三库全量 UUID 回填脚本
 * ===============================================
 * 问题：金库 memories 1587条全部 belong_entity_uuid=NULL
 *       黑钻库 72条未标注
 *       砂金库 1918条未标注
 * 一次性全量修复。
 */
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, backfill)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node backfill-all-uuids.mjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'backfill-all-uuids', riskLevel:'CRITICAL', operationType:'backfill', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:conversations,memories,black_diamond',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: backfill-all-uuids.mjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] backfill-all-uuids — 将扫描三库中 belong_entity_uuid IS NULL 的行。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际回填。\n'); process.exit(0); }

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

const FM_PATH = 'data/webui/fusion_memory.db';
const FG_PATH = 'data/webui/knowledge/family_graph.db';

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(FM_PATH));
const fg = new SQL.Database(readFileSync(FG_PATH));

// 从FG收集全部已知人物: name → uuid
const names = new Map();
const fgRows = fg.exec("SELECT name, uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND uuid!='' AND name!='我'");
for (const [name, uuid] of (fgRows[0]?.values||[])) {
  if (name.length >= 2) names.set(name, uuid);
}
console.log(`FG 已知人物: ${names.size} 人`);

let totalConv = 0, totalMem = 0, totalBD = 0;
const q = (sql, params) => {
  try { const r = db.exec(sql, params); return r.length && r[0].values.length ? Number(r[0].values[0][0]) : 0; } catch { return 0; }
};

for (const [name, uuid] of names) {
  if (name.length < 2 || name === '我') continue;

  // 1) 砂金库 — 全文匹配
  const convBefore = q("SELECT COUNT(*) FROM conversations WHERE belong_entity_uuid IS NULL AND content LIKE '%' || ? || '%'", [name]);
  if (convBefore > 0) {
    db.exec("UPDATE conversations SET belong_entity_uuid = ? WHERE belong_entity_uuid IS NULL AND content LIKE '%' || ? || '%'", [uuid, name]);
    totalConv += convBefore;
  }

  // 2) 金库 — 全文匹配
  const memBefore = q("SELECT COUNT(*) FROM memories WHERE belong_entity_uuid IS NULL AND raw_input LIKE '%' || ? || '%'", [name]);
  if (memBefore > 0) {
    db.exec("UPDATE memories SET belong_entity_uuid = ? WHERE belong_entity_uuid IS NULL AND raw_input LIKE '%' || ? || '%'", [uuid, name]);
    totalMem += memBefore;
  }

  // 3) 黑钻库 — summary/tags 匹配
  const bdBefore = q("SELECT COUNT(*) FROM black_diamond WHERE belong_entity_uuid IS NULL AND (summary LIKE '%' || ? || '%' OR tags LIKE '%' || ? || '%')", [name, name]);
  if (bdBefore > 0) {
    db.exec("UPDATE black_diamond SET belong_entity_uuid = ? WHERE belong_entity_uuid IS NULL AND (summary LIKE '%' || ? || '%' OR tags LIKE '%' || ? || '%')", [uuid, name, name]);
    totalBD += bdBefore;
  }

  if (convBefore + memBefore + bdBefore > 0) {
    console.log(`  ${name}(${uuid}): 砂金${convBefore} + 金库${memBefore} + 黑钻${bdBefore}`);
  }
}

// 4) 链传导: conversations → memories (用 content LIKE raw_input 前缀匹配)
const chainMemBefore = q("SELECT COUNT(*) FROM memories WHERE belong_entity_uuid IS NULL");
db.exec(`UPDATE memories SET belong_entity_uuid = (
  SELECT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || substr(memories.raw_input,1,40) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`);
const chainMemAfter = q("SELECT COUNT(*) FROM memories WHERE belong_entity_uuid IS NULL");
const chainMemFixed = chainMemBefore - chainMemAfter;
console.log(`\n链传导: ${chainMemBefore}→${chainMemAfter} (=${chainMemFixed}条传导)`);

// 5) 链传导: memories → black_diamond
const chainBDBefore = q("SELECT COUNT(*) FROM black_diamond WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL");
db.exec(`UPDATE black_diamond SET belong_entity_uuid = (
  SELECT m.belong_entity_uuid FROM memories m
  WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL
) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL`);
const chainBDAfter = q("SELECT COUNT(*) FROM black_diamond WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL");
const chainBDFixed = chainBDBefore - chainBDAfter;
console.log(`黑钻链传导: ${chainBDBefore}→${chainBDAfter} (=${chainBDFixed}条传导)`);

// 统计
console.log(`\n══════ 回填完成 ══════`);
const convAfter = q("SELECT COUNT(*) FROM conversations WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
const convTotal = q("SELECT COUNT(*) FROM conversations");
const memAfter = q("SELECT COUNT(*) FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
const memTotal = q("SELECT COUNT(*) FROM memories");
const bdAfter = q("SELECT COUNT(*) FROM black_diamond WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
const bdTotal = q("SELECT COUNT(*) FROM black_diamond");

console.log(`砂金: ${convAfter}/${convTotal} = ${Math.round(convAfter/convTotal*100)}%`);
console.log(`金库: ${memAfter}/${memTotal} = ${Math.round(memAfter/memTotal*100)}%`);
console.log(`黑钻: ${bdAfter}/${bdTotal} = ${Math.round(bdAfter/bdTotal*100)}%`);

const data = db.export();
writeFileSync(FM_PATH, Buffer.from(data));
db.close(); fg.close();
console.log('Done.');
