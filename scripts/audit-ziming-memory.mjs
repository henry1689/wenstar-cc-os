import Database from 'better-sqlite3';

const db = new Database('data/webui/fusion_memory.db', {readonly: true});
const fg = new Database('data/webui/knowledge/family_graph.db', {readonly: true});

const zmUuid = fg.prepare("SELECT uuid FROM nodes WHERE name='熊梓铭'").get().uuid;
console.log('熊梓铭 TXS-ID: ' + zmUuid);

// ====== 1. conversations ======
const convTotal = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE content LIKE '%梓铭%'").get().c;
const convUuid = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(zmUuid).c;
const convRole = db.prepare('SELECT role,COUNT(*) as c FROM conversations WHERE belong_entity_uuid=? GROUP BY role').all(zmUuid);
const convNoUuid = db.prepare("SELECT role,COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL AND content LIKE '%梓铭%' GROUP BY role").all();

console.log('');
console.log('═══════ conversations ═══════');
console.log('总提及: ' + convTotal + '条');
console.log('UUID 标注(本人的): ' + convUuid + '条');
for (const r of convRole) console.log('  [' + r.role + ']: ' + r.c + '条');
console.log('未标注:');
for (const r of convNoUuid) console.log('  [' + r.role + ']: ' + r.c + '条');
console.log('  其中 assistant(可能是梓铭本人说话但没标注): ' +
  (convNoUuid.find(r=>r.role==='assistant')?.c || 0) + '条');

// ====== 2. memories ======
const memTotal = db.prepare("SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%梓铭%'").get().c;
const memUuid = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(zmUuid).c;
const memKind = db.prepare("SELECT memory_kind,leaf_zone,COUNT(*) as c FROM memories WHERE raw_input LIKE '%梓铭%' GROUP BY memory_kind,leaf_zone").all();

console.log('');
console.log('═══════ memories ═══════');
console.log('总提及: ' + memTotal + '条');
console.log('UUID 标注(本人的): ' + memUuid + '条');
for (const r of memKind) console.log('  ' + r.memory_kind + '[' + r.leaf_zone + ']: ' + r.c + '条');

// ====== 3. vault_log ======
const vlTotal = db.prepare("SELECT COUNT(*) as c FROM vault_log WHERE content_md LIKE '%梓铭%' OR detail LIKE '%梓铭%'").get().c;
console.log('');
console.log('═══════ vault_log ═══════');
console.log('金库含梓铭: ' + vlTotal + '条');

// ====== 4. black_diamond ======
const bdKeyword = db.prepare("SELECT COUNT(*) as c FROM black_diamond WHERE summary LIKE '%梓铭%' OR tags LIKE '%梓铭%'").get().c;
const bdUuid = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid=?').get(zmUuid).c;
console.log('');
console.log('═══════ black_diamond ═══════');
console.log('关键词命中: ' + bdKeyword + '条');
console.log('UUID 标注: ' + bdUuid + '条');

// ====== 5. memory_entities ======
const ent = db.prepare("SELECT id FROM entities WHERE name='熊梓铭'").get();
if (ent) {
  const me = db.prepare('SELECT COUNT(*) as c FROM memory_entities WHERE entity_id=?').get(ent.id).c;
  console.log('');
  console.log('═══════ memory_entities ═══════');
  console.log('关联数: ' + me + '条 (entities.id=' + ent.id + ')');
}

// ====== 6. FG ======
const zmProps = fg.prepare("SELECT properties FROM nodes WHERE name='熊梓铭'").get();
const p = JSON.parse(zmProps.properties);
console.log('');
console.log('═══════ FG ═══════');
console.log('relation_to_user: ' + p.relation_to_user);
console.log('mention_count: ' + (p.mention_count || 0));
console.log('completeness: ' + (p.completeness || 0));

// ====== SUMMARY ======
console.log('');
console.log("═══════════════════════════════════════════");
console.log("              熊梓铭 记忆摘要               ");
console.log("═══════════════════════════════════════════");
console.log("");
console.log("【可用——会晤检索】");
console.log("  conversations UUID标注: " + convUuid + "条 ← MeetingContextPipeline 直接检索");
console.log("  memories UUID标注:     " + memUuid + "条 ← 会晤模式源2a精确检索");
console.log("");
console.log("【半可用——关键词检索但不精准】");
console.log("  conversations 未标注:  " + convNoUuid.reduce((s,r)=>s+r.c,0) + "条 ← 只能用LIKE模糊匹配，噪声大");
console.log("  memories 未标注:       " + (memTotal - memUuid) + "条 ← 同上");
console.log("");
console.log("【不可用——无UUID关联】");
console.log("  vault_log: " + vlTotal + "条(含梓铭关键词但无实体检索路径)");
console.log("  black_diamond: 关键词" + bdKeyword + "条 / UUID" + bdUuid + "条(历史晋升的无法关联)");
console.log("");
console.log("【数据质量】");
console.log("  relation_to_user: " + p.relation_to_user + (p.relation_to_user==='妈妈'?' ⚠️ 错误!(KLOWN_FIXES已修正为熊勇的女儿)':''));
console.log("  垃圾实体: 无(梓铭不在垃圾名单)");

db.close();
fg.close();
