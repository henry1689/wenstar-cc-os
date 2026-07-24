import Database from 'better-sqlite3';
const db = new Database('data/webui/knowledge/family_graph.db', {readonly: true});

const all = db.prepare("SELECT id, name, properties FROM nodes WHERE type='person' AND name NOT IN ('我','玉瑶') ORDER BY name").all();

console.log('=== 所有人物实体审计 ===\n');

for (const r of all) {
  const p = JSON.parse(r.properties || '{}');
  const rel = p.relation_to_user || 'NULL';
  const gender = p.dossier?.basicInfo?.gender || '?';
  const occ = p.dossier?.socialIdentity?.currentOccupation || '';

  // family edges from this person
  const outEdges = db.prepare(
    "SELECT e.relation, n2.name as target FROM edges e JOIN nodes n2 ON e.target_id = n2.id WHERE e.source_id = ? AND e.relation IN ('child_of','parent_of','mother_of','father_of','elder_sister_of','younger_sister_of','sister_of','brother_of','sibling_of','elder_brother_of','younger_brother_of','spouse_of')"
  ).all(r.id);

  const inEdges = db.prepare(
    "SELECT e.relation, n1.name as source FROM edges e JOIN nodes n1 ON e.source_id = n1.id WHERE e.target_id = ? AND e.relation IN ('child_of','parent_of','mother_of','father_of','elder_sister_of','younger_sister_of','sister_of','brother_of','sibling_of','elder_brother_of','younger_brother_of','spouse_of')"
  ).all(r.id);

  console.log(r.name.padEnd(8, ' ') + ' | 性别:' + gender + ' | 职业:' + (occ || '-').substring(0, 15));
  console.log('  relation_to_user: ' + rel);
  console.log('  出去的家族边: ' + (outEdges.map(e => e.relation + '→' + e.target).join(', ') || '无'));
  console.log('  进来的家族边: ' + (inEdges.map(e => e.source + ' ' + e.relation + '→我').join(', ') || '无'));
  console.log('');
}

db.close();
