import Database from 'better-sqlite3';

const db = new Database('data/webui/fusion_memory.db', {readonly: true});
const fg = new Database('data/webui/knowledge/family_graph.db', {readonly: true});

const allEnts = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND name NOT IN('我','玉瑶') ORDER BY name").all();

console.log('=== 每个角色的记忆可检索率 ===');
let totalConvs = 0, totalLabeledConvs = 0, totalLabeledMems = 0;

for (const e of allEnts) {
  const convsTotal = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE content LIKE ?').get('%' + e.name + '%').c;
  const convsLabeled = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid = ?',).get(e.uuid).c;
  const memsLabeled = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid = ?').get(e.uuid).c;

  totalConvs += convsTotal;
  totalLabeledConvs += convsLabeled;
  totalLabeledMems += memsLabeled;

  const pct = convsTotal > 0 ? (convsLabeled / convsTotal * 100).toFixed(0) : '0';
  console.log(e.name + ': 对话' + convsTotal + '条 → UUID标注' + convsLabeled + '(' + pct + '%) | mems标注' + memsLabeled);
}

console.log('');
console.log('总计: conversations提及' + totalConvs + '条 → UUID标注' + totalLabeledConvs + '条');
console.log('memories标注: ' + totalLabeledMems + '条');
console.log('');
console.log('=== 真正的问题 ===');
console.log('在会晤模式下，MeetingContextPipeline 用 belong_entity_uuid 检索 conversations 和 memories。');
console.log('如果角色的 UUID 标注覆盖率低 → 检索不到该角色本人的发言 → 数据存在但系统找不到 → "金鱼脑"。');

// Check the actual meeting context injection for a specific character
const zmUuid = fg.prepare("SELECT uuid FROM nodes WHERE name='熊梓铭'").get().uuid;
const zmConvsUuid = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid = ?').get(zmUuid).c;
const zmMemsUuid = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid = ?').get(zmUuid).c;
const zmConvsKeyword = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE content LIKE '%梓铭%'").get().c;
const zmMemsKeyword = db.prepare("SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%梓铭%'").get().c;

console.log('');
console.log('熊梓铭案例:');
console.log('  对话中含"梓铭": ' + zmConvsKeyword + '条');
console.log('  UUID可直接标注: ' + zmConvsUuid + '条 (' + (zmConvsUuid/zmConvsKeyword*100).toFixed(0) + '%)');
console.log('  memories UUID标注: ' + zmMemsUuid + '条');
console.log('  memories 含"梓铭": ' + zmMemsKeyword + '条');
console.log('');

// Show what MeetingContextPipeline actually retrieves
if (zmConvsUuid > 0) {
  const sample = db.prepare('SELECT role, content FROM conversations WHERE belong_entity_uuid = ? LIMIT 5').all(zmUuid);
  console.log('  梓铭本人的conversations样本(UUID标注到的):');
  for (const s of sample) console.log('  [' + s.role + '] ' + s.content.substring(0, 60));
} else if (zmConvsKeyword > 0) {
  const sample = db.prepare("SELECT role, content FROM conversations WHERE content LIKE '%梓铭%' LIMIT 5").all();
  console.log('  含"梓铭"的conversations样本(全LIKE匹配,但UUID未标注):');
  for (const s of sample) console.log('  [' + s.role + '] ' + s.content.substring(0, 60));
}

db.close();
fg.close();
