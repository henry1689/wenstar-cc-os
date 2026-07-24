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
