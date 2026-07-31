const Database = require('better-sqlite3');
const db = new Database('data/webui/fusion_memory.db', {readonly: true});

console.log('=== memories belong_entity_uuid 分布 ===');
const total = db.prepare('SELECT COUNT(*) as cnt FROM memories').get();
const hasUuid = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
const nullUuid = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''").get();
console.log('总行数:', total.cnt);
console.log('有UUID:', hasUuid.cnt);
console.log('无UUID:', nullUuid.cnt);

console.log('\n=== UUID Top 15 ===');
const top = db.prepare("SELECT belong_entity_uuid, COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' GROUP BY belong_entity_uuid ORDER BY cnt DESC LIMIT 15").all();
top.forEach(r => console.log(r.belong_entity_uuid, ':', r.cnt));

console.log('\n=== TXS-000000003 (熊梓铭) 记忆数 ===');
const tx003 = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid = 'TXS-000000003'").get();
console.log('belong_entity_uuid = TXS-000000003:', tx003.cnt);

// 查几条样本
const samp = db.prepare("SELECT id, substr(raw_input,1,60) as preview, belong_entity_uuid FROM memories WHERE belong_entity_uuid = 'TXS-000000003' LIMIT 5").all();
samp.forEach(s => console.log('  ', s.id, '|', s.belong_entity_uuid, '|', s.preview));

console.log('\n=== vault_log TXS-000000003 ===');
const v003 = db.prepare("SELECT count(*) as cnt FROM vault_log WHERE belong_entity_uuid = 'TXS-000000003'").get();
console.log('vault_log:', v003.cnt);

console.log('\n=== knowledge_base 总行数+有UUID ===');
const kbTotal = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_base').get();
const kbHasUuid = db.prepare("SELECT COUNT(*) as cnt FROM knowledge_base WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
console.log('KB总行数:', kbTotal.cnt, '有UUID:', kbHasUuid.cnt);

console.log('\n=== conversations 总行数+含梓铭 ===');
const cTotal = db.prepare('SELECT COUNT(*) as cnt FROM conversations').get();
const cXzm = db.prepare("SELECT COUNT(*) as cnt FROM conversations WHERE content LIKE '%梓铭%'").get();
console.log('总行数:', cTotal.cnt, '含梓铭:', cXzm.cnt);

db.close();
