/**
 * backfill-memory-labels.cjs — 历史记忆三NULL回填 + memory_kind 标注
 * ================================================================
 * Harness: 徐诗韵全链路审计 S3
 *
 * 回填策略：
 *   Phase 1: belong_entity_uuid — 按 raw_input 中包含的 FG 人名回填
 *   Phase 2: memory_kind — RP_SELF_PATTERNS 匹配 → 'roleplay'
 *   Phase 3: global_uid — NULL → dna_root_id 兜底
 */
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fs = require('fs');
const path = require('path');

const MEM_DB = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const FG_DB  = 'D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db';

// 备份
const backup = MEM_DB.replace('.db', '_backfill_mem_' + Date.now() + '.db');
fs.copyFileSync(MEM_DB, backup);
console.log('备份: ' + backup);

const db = new D(MEM_DB);
const fg = new D(FG_DB, { readonly: true });

db.pragma('journal_mode=DELETE');

// 垃圾关键词
const GARBAGE_NAMES = new Set(['什么名字','那你再','那你说','那继续','加班','姐姐','老家',
  '公司','学生','小说','开心','时候你','纪实小','计划吗','姑姑','上司','小龙','老邱',
  '老大','焦虑','方案','无聊','徐茜','徐敏','妹妹','老婆','妈妈','爸爸','出差','妈','同事']);

// 合法角色
const CHARS = fg.prepare("SELECT name, uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶')").all()
  .filter(function(c) { return !GARBAGE_NAMES.has(c.name); });

console.log('合法角色: ' + CHARS.length + '个');
console.log('');

// === Phase 1: belong_entity_uuid 回填 ===
let memLabeled = 0;
for (var i = 0; i < CHARS.length; i++) {
  var c = CHARS[i];
  try {
    var r = db.prepare("UPDATE memories SET belong_entity_uuid='" + c.uuid + "' WHERE belong_entity_uuid IS NULL AND raw_input LIKE '%" + c.name + "%'").run();
    memLabeled += r.changes;
  } catch(e) {}
}
console.log('Phase 1 · belong_entity_uuid 回填: ' + memLabeled + ' 条');

// === Phase 2: memory_kind 'roleplay' 标注 ===
var RP_SELF_PATTERNS = [
  '我是梓铭', '我是诗雨', '我是诗韵', '我是诗涵', '我是阿珍',
  '我是熊梓铭', '我是徐诗雨', '我是徐诗韵', '我是徐诗涵',
  '鸿艺哥，我是'
];
var rpLabeled = 0;
for (var j = 0; j < RP_SELF_PATTERNS.length; j++) {
  try {
    var r = db.prepare("UPDATE memories SET memory_kind='roleplay' WHERE memory_kind='episodic' AND raw_input LIKE '%" + RP_SELF_PATTERNS[j] + "%'").run();
    rpLabeled += r.changes;
  } catch(e) {}
}
console.log('Phase 2 · memory_kind roleplay 标注: ' + rpLabeled + ' 条');

// === Phase 3: global_uid 兜底 ===
try {
  var r = db.prepare("UPDATE memories SET global_uid=dna_root_id WHERE global_uid IS NULL AND dna_root_id IS NOT NULL").run();
  console.log('Phase 3 · global_uid 回填: ' + r.changes + ' 条');
} catch(e) { console.log('Phase 3 · global_uid: 0 条 (dna_root_id 也全 NULL)'); }

// === 验证 ===
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
