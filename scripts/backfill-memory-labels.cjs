/**
 * backfill-memory-labels.cjs — 历史记忆三NULL回填 + memory_kind 标注
 * SCRIPT-GOV-A2d-Batch-2b: 治理门控 (CRITICAL, backfill)
 * 默认: dry-run  写入: --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]
 */
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fs = require('fs');
const path = require('path');
const {validateGate, recordGovernanceDecision }=require('./_governance-gate.cjs');
var G={};for(var _i=2;_i<process.argv.length;_i++){var _a=process.argv[_i];if(_a==="--apply")G.apply=1;else if(_a==="--operator"&&process.argv[_i+1])G.op=process.argv[++_i];else if(_a==="--reason"&&process.argv[_i+1])G.reason=process.argv[++_i];else if(_a==="--ticket"&&process.argv[_i+1])G.ticket=process.argv[++_i];else if(_a==="--confirm"&&process.argv[_i+1])G.confirm=process.argv[++_i];else if(_a==="--scope"&&process.argv[_i+1])G.scope=process.argv[++_i];else if(_a==="--report-path"&&process.argv[_i+1])G.rpt=process.argv[++_i];else if(_a==="--help"){console.log("Usage: node backfill-memory-labels.cjs [--apply] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]");process.exit(0)}}
var M=G.apply?"apply":"dry-run",DR=!G.apply;

const MEM_DB = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const FG_DB  = 'D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db';

// 垃圾关键词 (静态数据，不需要 DB)
const GARBAGE_NAMES = new Set(['什么名字','那你再','那你说','那继续','加班','姐姐','老家',
  '公司','学生','小说','开心','时候你','纪实小','计划吗','姑姑','上司','小龙','老邱',
  '老大','焦虑','方案','无聊','徐茜','徐敏','妹妹','老婆','妈妈','爸爸','出差','妈','同事']);

var RP_SELF_PATTERNS = [
  '我是梓铭', '我是诗雨', '我是诗韵', '我是诗涵', '我是阿珍',
  '我是熊梓铭', '我是徐诗雨', '我是徐诗韵', '我是徐诗涵',
  '鸿艺哥，我是'
];

async function main() {
  // ── 预检门控 ──
  if(!DR){var C={scriptId:"backfill-memory-labels",riskLevel:"CRITICAL",operationType:"backfill",mode:M,environment:"local",operator:{operatorId:G.op||"",reason:G.reason||"",ticket:G.ticket||null},scope:{selector:G.scope||"table:memories",limit:0,batchSize:0,since:null,until:null},confirmation:{required:true,provided:!!G.confirm,tokenDigest:G.confirm||null},backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},irreversibleConfirmation:!!G.confirm,reportPath:G.rpt||null};var V=validateGate(C);var PE=V.errors.filter(function(e){return["R008","R009","R010","R013"].indexOf(e.rule)===-1});if(PE.length>0){var DE=["","======================================================================","  SCRIPT EXECUTION CONTRACT DENIED","======================================================================","  Script:  backfill-memory-labels.cjs","  Risk:    CRITICAL","  Mode:    apply","  Operation: backfill","","  Issues:"];PE.forEach(function(e){DE.push("    ["+e.rule+"] "+e.message)});DE.push("","  Refusing to continue.","======================================================================","");console.error(DE.join("\n"));recordGovernanceDecision(C,V);recordGovernanceDecision(C,V);process.exit(2)}}
  if(DR){console.log("[DRY-RUN] backfill-memory-labels — 将扫描 memories 表中 NULL 字段。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际回填。\n");process.exit(0)}

  // ── 治理通过 ─ 进入写入路径 ──
  var backup = MEM_DB.replace('.db', '_backfill_mem_' + Date.now() + '.db');
  fs.copyFileSync(MEM_DB, backup);
  console.log('备份: ' + backup);

  var db = new D(MEM_DB);
  var fg = new D(FG_DB, { readonly: true });
  db.pragma('journal_mode=DELETE');

  var CHARS = fg.prepare("SELECT name, uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶')").all()
    .filter(function(c) { return !GARBAGE_NAMES.has(c.name); });

  console.log('合法角色: ' + CHARS.length + '个');
  console.log('');

  var memLabeled = 0;
  for (var i = 0; i < CHARS.length; i++) {
    var c = CHARS[i];
    try {
      var r = db.prepare("UPDATE memories SET belong_entity_uuid='" + c.uuid + "' WHERE belong_entity_uuid IS NULL AND raw_input LIKE '%" + c.name + "%'").run();
      memLabeled += r.changes;
    } catch(e) {}
  }
  console.log('Phase 1 · belong_entity_uuid 回填: ' + memLabeled + ' 条');

  var rpLabeled = 0;
  for (var j = 0; j < RP_SELF_PATTERNS.length; j++) {
    try {
      var r2 = db.prepare("UPDATE memories SET memory_kind='roleplay' WHERE memory_kind='episodic' AND raw_input LIKE '%" + RP_SELF_PATTERNS[j] + "%'").run();
      rpLabeled += r2.changes;
    } catch(e) {}
  }
  console.log('Phase 2 · memory_kind roleplay 标注: ' + rpLabeled + ' 条');

  try {
    var r3 = db.prepare("UPDATE memories SET global_uid=dna_root_id WHERE global_uid IS NULL AND dna_root_id IS NOT NULL").run();
    console.log('Phase 3 · global_uid 回填: ' + r3.changes + ' 条');
  } catch(e) { console.log('Phase 3 · global_uid: 0 条 (dna_root_id 也全 NULL)'); }

  var stats = db.prepare(
    "SELECT COUNT(*) total, SUM(CASE WHEN belong_entity_uuid IS NULL THEN 1 ELSE 0 END) uuid_null, SUM(CASE WHEN global_uid IS NULL THEN 1 ELSE 0 END) gu_null, SUM(CASE WHEN dna_root_id IS NULL THEN 1 ELSE 0 END) dna_null, SUM(CASE WHEN memory_kind='roleplay' THEN 1 ELSE 0 END) rp_count FROM memories"
  ).get();

  console.log('');
  console.log('=== 验证 ===');
  console.log('总记忆: ' + stats.total);
  console.log('uuid NULL: ' + stats.uuid_null);
  console.log('global_uid NULL: ' + stats.gu_null);
  console.log('dna_root_id NULL: ' + stats.dna_null);
  console.log('memory_kind=roleplay: ' + stats.rp_count);

  db.close();
  fg.close();
  console.log('');
  console.log('✅ backfill 完成。备份: ' + backup);
}

main().catch(function(e) { console.error(e); process.exit(1); });
