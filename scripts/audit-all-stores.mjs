import Database from 'better-sqlite3';
const db = new Database('data/webui/fusion_memory.db', {readonly: true});

console.log('═══ 砂金库 (memories) ═══');
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT calcium_level, COUNT(*) as c FROM memories GROUP BY calcium_level ORDER BY calcium_level').all();
console.log('总量:' + mt);
for (const r of ml) console.log('  L' + r.calcium_level + ':' + r.c);

console.log('');
console.log('═══ 金库 (vault_log) ═══');
const vt = db.prepare('SELECT COUNT(*) as c FROM vault_log').get().c;
const vo = db.prepare('SELECT operation, COUNT(*) as c FROM vault_log GROUP BY operation').all();
console.log('总量:' + vt);
for (const r of vo) console.log('  ' + r.operation + ':' + r.c);
const vm = db.prepare("SELECT COUNT(*) as c FROM vault_log WHERE content_md IS NOT NULL AND content_md != ''").get().c;
console.log('  content_md非空:' + vm);

console.log('');
console.log('═══ 黑钻 (black_diamond) ═══');
const bt = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const bl = db.prepare('SELECT calcium_level, COUNT(*) as c FROM black_diamond GROUP BY calcium_level ORDER BY calcium_level').all();
console.log('总量:' + bt);
for (const r of bl) console.log('  L' + r.calcium_level + ':' + r.c);
const bl2 = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE l2_norm IS NOT NULL AND l2_norm > 0').get().c;
console.log('  l2_norm>0:' + bl2);

console.log('');
console.log('═══ 知识库 (knowledge_base) ═══');
const kt = db.prepare('SELECT COUNT(*) as c FROM knowledge_base').get().c;
const kg = db.prepare("SELECT COUNT(*) as c FROM knowledge_base WHERE source_type IN ('landmark','milestone')").get().c;
const krc = db.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE recall_count > 0').get().c;
console.log('总量:' + kt + ' 垃圾残留:' + kg + ' 已召回:' + krc);

console.log('');
console.log('═══ 记忆关联表 ═══');
const me = db.prepare('SELECT COUNT(*) as c FROM memory_entities').get().c;
const er = db.prepare('SELECT COUNT(*) as c FROM entity_relations').get().c;
const km = db.prepare('SELECT COUNT(*) as c FROM knowledge_memories').get().c;
console.log('memory_entities:' + me + ' | entity_relations:' + er + ' | knowledge_memories:' + km);

db.close();
