import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('data/webui/fusion_memory.db'));
  const now = Date.now();

  function cleanPunct(t) { return String(t||'').replace(/[^一-鿿\w]/g,'').trim(); }

  // 0. Add Foresight columns
  try { db.run("ALTER TABLE memories ADD COLUMN is_foresight INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.run("ALTER TABLE memories ADD COLUMN foresight_status TEXT NOT NULL DEFAULT 'none'"); } catch {}
  try { db.run("ALTER TABLE memories ADD COLUMN valid_start_ms INTEGER"); } catch {}
  try { db.run("ALTER TABLE memories ADD COLUMN valid_until_ms INTEGER"); } catch {}
  try { db.run("ALTER TABLE memories ADD COLUMN foresight_reason TEXT"); } catch {}

  // 1. Backfill global_uid
  console.log('1. Backfill global_uid + belong_entity_uuid');
  const ids = db.exec("SELECT id FROM memories WHERE global_uid IS NULL");
  if (ids.length && ids[0].values) {
    for (const r of ids[0].values) {
      const h = createHash('sha256').update(String(r[0])).digest('hex').substring(0,8).toUpperCase();
      db.run('UPDATE memories SET global_uid=? WHERE id=?', ['MM'+h, String(r[0])]);
    }
  }
  var people = [['熊梓铭','uuid-ziming'],['梓铭','uuid-ziming'],['诗韵','uuid-shirley'],['玉瑶','uuid-yaoyao'],['瑶瑶','uuid-yaoyao'],['鸿艺','uuid-hongyi'],['梓玥','uuid-ziyue'],['王全芬','uuid-wangqf']];
  for (var i=0;i<people.length;i++) {
    db.run("UPDATE memories SET belong_entity_uuid=? WHERE raw_input LIKE ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid='')", [people[i][1], '%'+people[i][0]+'%']);
  }
  var v1 = db.exec('SELECT count(*) FROM memories WHERE global_uid IS NOT NULL');
  var v2 = db.exec("SELECT count(*) FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
  console.log('  global_uid: '+v1[0].values[0][0]+' | belong_entity_uuid: '+v2[0].values[0][0]);

  // 2. Rebuild search_index
  console.log('\n2. Rebuild search_index');
  try { db.run("DROP TABLE IF EXISTS search_index"); } catch {}
  db.run("CREATE TABLE search_index (term TEXT, source_type TEXT, source_id TEXT, PRIMARY KEY(term,source_type,source_id))");
  var srcs = [['memories','raw_input','memory'],['conversations','content','conversation'],['knowledge_base','content','knowledge_base']];
  var siCount = 0;
  for (var s=0;s<srcs.length;s++) {
    var tbl = srcs[s][0], col = srcs[s][1], stype = srcs[s][2];
    var rows = db.exec("SELECT id,"+col+" FROM "+tbl+" WHERE "+col+" IS NOT NULL");
    if (rows.length && rows[0].values) {
      for (var j=0;j<rows[0].values.length;j++) {
        var id = String(rows[0].values[j][0]), text = String(rows[0].values[j][1]||'');
        var cl = cleanPunct(text); if (cl.length<2) continue;
        var ng = {};
        for (var k=0;k<cl.length-1;k++) ng[cl.substring(k,k+2)]=1;
        for (var k=0;k<cl.length-2;k++) ng[cl.substring(k,k+3)]=1;
        var grams = Object.keys(ng);
        for (var g=0;g<grams.length;g++) {
          try { db.run("INSERT OR IGNORE INTO search_index VALUES(?,?,?)", [grams[g], stype, id]); siCount++; } catch {}
        }
      }
    }
  }
  console.log('  search_index: '+db.exec('SELECT count(*) FROM search_index')[0].values[0][0]+' 条('+siCount+' inserts)');

  // 3. Build edges
  console.log('\n3. Build DAG edges');
  try { db.run("DROP TABLE IF EXISTS memory_associations"); } catch {}
  db.run("CREATE TABLE memory_associations (id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT DEFAULT 'default', belong_entity_uuid TEXT, source_global_uid TEXT, target_global_uid TEXT, edge_type TEXT, edge_reason TEXT, confidence REAL, weight REAL, source_timestamp_ms INTEGER, target_timestamp_ms INTEGER, created_at_ms INTEGER, state_flag TEXT DEFAULT 'active')");

  // 3a. Entity edges
  var eus = db.exec("SELECT DISTINCT belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
  var ec = 0;
  if (eus.length && eus[0].values) for (var ei=0;ei<eus[0].values.length;ei++) {
    var eu = String(eus[0].values[ei][0]);
    var rs = db.exec("SELECT global_uid, created_at FROM memories WHERE belong_entity_uuid=? AND global_uid IS NOT NULL ORDER BY created_at ASC LIMIT 100", [eu]);
    if (!rs.length||!rs[0].values||rs[0].values.length<2) continue;
    for (var ri=1;ri<rs[0].values.length;ri++) {
      var sU=String(rs[0].values[ri-1][0]), tU=String(rs[0].values[ri][0]);
      var sT=rs[0].values[ri-1][1]?new Date(String(rs[0].values[ri-1][1])).getTime():0;
      var tT=rs[0].values[ri][1]?new Date(String(rs[0].values[ri][1])).getTime():0;
      if (!sU||!tU||sT>=tT) continue;
      try {
        db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          ['default',eu,sU,tU,'entity','same_entity',0.8,1,sT,tT,now]);
        ec++;
      } catch(e2){}
    }
  }
  console.log('  实体边: '+ec);

  // 3b. Semantic + emotion edges
  var mems = db.exec("SELECT global_uid,belong_entity_uuid,perception_json,created_at FROM memories WHERE belong_entity_uuid IS NOT NULL AND global_uid IS NOT NULL AND perception_json IS NOT NULL ORDER BY created_at DESC LIMIT 300");
  var sc=0, mc=0;
  if (mems.length&&mems[0].values){
    var ml=[];
    for (var mi=0;mi<mems[0].values.length;mi++){
      var r=mems[0].values[mi]; var vec=[];
      try { vec=JSON.parse(String(r[2]||'[]')); } catch {vec=[];}
      if (!Array.isArray(vec)||vec.length<6) continue;
      ml.push({u:String(r[0]),e:String(r[1]),v:vec,t:r[3]?new Date(String(r[3])).getTime():0});
    }
    for (var i=0;i<ml.length;i++) for (var j=i+1;j<Math.min(i+10,ml.length);j++){
      var a=ml[i],b=ml[j]; if (a.e!==b.e) continue;
      var n=Math.min(a.v.length,b.v.length), d=0,nA=0,nB=0;
      for (var k=0;k<n;k++){d+=a.v[k]*b.v[k];nA+=a.v[k]*a.v[k];nB+=b.v[k]*b.v[k];}
      var sim=nA&&nB?d/Math.sqrt(nA*nB):0;
      var src=a.t<b.t?a:b, tgt=a.t<b.t?b:a; if (src.t>=tgt.t) continue;
      if (sim>=0.72){
        try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)",['default',a.e,src.u,tgt.u,'semantic','cos',sim,sim,src.t,tgt.t,now]);sc++;}catch{}
      }
      var ed=0,eA=0,eB=0; for (var k=0;k<Math.min(6,a.v.length,b.v.length);k++){ed+=a.v[k]*b.v[k];eA+=a.v[k]*a.v[k];eB+=b.v[k]*b.v[k];}
      var es=eA&&eB?ed/Math.sqrt(eA*eB):0;
      if (es>=0.75){
        try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)",['default',a.e,src.u,tgt.u,'emotion','emo',es,es,src.t,tgt.t,now]);mc++;}catch{}
      }
    }
  }
  console.log('  语义: '+sc+' | 情绪: '+mc);
  var et=db.exec('SELECT edge_type,count(*) FROM memory_associations GROUP BY edge_type');
  if (et.length&&et[0].values) for (var ei=0;ei<et[0].values.length;ei++) console.log('    '+et[0].values[ei][0]+': '+et[0].values[ei][1]);
  console.log('  总边: '+db.exec('SELECT count(*) FROM memory_associations')[0].values[0][0]);

  // 4. Search: n-gram → DAG closure → narrative
  console.log('\n4. Search: 熊梓铭 学术 纪实 小说');
  var q = '熊梓铭学术纪实小说';
  var qc = cleanPunct(q); var qn=[];
  for (var i=0;i<qc.length-1;i++) qn.push(qc.substring(i,i+2));
  for (var i=0;i<qc.length-2;i++) qn.push(qc.substring(i,i+3));
  qn = [...new Set(qn)].slice(0,6);

  var seedInfo=[], seen={};
  for (var gi=0;gi<qn.length;gi++){
    var g=qn[gi];
    var r=db.exec('SELECT source_id, source_type FROM search_index WHERE term=? LIMIT 30',[g]);
    if (r.length&&r[0].values) for (var si=0;si<r[0].values.length;si++){
      var sid=String(r[0].values[si][0]), st=String(r[0].values[si][1]);
      var key=sid+st; if (!seen[key]){seen[key]=1;seedInfo.push({id:sid,type:st});}
    }
  }
  console.log('  n-gram: '+seedInfo.length+' candidates');

  // Fetch text from memories
  var results=[];
  var memIds=seedInfo.filter(function(s){return s.type==='memory'}).map(function(s){return s.id}).slice(0,30);
  if (memIds.length){
    var placeholders=memIds.map(function(){return '?';}).join(',');
    var r=db.exec('SELECT id,global_uid,substr(raw_input,1,300),calcium_score,created_at FROM memories WHERE id IN ('+placeholders+')',memIds);
    if (r.length&&r[0].values) for (var vi=0;vi<r[0].values.length;vi++) {
      var v=r[0].values[vi];
      results.push({id:String(v[0]),uid:String(v[1]||''),txt:String(v[2]||''),ca:Number(v[3]||0),ti:String(v[4]||''),src:'memory'});
    }
  }
  var convIds=seedInfo.filter(function(s){return s.type==='conversation'}).map(function(s){return s.id}).slice(0,30);
  if (convIds.length){
    var cpl=convIds.map(function(){return '?';}).join(',');
    var cr=db.exec('SELECT id,substr(content,1,300),timestamp FROM conversations WHERE id IN ('+cpl+')',convIds);
    if (cr.length&&cr[0].values) for (var ci=0;ci<cr[0].values.length;ci++) {
      var cv=cr[0].values[ci];
      results.push({id:String(cv[0]),uid:'',txt:String(cv[1]||''),ca:0,ti:String(cv[2]||''),src:'conversation'});
    }
  }
  console.log('  text hits: '+results.length);

  // 5. DAG closure
  console.log('\n5. DAG closure');
  var seedsWithUid=results.filter(function(r){return r.uid&&r.uid.length>5;});
  var visited={}, cEdges=[], queue=seedsWithUid.map(function(r){return {uid:r.uid,depth:0};});
  for (var si=0;si<seedsWithUid.length;si++) visited[seedsWithUid[si].uid]=1;
  while (queue.length&&Object.keys(visited).length<80){
    var cur=queue.shift(); if (cur.depth>=2) continue;
    var er=db.exec("SELECT source_global_uid,target_global_uid,edge_type,confidence FROM memory_associations WHERE (source_global_uid=? OR target_global_uid=?) AND confidence>=0.5 LIMIT 15",[cur.uid,cur.uid]);
    if (er.length&&er[0].values) for (var ei=0;ei<er[0].values.length;ei++){
      var ev=er[0].values[ei];
      var nb=String(ev[0])===cur.uid?String(ev[1]):String(ev[0]);
      cEdges.push({src:ev[0],tgt:ev[1],type:ev[2],conf:ev[3]});
      if (!visited[nb]){visited[nb]=1;queue.push({uid:nb,depth:cur.depth+1});}
    }
  }
  var vuids=Object.keys(visited);
  console.log('  nodes: '+vuids.length+' | edges: '+cEdges.length);

  // 6. Narrative
  console.log('\n6. Narrative');
  if (vuids.length){
    var vpl=vuids.slice(0,30).map(function(){return '?';}).join(',');
    var dr=db.exec('SELECT global_uid,substr(raw_input,1,300),calcium_score,created_at,is_foresight,foresight_status FROM memories WHERE global_uid IN ('+vpl+') ORDER BY created_at ASC LIMIT 25',vuids.slice(0,30));
    var details=[];
    if (dr.length&&dr[0].values) for (var di=0;di<dr[0].values.length;di++) {
      var dv=dr[0].values[di];
      details.push({uid:String(dv[0]),txt:String(dv[1]||''),ca:Number(dv[2]||0),ti:String(dv[3]||''),fs:Number(dv[4]||0),fst:String(dv[5]||'none')});
    }

    var keywords=/梓铭|学术|研究|实验|小说|纪实|写书|出版|文献|论文|认知|博士/;
    var rel=details.filter(function(d){return keywords.test(d.txt);});
    var extra=details.filter(function(d){return !keywords.test(d.txt);}).slice(0,3);

    console.log('  📖 记忆链 · 熊梓铭的学术研究与纪实小说\n');
    for (var ri=0;ri<Math.min(rel.length,15);ri++){
      var m=rel[ri], star=m.ca>=1?'★':' ', tag=m.fs?' ['+m.fst+']':'';
      console.log('  '+(ri+1)+'. '+star+(m.ti||'?').substring(0,16)+tag);
      console.log('     '+m.txt.substring(0,200)+'\n');
    }
    if (extra.length){
      console.log('  --- 上下文 ---');
      for (var ei=0;ei<extra.length;ei++) console.log('     '+extra[ei].txt.substring(0,150));
    }
    console.log('\n  学术研究: '+(rel.some(function(d){return /学术|研究|实验|认知|文献|论文|博士/.test(d.txt);})?'✅':'❌'));
    console.log('  纪实小说: '+(rel.some(function(d){return /小说|纪实|写书|出版/.test(d.txt);})?'✅':'❌'));
    console.log('  DAG链: '+(cEdges.length>=2?'✅':'❌')+' ('+cEdges.length+' edges)');
    console.log('  总记忆: '+vuids.length);
  } else {
    console.log('  DAG empty - fallback to ngram results');
    for (var fi=0;fi<Math.min(results.length,10);fi++) console.log('  '+(fi+1)+'. ['+results[fi].src+'] '+results[fi].txt.substring(0,160));
  }

  writeFileSync('data/webui/fusion_memory.db', Buffer.from(db.export()));
  db.close();
  console.log('\nDone - DB saved');
}
main().catch(function(e){console.error(e);});
