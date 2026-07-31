const Database = require('better-sqlite3');
const path = require('path');
const dbPath = 'data/webui/fusion_memory.db';
const db = new Database(dbPath, {readonly: true});

console.log('=== 文件信息 ===');
console.log('路径:', path.resolve(dbPath));

// 直接用 raw SQL 检查
console.log('\n=== memories total ===');
const r1 = db.prepare('SELECT count(*) as c FROM memories').all();
console.log(r1);

console.log('\n=== memories with non-null UUID ===');
const r2 = db.prepare("SELECT count(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL").all();
console.log(r2);

console.log('\n=== conversations with non-null UUID ===');
const r3 = db.prepare("SELECT count(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL").all();
console.log(r3);

console.log('\n=== 抽查 conversations 含 梓铭 的记录 ===');
const samp = db.prepare("SELECT id, substr(content,1,60) preview, belong_entity_uuid FROM conversations WHERE content LIKE '%梓铭%' LIMIT 5").all();
samp.forEach(s => console.log(s.id, '| UUID:', s.belong_entity_uuid, '|', s.preview));

console.log('\n=== 抽查 memories 几条记录 ===');
const msamp = db.prepare('SELECT id, substr(raw_input,1,60) preview, belong_entity_uuid, memory_kind FROM memories LIMIT 10').all();
msamp.forEach(m => console.log(m.id, '| UUID:', m.belong_entity_uuid, '| kind:', m.memory_kind, '|', m.preview));

db.close();
console.log('\nDone.');
