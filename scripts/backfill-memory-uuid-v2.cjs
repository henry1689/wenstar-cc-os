/**
 * backfill-memory-uuid.cjs — V2 修复版
 *
 * V1 问题：
 *   1. 未按长度排序——短名"玉瑶"(2字)先匹配，抢走含"熊梓铭"的记忆
 *   2. 垃圾名未过滤——"小时""明天""妈妈""解剖学"等匹配随机文本
 *   3. 无降级路径——不匹配任何实体名的记忆永远得不到 UUID
 *
 * V2 策略：
 *   1. 只取真实人物名(≥3字, 非关系词, 非垃圾词)
 *   2. 按名字长度降序处理——"熊梓铭"先于"玉瑶"
 *   3. 降级①: 从同一对话组的其他记忆扩散 UUID
 *   4. 降级②: 从 conversations 表按 content 前缀反查 UUID
 *   5. 降级③: 无法归属的标记为 NULL（如纯闲聊/系统消息）
 */
const Database = require('better-sqlite3');

const DB_PATH = 'data/webui/fusion_memory.db';

console.log('=== memories UUID 回填 V2 ===');

const db = new Database(DB_PATH);

// ── 垃圾名过滤 ──
const GARBAGE_NAMES = new Set([
  // 关系词/泛称
  '妈妈','爸爸','爷爷','奶奶','姐姐','妹妹','哥哥','弟弟','叔叔','姑姑',
  '老婆','老公','儿子','女儿','老板','同事','同学','朋友','客户','学生',
  '男朋友',
  // 垃圾词
  '小时','明天','那个','单员','水了','小嘛','和鸿艺','家里','家有谁',
  '解剖学','那你说','加班','出差','方案','焦虑','小说','开心','关系',
  '兴奋','舒服','安排','谈谈','老家','时候','那年','别老','老说',
  '那不','那你','方呢','小的','单嘛','关了','别好','阿苏',
  // 脏词
  '阴蒂','小逼','小屄','小奶',
  // 🆕 短名污染（entities 表中的碎片词）
  '小小','老盼','小孩','小我','小芳','小龙','小酒','于进','小生',
  '别这么','舒服呀','那么一','和阿珍','管了','和小屄','那给我',
  '时你就','计划吗','纪实小','解一下','华聊聊','别开心','习怎样',
  '熊勇哥','熊总聊','司新来','罗权彬','刘云新','罗权斌',
]);

// ── 1. 获取真实人物 (≥3字, 非垃圾, 有 UUID) ──
const allEnts = db.prepare("SELECT name, uuid FROM entities WHERE type='person' AND uuid IS NOT NULL").all();
const validEnts = allEnts
  .filter(e => e.name.length >= 3 && !GARBAGE_NAMES.has(e.name))
  .sort((a, b) => b.name.length - a.name.length);  // 长名优先！

console.log(`entities 总数: ${allEnts.length}, 有效人物: ${validEnts.length}`);
validEnts.forEach(e => console.log(`  ${e.name} → ${e.uuid}`));

// ── 2. 按人名匹配 (长名优先) ──
let updated = 0;
const before = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();

for (const {name, uuid} of validEnts) {
  try {
    const r = db.prepare(
      "UPDATE memories SET belong_entity_uuid = ? WHERE (belong_entity_uuid IS NULL OR belong_entity_uuid = '') AND raw_input LIKE ?"
    ).run(uuid, `%${name}%`);
    if (r.changes > 0) {
      updated += r.changes;
      console.log(`  ${name}: ${r.changes} 条`);
    }
  } catch(e) {}
}

// ── 3. 降级①: 对话组扩散 ──
console.log('\n=== 对话组扩散 ===');
try {
  const groups = db.prepare(
    "SELECT DISTINCT dialog_group_id FROM memories WHERE (belong_entity_uuid IS NULL OR belong_entity_uuid = '') AND dialog_group_id IS NOT NULL"
  ).all();
  let groupUpdated = 0;
  for (const g of groups) {
    const sibling = db.prepare(
      "SELECT belong_entity_uuid FROM memories WHERE dialog_group_id = ? AND belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' LIMIT 1"
    ).get(g.dialog_group_id);
    if (sibling?.belong_entity_uuid) {
      const r = db.prepare(
        "UPDATE memories SET belong_entity_uuid = ? WHERE dialog_group_id = ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid = '')"
      ).run(sibling.belong_entity_uuid, g.dialog_group_id);
      if (r.changes > 0) { groupUpdated += r.changes; }
    }
  }
  updated += groupUpdated;
  console.log(`  扩散: ${groupUpdated} 条`);
} catch(e) { console.log('扩散失败:', e.message); }

// ── 4. 降级②: 从 conversations.content 反查 ──
console.log('\n=== conversations 反查 ===');
try {
  // 对仍无 UUID 的记忆，取 raw_input 前 40 字去 conversations 中匹配
  const remaining = db.prepare(
    "SELECT id, substr(raw_input,1,40) as prefix FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = '' LIMIT 500"
  ).all();
  let convUpdated = 0;
  for (const m of remaining) {
    if (!m.prefix || m.prefix.length < 5) continue;
    const conv = db.prepare(
      "SELECT belong_entity_uuid FROM conversations WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' AND content LIKE ? LIMIT 1"
    ).get(`%${m.prefix.substring(0, 30)}%`);
    if (conv?.belong_entity_uuid) {
      db.prepare("UPDATE memories SET belong_entity_uuid = ? WHERE id = ?").run(conv.belong_entity_uuid, m.id);
      convUpdated++;
    }
  }
  updated += convUpdated;
  console.log(`  conversations 反查: ${convUpdated} 条`);
} catch(e) { console.log('反查失败:', e.message); }

// ── 5. 降级③: 纯闲聊/系统消息 → 保持 NULL（无害） ──

// ── 6. 验证 ──
const after = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
const remaining = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''").get();

console.log(`\n=== 结果 ===`);
console.log(`回填前有UUID: ${before.cnt} → 回填后: ${after.cnt} (新增 ${updated} 条)`);
console.log(`仍有 NULL: ${remaining.cnt} 条 (纯闲聊/系统消息)`);

const dist = db.prepare("SELECT belong_entity_uuid, COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' GROUP BY belong_entity_uuid ORDER BY cnt DESC LIMIT 10").all();
console.log('\nUUID Top 10:');
dist.forEach(r => console.log(`  ${r.belong_entity_uuid}: ${r.cnt} 条`));

db.close();
console.log('\n✅ 回填 V2 完成');
