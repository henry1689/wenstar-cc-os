/**
 * backfill-memory-uuid.cjs — P0 修复：memories.belong_entity_uuid 回填
 *
 * 根因：SQLiteAdapter 的回填 SQL 通过 conversations 30字符前缀传导，
 * 因 memories.raw_input 与 conversations.content 格式不同而全部失败。
 * 1587 条记忆全部 belong_entity_uuid = NULL。
 *
 * 策略：
 *   1. 按 entities 表人名直接匹配 memories.raw_input
 *   2. 按 memory_kind='roleplay' + dialog_group_id 关联的 conversation 扩散
 *   3. 关联 FG 的 entities 表中 type='person' 的 UUID
 *   4. 验证 + 强制落盘
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = 'data/webui/fusion_memory.db';
const FG_PATH = 'data/webui/family_graph.db';

console.log('=== memories UUID 回填 ===');
console.log('DB:', path.resolve(DB_PATH));
console.log('FG:', path.resolve(FG_PATH));

const db = new Database(DB_PATH);
const fg = new Database(FG_PATH);

// 1. 从 FG entities 表获取所有人名 → UUID 映射
const entityMap = new Map();
try {
  const entities = fg.prepare("SELECT uuid, name FROM nodes WHERE type='person'").all();
  entities.forEach(e => { if (e.uuid && e.name) entityMap.set(e.name, e.uuid); });
  console.log(`FG entities: ${entities.length} 人, ${entityMap.size} 有UUID`);
} catch(e) { console.log('FG entities 查询失败:', e.message); }

// 2. 也从 fusion_memory.db 的 entities 表获取
try {
  const ents = db.prepare("SELECT uuid, name FROM entities WHERE type='person' AND uuid IS NOT NULL").all();
  ents.forEach(e => { if (e.uuid && e.name && !entityMap.has(e.name)) entityMap.set(e.name, e.uuid); });
  console.log(`fusion_memory entities: +${ents.length} 人`);
} catch(e) { console.log('fusion entities 查询失败:', e.message); }

console.log(`\n人名→UUID 映射: ${entityMap.size} 条`);

// 3. 按人名匹配回填
let updated = 0;
const names = Array.from(entityMap.keys());
const before = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
console.log(`回填前 UUID 非空: ${before.cnt}`);

for (const [name, uuid] of entityMap) {
  if (name.length < 2) continue;
  try {
    const result = db.prepare(
      "UPDATE memories SET belong_entity_uuid = ? WHERE (belong_entity_uuid IS NULL OR belong_entity_uuid = '') AND raw_input LIKE ?",
    ).run(uuid, `%${name}%`);
    if (result.changes > 0) {
      updated += result.changes;
      console.log(`  ${name} → ${uuid}: ${result.changes} 条`);
    }
  } catch(e) { /* skip */ }
}

// 4. roleplay 记忆兜底：按 dialog_group_id 关联
console.log('\n=== roleplay 兜底 ===');
try {
  const rpGroups = db.prepare(
    "SELECT DISTINCT dialog_group_id FROM memories WHERE memory_kind='roleplay' AND (belong_entity_uuid IS NULL OR belong_entity_uuid = '')"
  ).all();
  for (const g of rpGroups) {
    if (!g.dialog_group_id) continue;
    // 找同组的其他记忆的 UUID
    const sibling = db.prepare(
      "SELECT belong_entity_uuid FROM memories WHERE dialog_group_id = ? AND belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' LIMIT 1"
    ).get(g.dialog_group_id);
    if (sibling && sibling.belong_entity_uuid) {
      const r = db.prepare(
        "UPDATE memories SET belong_entity_uuid = ? WHERE dialog_group_id = ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid = '')"
      ).run(sibling.belong_entity_uuid, g.dialog_group_id);
      if (r.changes > 0) console.log(`  group ${g.dialog_group_id}: ${r.changes} 条 → ${sibling.belong_entity_uuid}`);
      updated += r.changes;
    }
  }
} catch(e) { console.log('roleplay 兜底失败:', e.message); }

// 5. 验证
const after = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
console.log(`\n=== 结果 ===`);
console.log(`回填前: ${before.cnt} → 回填后: ${after.cnt} (新增 ${updated} 条)`);

// UUID 分布 top 10
const dist = db.prepare("SELECT belong_entity_uuid, COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' GROUP BY belong_entity_uuid ORDER BY cnt DESC LIMIT 10").all();
console.log('\nUUID Top 10:');
dist.forEach(r => console.log(`  ${r.belong_entity_uuid}: ${r.cnt} 条`));

db.close();
fg.close();
console.log('\n✅ 回填完成');
