const path = require('path');
const Database = require('better-sqlite3');
const BASE = path.resolve(__dirname, '..');
const fg = new Database(path.join(BASE, 'data/webui/knowledge/family_graph.db'));
const fusion = new Database(path.join(BASE, 'data/webui/fusion_memory.db'));
const now = new Date().toISOString();

// ── 1. 清理 entity_relations ──
const xzmEnt = fusion.prepare("SELECT id FROM entities WHERE name='熊梓铭'").get();
if (xzmEnt) {
  const before = fusion.prepare('SELECT count(*) as c FROM entity_relations WHERE entity_a_id=? OR entity_b_id=?').get(xzmEnt.id, xzmEnt.id);
  fusion.prepare('DELETE FROM entity_relations WHERE entity_a_id=? OR entity_b_id=?').run(xzmEnt.id, xzmEnt.id);
  const me = fusion.prepare("SELECT id FROM entities WHERE name='我'").get();
  if (me) {
    const a = Math.min(xzmEnt.id, me.id), b = Math.max(xzmEnt.id, me.id);
    fusion.prepare('INSERT OR IGNORE INTO entity_relations (entity_a_id,entity_b_id,relation,strength,updated_at) VALUES (?,?,?,1.0,?)').run(a, b, '熟人', now);
  }
  const after = fusion.prepare('SELECT count(*) as c FROM entity_relations WHERE entity_a_id=? OR entity_b_id=?').get(xzmEnt.id, xzmEnt.id);
  console.log('entity_relations: ' + before.c + '→' + after.c);
}

// ── 2. 清空熊梓铭所有边 ──
const nid = fg.prepare("SELECT id FROM nodes WHERE name='熊梓铭'").get().id;
fg.prepare('DELETE FROM edges WHERE source_id=?').run(nid);
fg.prepare('DELETE FROM edges WHERE target_id=?').run(nid);

// ── 4. 获取家族节点 ID ──
const yong = fg.prepare("SELECT id FROM nodes WHERE name='熊勇'").get().id;
const fen = fg.prepare("SELECT id FROM nodes WHERE name='王全芬'").get().id;
const yue = fg.prepare("SELECT id FROM nodes WHERE name='熊梓玥'").get().id;

// ── 5. 插入 7 条边 ──
const edges = [
  ['d6379e', yong, nid, 'child_of'],
  ['8f6efa', fen, nid, 'child_of'],
  ['e70d3a', nid, yong, 'parent_of'],
  ['f1c6bb', nid, fen, 'parent_of'],
  ['ek17847136470308d8', nid, yue, 'elder_sister_of'],
  ['yk17847136470302d', yue, nid, 'younger_sister_of'],
];

const ins = fg.prepare('INSERT OR IGNORE INTO edges (id,source_id,target_id,relation,properties,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
for (const e of edges) {
  ins.run(e[0], e[1], e[2], e[3], '{}', now, now);
}

// ── 6. 验证 ──
const saw = new Set();
const r1 = fg.prepare('SELECT id,relation,source_id,target_id FROM edges WHERE source_id=?').all(nid);
const r2 = fg.prepare('SELECT id,relation,source_id,target_id FROM edges WHERE target_id=?').all(nid);
for (const e of [...r1, ...r2]) saw.add(e.id);

console.log('\n=== 边数: ' + saw.size + ' ===');
const all = fg.prepare('SELECT id,relation,source_id,target_id FROM edges WHERE source_id=? OR target_id=?').all(nid, nid);
const printed = new Set();
all.forEach(function(e) {
  if (printed.has(e.id)) return;
  printed.add(e.id);
  const oid = e.source_id === nid ? e.target_id : e.source_id;
  const on = fg.prepare('SELECT name FROM nodes WHERE id=?').get(oid);
  console.log('  ' + e.relation.padEnd(22) + (on ? on.name : '?') + '  (' + e.id + ')');
});

const dup = all.filter(function(e, i, arr) { return arr.findIndex(function(x) { return x.id === e.id; }) !== i; });
console.log(dup.length > 0 ? '⚠️  重复边: ' + dup.length : '✅ 无重复');

fg.close();
fusion.close();
console.log('\n✅ 清理完成');
