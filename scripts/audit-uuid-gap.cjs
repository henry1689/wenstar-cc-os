/**
 * 分析为什么 1587 条记忆只有 432 条回填了 UUID
 */
const Database = require('better-sqlite3');
const db = new Database('data/webui/fusion_memory.db', {readonly: true});

// 1. 按 memory_kind 分组
console.log('=== 1. 按 memory_kind × UUID 分组 ===');
const byKind = db.prepare(
  "SELECT memory_kind, CASE WHEN belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' THEN '有' ELSE '无' END as has_uuid, COUNT(*) as cnt FROM memories GROUP BY memory_kind, has_uuid ORDER BY cnt DESC"
).all();
byKind.forEach(r => console.log('  kind=' + (r.memory_kind||'NULL').padEnd(12) + ' UUID=' + r.has_uuid + '  ' + r.cnt + '条'));

// 2. 无 UUID 的记忆样本 — 看 raw_input 中是否包含任何实体名
console.log('\n=== 2. 无 UUID 记忆样本 (看为何无法匹配) ===');
const entities = db.prepare("SELECT name FROM entities WHERE type='person'").all().map(e => e.name);
console.log('  已知实体名: ' + entities.join(', '));

const noUuid = db.prepare(
  "SELECT id, substr(raw_input,1,100) as preview, memory_kind FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = '' ORDER BY RANDOM() LIMIT 15"
).all();
noUuid.forEach(s => {
  const matched = entities.filter(n => (s.preview||'').includes(n));
  console.log('  [' + (s.memory_kind||'null').padEnd(10) + '] ' + (s.preview||'').substring(0,70));
  if (matched.length > 0) console.log('    → 应匹配但未匹配: ' + matched.join(', '));
  else console.log('    → 无任何实体名匹配');
});

// 3. memory_kind 分布总览
console.log('\n=== 3. memory_kind 总分布 ===');
const kindDist = db.prepare('SELECT memory_kind, COUNT(*) as cnt FROM memories GROUP BY memory_kind ORDER BY cnt DESC').all();
kindDist.forEach(r => console.log('  ' + (r.memory_kind||'NULL').padEnd(15) + r.cnt + '条'));

// 4. 有 UUID 的 UUID 分布
console.log('\n=== 4. 有 UUID 的记忆按实体分布 (Top 10) ===');
const uuidTop = db.prepare("SELECT belong_entity_uuid, COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' GROUP BY belong_entity_uuid ORDER BY cnt DESC LIMIT 10").all();
uuidTop.forEach(r => console.log('  ' + r.belong_entity_uuid + '  ' + r.cnt + '条'));

db.close();
