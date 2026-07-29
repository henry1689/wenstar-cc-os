// Search: 徐诗雨浴缸边亲密
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('data/webui/fusion_memory.db'));
  const now = Date.now();

  function cp(t) { return String(t||'').replace(/[^一-鿿\w]/g,'').trim(); }

  // Backfill 徐诗雨 belong_entity_uuid
  for (const [n,u] of [['徐诗雨','uuid-shiyu'],['诗雨','uuid-shiyu']]) {
    db.run("UPDATE memories SET belong_entity_uuid=? WHERE raw_input LIKE ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid='')", [u, '%'+n+'%']);
  }
  // Backfill global_uid
  const ids = db.exec("SELECT id FROM memories WHERE global_uid IS NULL");
  if (ids.length && ids[0].values) {
    for (const r of ids[0].values) {
      const h = createHash('sha256').update(String(r[0])).digest('hex').substring(0,8).toUpperCase();
      db.run('UPDATE memories SET global_uid=? WHERE id=?', ['MM'+h, String(r[0])]);
    }
  }

  // Ensure search_index
  try { db.exec('SELECT 1 FROM search_index LIMIT 0'); } catch {
    db.run('CREATE TABLE search_index (term TEXT, source_type TEXT, source_id TEXT, PRIMARY KEY(term,source_type,source_id))');
    for (const [tbl,col,st] of [['memories','raw_input','memory'],['conversations','content','conversation']]) {
      const rows = db.exec("SELECT id,"+col+" FROM "+tbl+" WHERE "+col+" IS NOT NULL");
      if (rows.length && rows[0].values) for (const r of rows[0].values) {
        const cl = cp(String(r[1]||'')); if (cl.length<2) continue;
        const ng = new Set();
        for (let i=0;i<cl.length-1;i++) ng.add(cl.substring(i,i+2));
        for (let i=0;i<cl.length-2;i++) ng.add(cl.substring(i,i+3));
        for (const g of ng) try { db.run('INSERT OR IGNORE INTO search_index VALUES(?,?,?)',[g,st,String(r[0])]); } catch {}
      }
    }
  }

  // Ensure memory_associations
  try { db.exec('SELECT 1 FROM memory_associations LIMIT 0'); } catch {
    db.run("CREATE TABLE memory_associations (id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT DEFAULT 'default', belong_entity_uuid TEXT, source_global_uid TEXT, target_global_uid TEXT, edge_type TEXT, edge_reason TEXT, confidence REAL, weight REAL, source_timestamp_ms INTEGER, target_timestamp_ms INTEGER, created_at_ms INTEGER, state_flag TEXT DEFAULT 'active')");
  }

  // Entity edges for uuid-shiyu
  const es = db.exec("SELECT global_uid,created_at FROM memories WHERE belong_entity_uuid='uuid-shiyu' AND global_uid IS NOT NULL ORDER BY created_at ASC LIMIT 100");
  let ec = 0;
  if (es.length && es[0].values && es[0].values.length >= 2) {
    for (let i=1; i<es[0].values.length; i++) {
      const su=String(es[0].values[i-1][0]), tu=String(es[0].values[i][0]);
      const st=es[0].values[i-1][1]?new Date(String(es[0].values[i-1][1])).getTime():0;
      const tt=es[0].values[i][1]?new Date(String(es[0].values[i][1])).getTime():0;
      if (!su||!tu||st>=tt) continue;
      try { db.run("INSERT OR IGNORE INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ['default','uuid-shiyu',su,tu,'entity','same_entity',0.8,1,st,tt,now]); ec++; } catch {}
    }
  }

  // Semantic + emotion edges for uuid-shiyu
  const ms = db.exec("SELECT global_uid,belong_entity_uuid,perception_json,created_at FROM memories WHERE belong_entity_uuid='uuid-shiyu' AND perception_json IS NOT NULL ORDER BY created_at DESC LIMIT 200");
  let sc=0, mc=0;
  if (ms.length && ms[0].values) {
    const ml = [];
    for (const r of ms[0].values) {
      let v = []; try { v = JSON.parse(String(r[2]||'[]')); } catch {}
      if (Array.isArray(v) && v.length >= 6) ml.push({u:String(r[0]), e:String(r[1]), v, t:r[3]?new Date(String(r[3])).getTime():0});
    }
    for (let i=0; i<ml.length; i++) for (let j=i+1; j<Math.min(i+10, ml.length); j++) {
      const a=ml[i], b=ml[j]; if (a.e !== b.e) continue;
      const n=Math.min(a.v.length, b.v.length); let d=0, nA=0, nB=0;
      for (let k=0; k<n; k++) { d+=a.v[k]*b.v[k]; nA+=a.v[k]*a.v[k]; nB+=b.v[k]*b.v[k]; }
      const sim = nA&&nB ? d/Math.sqrt(nA*nB) : 0;
      const src=a.t<b.t?a:b, tgt=a.t<b.t?b:a; if (src.t>=tgt.t) continue;
      if (sim >= 0.72) { try { db.run("INSERT OR IGNORE INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ['default',a.e,src.u,tgt.u,'semantic','cos',sim,sim,src.t,tgt.t,now]); sc++; } catch {} }
      let ed=0,eA=0,eB=0; for (let k=0; k<Math.min(6,a.v.length,b.v.length); k++) { ed+=a.v[k]*b.v[k]; eA+=a.v[k]*a.v[k]; eB+=b.v[k]*b.v[k]; }
      const esim = eA&&eB ? ed/Math.sqrt(eA*eB) : 0;
      if (esim >= 0.75) { try { db.run("INSERT OR IGNORE INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ['default',a.e,src.u,tgt.u,'emotion','emo',esim,esim,src.t,tgt.t,now]); mc++; } catch {} }
    }
  }
  console.log('edges: entity='+ec+' semantic='+sc+' emotion='+mc);

  // Search
  const q = '徐诗雨浴缸边亲密';
  const qc = cp(q); const qn = new Set();
  for (let i=0; i<qc.length-1; i++) qn.add(qc.substring(i,i+2));
  for (let i=0; i<qc.length-2; i++) qn.add(qc.substring(i,i+3));

  const seeds = [], seen = {};
  for (const g of [...qn].slice(0,6)) {
    const r = db.exec('SELECT source_id,source_type FROM search_index WHERE term=? LIMIT 30', [g]);
    if (r.length && r[0].values) for (const v of r[0].values) {
      const k = v[0]+v[1]; if (!seen[k]) { seen[k]=1; seeds.push({id:String(v[0]), type:String(v[1])}); }
    }
  }
  console.log('n-gram: '+seeds.length+' candidates | terms: '+[...qn].slice(0,6).join(','));

  // Text fetch
  const results = [];
  const mids = seeds.filter(s=>s.type==='memory').map(s=>s.id).slice(0,40);
  if (mids.length) {
    const pl = mids.map(()=>'?').join(',');
    const r = db.exec('SELECT id,global_uid,substr(raw_input,1,400),calcium_score,created_at,perception_json FROM memories WHERE id IN ('+pl+')', mids);
    if (r.length && r[0].values) for (const v of r[0].values) {
      let p = {}; try { p = JSON.parse(String(v[5]||'{}')); } catch {}
      results.push({id:String(v[0]), uid:String(v[1]||''), txt:String(v[2]||''), ca:Number(v[3]||0), ti:String(v[4]||''), pl:p.pleasure??0, ar:p.arousal??0});
    }
  }
  // Also direct keyword search on memories table
  if (results.length < 5) {
    const dr = db.exec("SELECT id,global_uid,substr(raw_input,1,400),calcium_score,created_at FROM memories WHERE (raw_input LIKE '%诗雨%') AND (raw_input LIKE '%浴缸%' OR raw_input LIKE '%亲密%' OR raw_input LIKE '%洗澡%' OR raw_input LIKE '%澡%') LIMIT 20");
    if (dr.length && dr[0].values) for (const v of dr[0].values) {
      const already = results.find(r=>r.id===String(v[0]));
      if (!already) results.push({id:String(v[0]), uid:String(v[1]||''), txt:String(v[2]||''), ca:Number(v[3]||0), ti:String(v[4]||''), pl:0, ar:0});
    }
  }
  // Broader: any 诗雨 memory
  if (results.length < 5) {
    const br = db.exec("SELECT id,global_uid,substr(raw_input,1,400),calcium_score,created_at FROM memories WHERE raw_input LIKE '%诗雨%' ORDER BY created_at DESC LIMIT 30");
    if (br.length && br[0].values) for (const v of br[0].values) {
      const already = results.find(r=>r.id===String(v[0]));
      if (!already) results.push({id:String(v[0]), uid:String(v[1]||''), txt:String(v[2]||''), ca:Number(v[3]||0), ti:String(v[4]||''), pl:0, ar:0});
    }
  }
  console.log('text hits: '+results.length);

  // DAG closure
  const swu = results.filter(r=>r.uid&&r.uid.length>5);
  const visited = {}, cEdges = [], queue = swu.map(r=>({uid:r.uid, depth:0}));
  for (const r of swu) visited[r.uid] = 1;
  while (queue.length && Object.keys(visited).length < 80) {
    const cur = queue.shift(); if (cur.depth >= 2) continue;
    const er = db.exec("SELECT source_global_uid,target_global_uid,edge_type,confidence FROM memory_associations WHERE (source_global_uid=? OR target_global_uid=?) AND confidence>=0.5 LIMIT 15", [cur.uid, cur.uid]);
    if (er.length && er[0].values) for (const v of er[0].values) {
      const nb = String(v[0])===cur.uid ? String(v[1]) : String(v[0]);
      cEdges.push({src:v[0], tgt:v[1], type:v[2], conf:v[3]});
      if (!visited[nb]) { visited[nb]=1; queue.push({uid:nb, depth:cur.depth+1}); }
    }
  }
  const vuids = Object.keys(visited);
  console.log('DAG nodes: '+vuids.length+' | edges: '+cEdges.length);

  // Narrative
  if (vuids.length) {
    const vpl = vuids.slice(0,30).map(()=>'?').join(',');
    const dr = db.exec('SELECT global_uid,substr(raw_input,1,400),calcium_score,created_at FROM memories WHERE global_uid IN ('+vpl+') ORDER BY created_at ASC LIMIT 25', vuids.slice(0,30));
    const details = [];
    if (dr.length && dr[0].values) for (const dv of dr[0].values) details.push({uid:String(dv[0]), txt:String(dv[1]||''), ca:Number(dv[2]||0), ti:String(dv[3]||'')});

    const kw = /诗雨|浴缸|亲密|洗澡|浴室|澡|湿|身体|抱着|吻|躺|抚摸|湿透|热水|泡|赤裸|肌肤|浴室|裸|爱/;
    const rel = details.filter(d=>kw.test(d.txt));
    const extra = details.filter(d=>!kw.test(d.txt)).slice(0,3);

    console.log('\n📖 记忆链 · 徐诗雨浴缸边亲密\n');
    for (let i=0; i<Math.min(rel.length, 15); i++) {
      const m = rel[i]; const star = m.ca>=1?'★ ':'  ';
      console.log((i+1)+'. '+star+(m.ti||'?').substring(0,16));
      console.log('   '+m.txt.substring(0,250).replace(/\n/g,'\n   ')+'\n');
    }
    if (extra.length) { console.log('  --- 上下文 ---'); for (const m of extra) console.log('   '+m.txt.substring(0,150)); }
    console.log('\n  诗雨相关: '+(rel.some(d=>/诗雨/.test(d.txt))?'✅':'❌'));
    console.log('  浴缸/亲密: '+(rel.some(d=>/浴缸|洗澡|澡|浴|亲密/.test(d.txt))?'✅':'❌'));
    console.log('  DAG链: '+(cEdges.length>=2?'✅':'❌')+' ('+cEdges.length+' edges)');
    console.log('  总节点: '+vuids.length);
  } else {
    console.log('DAG empty - raw results:');
    for (let i=0; i<Math.min(results.length,10); i++) {
      console.log('  '+(i+1)+'. '+results[i].txt.substring(0,200).replace(/\n/g,' | '));
    }
  }

  writeFileSync('data/webui/fusion_memory.db', Buffer.from(db.export()));
  db.close();
  console.log('\nDone');
}
main().catch(console.error);
