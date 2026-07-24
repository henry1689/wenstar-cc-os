const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db');
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db');
db.pragma('journal_mode=DELETE');

const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶','什么名字','那你再','那你说','那继续','加班','姐姐','老家')").all();

console.log('=== 残存数据修复 ===');

// Step 1: 扩展自称检测（匹配真实的角色回应模式）
let added = 0;
for (const c of CHARS) {
  const n = c.name, u = c.uuid;
  const stmts = [
    `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%我就是${n}%'`,
    `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%${n}在呢%'`,
    `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%叫${n}%'`,
    `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%我是${n}%'`,
    `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%${n}来了%'`,
  ];
  for (const s of stmts) { try { const r = db.prepare(s).run(); added += r.changes; } catch(e) {} }
}
console.log('1. 扩展自称: +' + added + '条');

// Step 2: 梓铭专属模式
const ZIMING = [
  "UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%梓铭%' AND content LIKE '%梓铭记%'",
  "UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%梓铭%' AND content LIKE '%梓铭说%'",
  "UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%我是梓铭%'",
  "UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%梓铭就是梓铭%'",
  "UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%叫我梓铭%'",
];
for (const s of ZIMING) { try { const r = db.prepare(s).run(); added += r.changes; } catch(e) {} }

// Step 3: memories 回填
const mr = db.prepare("UPDATE memories SET belong_entity_uuid = (SELECT DISTINCT c.belong_entity_uuid FROM conversations c WHERE c.belong_entity_uuid IS NOT NULL AND c.content LIKE '%' || substr(memories.raw_input,1,30) || '%' LIMIT 1) WHERE belong_entity_uuid IS NULL").run();
console.log('3. memories回填: +' + mr.changes + '条');

// Step 4: black_diamond 回填
const bdr = db.prepare("UPDATE black_diamond SET belong_entity_uuid = (SELECT m.belong_entity_uuid FROM memories m WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").run();
console.log('4. BD回填: +' + bdr.changes + '条');

// Step 5: FG 修正
const fp = fg.prepare("SELECT properties FROM nodes WHERE name='熊梓铭'").get();
const p = JSON.parse(fp.properties);
p.relation_to_user = '熊勇的女儿（心理学专业学生）';
fg.prepare("UPDATE nodes SET properties=? WHERE name='熊梓铭'").run(JSON.stringify(p));
const vp = JSON.parse(fg.prepare("SELECT properties FROM nodes WHERE name='熊梓铭'").get().properties);
console.log('5. FG熊梓铭: ' + vp.relation_to_user);

// Verify
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const zmc = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid='TXS-000000003'").get().c;
const zmm = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid='TXS-000000003'").get().c;
const zmb = db.prepare("SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid='TXS-000000003'").get().c;

console.log('');
console.log('convs总:' + cl + '/' + ct + ' (' + (cl/ct*100).toFixed(1) + '%)');
console.log('mems总: ' + ml + '/' + mt + ' (' + (ml/mt*100).toFixed(1) + '%)');
console.log('梓铭: convs=' + zmc + ' mems=' + zmm + ' BD=' + zmb);

db.close(); fg.close();
console.log('✅ 残存数据修复完成');
