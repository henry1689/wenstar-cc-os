import Database from 'better-sqlite3';
const db = new Database('data/webui/fusion_memory.db', {readonly: true});

const total = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const totalME = db.prepare('SELECT COUNT(*) as c FROM memory_entities').get().c;
const asst = db.prepare("SELECT COUNT(*) as c FROM memories WHERE leaf_zone='assistant'").get().c;
const user = db.prepare("SELECT COUNT(*) as c FROM memories WHERE leaf_zone='user'").get().c;
console.log('memories总:', total, '  user:', user, '  assistant:', asst);
console.log('memory_entities总:', totalME);
console.log('assistant关联率:',
  db.prepare("SELECT COUNT(DISTINCT me.memory_id) as c FROM memory_entities me JOIN memories m ON me.memory_id=m.id WHERE m.leaf_zone='assistant'").get().c,
  '/', asst);

const zm = db.prepare("SELECT id FROM entities WHERE name='熊梓铭'").get();
if (zm) {
  const me = db.prepare('SELECT COUNT(*) as c FROM memory_entities WHERE entity_id=?').get(zm.id).c;
  const valid = db.prepare('SELECT COUNT(*) as c FROM memory_entities me JOIN memories m ON me.memory_id=m.id WHERE me.entity_id=?').get(zm.id).c;
  console.log('\n梓铭 entity_id=' + zm.id + ' memory_entities:', me, ' validInMemories:', valid);

  // Check what entity _genes look like for 梓铭 conversations
  const convSample = db.prepare("SELECT role, content, belong_entity_uuid FROM conversations WHERE belong_entity_uuid='TXS-000000003' LIMIT 3").all();
  console.log('\n梓铭本人conversations样本:');
  for (const r of convSample) console.log(' [' + r.role + '] ' + (r.content||'').substring(0, 60));
}

db.close();
