import Database from 'better-sqlite3';
const db = new Database('data/webui/knowledge/family_graph.db', {readonly: true});
const r = db.prepare("SELECT properties FROM nodes WHERE name = '徐诗韵'").get();
const p = JSON.parse(r.properties);
console.log('relation_to_user=' + p.relation_to_user);
db.close();
