// 为存量数据构建 4 类 DAG 边 (entity/semantic/emotion/causal)
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync('data/webui/fusion_memory.db'));
  const now = Date.now();
  let ec=0, sc=0, mc=0, cc=0;

  // ═══ Entity edges: 同 belong_entity_uuid 按时序链 ═══
  console.log('1. Entity edges...');
  try { db.exec("DELETE FROM memory_associations WHERE edge_type='entity'"); } catch {}
  const eus = db.exec("SELECT DISTINCT belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
  if (eus.length && eus[0].values) for (const [eu] of eus[0].values) {
    const rs = db.exec("SELECT global_uid,created_at FROM memories WHERE belong_entity_uuid=? AND global_uid IS NOT NULL ORDER BY created_at ASC LIMIT 200",[String(eu)]);
    if (!rs.length||!rs[0].values||rs[0].values.length<2) continue;
    for (let i=1;i<rs[0].values.length;i++) {
      const su=String(rs[0].values[i-1][0]),tu=String(rs[0].values[i][0]);
      const st=rs[0].values[i-1][1]?new Date(String(rs[0].values[i-1][1])).getTime():0;
      const tt=rs[0].values[i][1]?new Date(String(rs[0].values[i][1])).getTime():0;
      if (!su||!tu||st>=tt) continue;
      try { db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',String(eu),su,tu,'entity','same_entity_chain',0.8,1,st,tt,'system',now,now]); ec++; } catch(e2) { if (!e2.message.includes('UNIQUE')&&!e2.message.includes('NOT NULL')) console.log('entity边失败:'+e2.message); }
    }
  }
  console.log('  entity: '+ec);

  // ═══ Semantic + Emotion edges: 同 entity 24D向量余弦 ═══
  console.log('2. Semantic + Emotion edges...');
  const mems = db.exec("SELECT global_uid,belong_entity_uuid,perception_json,created_at FROM memories WHERE belong_entity_uuid IS NOT NULL AND global_uid IS NOT NULL AND perception_json IS NOT NULL ORDER BY created_at DESC LIMIT 500");
  if (mems.length&&mems[0].values) {
    const ml=[];
    for (const r of mems[0].values) {
      let v=[]; try{v=JSON.parse(String(r[2]||'[]'))}catch{}; if (!Array.isArray(v)||v.length<6) continue;
      ml.push({u:String(r[0]),e:String(r[1]),v,t:r[3]?new Date(String(r[3])).getTime():0});
    }
    for (let i=0;i<ml.length;i++) for (let j=i+1;j<Math.min(i+10,ml.length);j++) {
      const a=ml[i],b=ml[j]; if (a.e!==b.e) continue;
      const n=Math.min(a.v.length,b.v.length); let d=0,nA=0,nB=0;
      for (let k=0;k<n;k++){d+=a.v[k]*b.v[k];nA+=a.v[k]*a.v[k];nB+=b.v[k]*b.v[k];}
      const sim=nA&&nB?d/Math.sqrt(nA*nB):0;
      const src=a.t<b.t?a:b,tgt=a.t<b.t?b:a; if (src.t>=tgt.t) continue;
      if (sim>=0.72){try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',a.e,src.u,tgt.u,'semantic','cos='+sim.toFixed(2),sim,sim,src.t,tgt.t,'system',now,now]);sc++;}catch(e2){if(!e2.message.includes('UNIQUE'))console.log('sem失败:'+e2.message)}}
      let ed=0,eA=0,eB=0; for(let k=0;k<Math.min(6,a.v.length,b.v.length);k++){ed+=a.v[k]*b.v[k];eA+=a.v[k]*a.v[k];eB+=b.v[k]*b.v[k];}
      const es=eA&&eB?ed/Math.sqrt(eA*eB):0;
      if (es>=0.75){try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',a.e,src.u,tgt.u,'emotion','emo='+es.toFixed(2),es,es,src.t,tgt.t,'system',now,now]);mc++;}catch(e2){if(!e2.message.includes('UNIQUE'))console.log('emo失败:'+e2.message)}}
    }
  }
  console.log('  semantic: '+sc+' | emotion: '+mc);

  // ═══ Causal edges: 同 entity 30min内同locus ═══
  console.log('3. Causal edges...');
  if (eus.length && eus[0].values) for (const [eu] of eus[0].values) {
    const rs = db.exec("SELECT global_uid,raw_input,locus_path,created_at FROM memories WHERE belong_entity_uuid=? AND global_uid IS NOT NULL ORDER BY created_at ASC LIMIT 200",[String(eu)]);
    if (!rs.length||!rs[0].values||rs[0].values.length<2) continue;
    for (let i=1;i<rs[0].values.length;i++) {
      const pU=String(rs[0].values[i-1][0]),cU=String(rs[0].values[i][0]);
      const pTxt=String(rs[0].values[i-1][1]||''),cTxt=String(rs[0].values[i][1]||'');
      const pLocus=String(rs[0].values[i-1][2]||''),cLocus=String(rs[0].values[i][2]||'');
      const pTs=rs[0].values[i-1][3]?new Date(String(rs[0].values[i-1][3])).getTime():0;
      const cTs=rs[0].values[i][3]?new Date(String(rs[0].values[i][3])).getTime():0;
      if (!pU||!cU||pTs>=cTs) continue;
      const gapM=(cTs-pTs)/60000; if (gapM>30) continue;
      const pTopic=pLocus.split('.').slice(0,2).join('.');
      const cTopic=cLocus.split('.').slice(0,2).join('.');
      if (pTopic && cTopic && pTopic!==cTopic) continue;
      const hints=['因为','所以','于是','然后','导致','决定','打算','准备','那我','我会','我想'];
      const hit=hints.some(h=>cTxt.includes(h)); if (!hit) continue;
      const conf=0.6+(hints.filter(h=>cTxt.includes(h)).length>1?0.15:0);
      try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',String(eu),pU,cU,'causal','short_window_causal',Math.min(1,conf),1,pTs,cTs,'system',now,now]);cc++;}catch(e2){if(!e2.message.includes('UNIQUE'))console.log('cau失败:'+e2.message)}
    }
  }
  console.log('  causal: '+cc);

  // Save
  writeFileSync('data/webui/fusion_memory.db', Buffer.from(db.export()));
  const et=db.exec('SELECT edge_type,count(*) FROM memory_associations GROUP BY edge_type');
  console.log('\n  DAG 边汇总:');
  if (et.length&&et[0].values) for (const r of et[0].values) console.log('    '+r[0]+': '+r[1]);
  console.log('  总计: '+(ec+sc+mc+cc));
  db.close();
}
main().catch(console.error);
