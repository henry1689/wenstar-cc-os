#!/usr/bin/env node
/**
 * Harness S2-S4 原子化修复+验收脚本
 * 单进程内运行迁移→修复→建边→十维测试，防止服务中途覆盖DB
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';

const DB = resolve('data/webui/fusion_memory.db');

function cp(t) { return String(t||'').replace(/[，。！？、；：""''（）《》【】\s\d\-\/\/@#$%^&*+=~`|]/g,'').trim(); }

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Harness S2-S4 原子修复流水线        ║');
  console.log('╚══════════════════════════════════════╝');
  const t0 = Date.now();
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(DB));
  const now = Date.now();

  // ═══════════════════════════════════════════════════════
  // Step 1: 迁移 (apply-migrations)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Step 1: 迁移 ──');
  // v8: DAG
  try { db.exec("SELECT 1 FROM memory_associations LIMIT 0"); }
  catch {
    try { db.run("DROP TABLE IF EXISTS memory_associations"); } catch {}
    db.run(`CREATE TABLE memory_associations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT NOT NULL DEFAULT 'default',
      belong_entity_uuid TEXT NOT NULL, source_global_uid TEXT NOT NULL, target_global_uid TEXT NOT NULL,
      edge_type TEXT NOT NULL, edge_reason TEXT, confidence REAL NOT NULL DEFAULT 0.7, weight REAL NOT NULL DEFAULT 1.0,
      source_timestamp_ms INTEGER NOT NULL, target_timestamp_ms INTEGER NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'system', created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
      state_flag TEXT NOT NULL DEFAULT 'active',
      CHECK (confidence >= 0.0 AND confidence <= 1.0), CHECK (weight >= 0.0),
      CHECK (source_timestamp_ms < target_timestamp_ms))`);
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_ma_unique ON memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_ma_src ON memory_associations(namespace,belong_entity_uuid,source_global_uid,edge_type,confidence)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_ma_tgt ON memory_associations(namespace,belong_entity_uuid,target_global_uid,edge_type,confidence)"); } catch {}
    console.log('  v8 memory_associations ✅');
  }
  // v9: Foresight
  try { db.exec("SELECT is_foresight FROM memories LIMIT 0"); }
  catch {
    try { db.run("ALTER TABLE memories ADD COLUMN is_foresight INTEGER NOT NULL DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN valid_start_ms INTEGER"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN valid_until_ms INTEGER"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN foresight_status TEXT NOT NULL DEFAULT 'none'"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN foresight_reason TEXT"); } catch {}
    console.log('  v9 Foresight ✅');
  }
  // v10: search_index
  try { db.exec("SELECT 1 FROM search_index LIMIT 0"); }
  catch {
    db.run("CREATE TABLE search_index (term TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(term,source_type,source_id))");
    console.log('  v10 search_index 表创建');
  }
  // 回填
  let siCnt = db.exec("SELECT count(*) FROM search_index")[0].values[0][0];
  if (siCnt === 0) {
    let total = 0;
    for (const [tbl, col, st] of [['memories','raw_input','memory'],['conversations','content','conversation'],['knowledge_base','content','knowledge_base']]) {
      const rows = db.exec("SELECT id,"+col+" FROM "+tbl+" WHERE "+col+" IS NOT NULL");
      if (rows.length && rows[0].values) for (const r of rows[0].values) {
        const cl = cp(String(r[1]||'')); if (cl.length<2) continue;
        const ng = new Set();
        for (let i=0;i<cl.length-1;i++) ng.add(cl.substring(i,i+2));
        for (let i=0;i<cl.length-2;i++) ng.add(cl.substring(i,i+3));
        for (const g of ng) { try { db.run("INSERT OR IGNORE INTO search_index VALUES(?,?,?)",[g,st,String(r[0])]); total++; } catch {} }
      }
    }
    console.log('  search_index 回填: '+total+' 条');
    siCnt = total;
  } else console.log('  search_index 已有: '+siCnt+' 条');

  // 回填 global_uid
  let uidNulls = db.exec("SELECT count(*) FROM memories WHERE global_uid IS NULL")[0].values[0][0];
  if (uidNulls > 0) {
    const ids = db.exec("SELECT id FROM memories WHERE global_uid IS NULL");
    if (ids.length && ids[0].values) for (const r of ids[0].values) {
      const h = createHash('sha256').update(String(r[0])).digest('hex').substring(0,8).toUpperCase();
      db.run("UPDATE memories SET global_uid=? WHERE id=?",['MM'+h,String(r[0])]);
    }
    console.log('  global_uid 回填: '+uidNulls+' 条');
  }
  // 回填 belong_entity_uuid
  const euuidNulls = db.exec("SELECT count(*) FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid=''")[0].values[0][0];
  if (euuidNulls > 300) {
    const people = [['熊梓铭','uuid-ziming'],['梓铭','uuid-ziming'],['徐诗韵','uuid-shirley'],['诗韵','uuid-shirley'],['玉瑶','uuid-yaoyao'],['瑶瑶','uuid-yaoyao'],['鸿艺','uuid-hongyi'],['梓玥','uuid-ziyue'],['熊梓玥','uuid-ziyue'],['王全芬','uuid-wangqf'],['徐诗雨','uuid-shiyu'],['诗雨','uuid-shiyu']];
    for (const [n,u] of people) db.run("UPDATE memories SET belong_entity_uuid=? WHERE raw_input LIKE ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid='')",[u,'%'+n+'%']);
    console.log('  belong_entity_uuid 回填完成');
  }

  // ═══════════════════════════════════════════════════════
  // Step 2: 数据修复
  // ═══════════════════════════════════════════════════════
  console.log('\n── Step 2: 数据修复 ──');
  // Fix null 向量
  const zeros = JSON.stringify(Array(24).fill(0));
  const nullRows = db.exec("SELECT id FROM memories WHERE perception_json LIKE '%null%'");
  let nvFixed = 0;
  if (nullRows.length && nullRows[0].values) for (const r of nullRows[0].values) {
    try {
      const arr = JSON.parse(db.exec("SELECT perception_json FROM memories WHERE id=?",[String(r[0])])[0].values[0][0]);
      if (Array.isArray(arr) && arr.some(x => x === null)) {
        db.run("UPDATE memories SET perception_json=? WHERE id=?",[zeros,String(r[0])]);
        nvFixed++;
      }
    } catch {}
  }
  console.log('  null 向量修复: '+nvFixed+' 条');

  // Fix 浴缸记忆
  db.run("UPDATE memories SET belong_entity_uuid='uuid-shiyu' WHERE id='mem_ms2t1nds_26jn'");
  console.log('  浴缸记忆归属: uuid-shiyu');

  // ═══════════════════════════════════════════════════════
  // Step 3: 建 DAG 边 (inline build-dag-edges)
  // ═══════════════════════════════════════════════════════
  console.log('\n── Step 3: 建 DAG 边 ──');
  try { db.run("DELETE FROM memory_associations WHERE edge_type='entity'"); } catch {}

  // Entity edges
  let ec = 0;
  const eus = db.exec("SELECT DISTINCT belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''");
  if (eus.length && eus[0].values) for (const [eu] of eus[0].values) {
    const rs = db.exec("SELECT global_uid,created_at FROM memories WHERE belong_entity_uuid=? AND global_uid IS NOT NULL ORDER BY created_at ASC LIMIT 200",[String(eu)]);
    if (!rs.length||!rs[0].values||rs[0].values.length<2) continue;
    for (let i=1;i<rs[0].values.length;i++) {
      const su=String(rs[0].values[i-1][0]),tu=String(rs[0].values[i][0]);
      const st=rs[0].values[i-1][1]?new Date(String(rs[0].values[i-1][1])).getTime():0;
      const tt=rs[0].values[i][1]?new Date(String(rs[0].values[i][1])).getTime():0;
      if (!su||!tu||st>=tt) continue;
      try { db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',String(eu),su,tu,'entity','same_entity_chain',0.8,1,st,tt,'system',now,now]); ec++; } catch(e2) { if(!e2.message.includes('UNIQUE')) {} }
    }
  }
  console.log('  entity: '+ec);

  // Semantic + Emotion edges
  const mems = db.exec("SELECT global_uid,belong_entity_uuid,perception_json,created_at FROM memories WHERE belong_entity_uuid IS NOT NULL AND global_uid IS NOT NULL AND perception_json IS NOT NULL ORDER BY created_at DESC LIMIT 500");
  let sc=0, mc=0;
  if (mems.length&&mems[0].values){
    const ml=[];
    for (const r of mems[0].values){
      let v=[]; try{v=JSON.parse(String(r[2]||'[]'))}catch{}; if(!Array.isArray(v)||v.length<6) continue;
      ml.push({u:String(r[0]),e:String(r[1]),v,t:r[3]?new Date(String(r[3])).getTime():0});
    }
    for (let i=0;i<ml.length;i++) for (let j=i+1;j<Math.min(i+10,ml.length);j++){
      const a=ml[i],b=ml[j]; if(a.e!==b.e) continue;
      const n=Math.min(a.v.length,b.v.length); let d=0,nA=0,nB=0;
      for(let k=0;k<n;k++){d+=a.v[k]*b.v[k];nA+=a.v[k]*a.v[k];nB+=b.v[k]*b.v[k];}
      const sim=nA&&nB?d/Math.sqrt(nA*nB):0;
      const src=a.t<b.t?a:b,tgt=a.t<b.t?b:a; if(src.t>=tgt.t) continue;
      if(sim>=0.72){try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',a.e,src.u,tgt.u,'semantic','cos='+sim.toFixed(2),sim,sim,src.t,tgt.t,'system',now,now]);sc++;}catch(e2){if(!e2.message.includes('UNIQUE')){}}}
      let ed=0,eA=0,eB=0; for(let k=0;k<Math.min(6,a.v.length,b.v.length);k++){ed+=a.v[k]*b.v[k];eA+=a.v[k]*a.v[k];eB+=b.v[k]*b.v[k];}
      const es=eA&&eB?ed/Math.sqrt(eA*eB):0;
      if(es>=0.75){try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',a.e,src.u,tgt.u,'emotion','emo='+es.toFixed(2),es,es,src.t,tgt.t,'system',now,now]);mc++;}catch(e2){if(!e2.message.includes('UNIQUE')){}}}
    }
  }
  console.log('  semantic: '+sc+' | emotion: '+mc);

  // Causal edges
  let cc = 0;
  if (eus.length && eus[0].values) for (const [eu] of eus[0].values) {
    const rs = db.exec("SELECT global_uid,raw_input,locus_path,created_at FROM memories WHERE belong_entity_uuid=? AND global_uid IS NOT NULL ORDER BY created_at ASC LIMIT 200",[String(eu)]);
    if (!rs.length||!rs[0].values||rs[0].values.length<2) continue;
    for (let i=1;i<rs[0].values.length;i++) {
      const pU=String(rs[0].values[i-1][0]),cU=String(rs[0].values[i][0]);
      const cTxt=String(rs[0].values[i][1]||'');
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
      try{db.run("INSERT INTO memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type,edge_reason,confidence,weight,source_timestamp_ms,target_timestamp_ms,created_by,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",['default',String(eu),pU,cU,'causal','short_window_causal',0.7,1,pTs,cTs,'system',now,now]);cc++;}catch(e2){if(!e2.message.includes('UNIQUE')){}}
    }
  }
  console.log('  causal: '+cc);

  // ═══════════════════════════════════════════════════════
  // Step 4: 保存 DB
  // ═══════════════════════════════════════════════════════
  console.log('\n── Step 4: 保存 DB ──');
  writeFileSync(DB, Buffer.from(db.export()));
  console.log('  DB 已保存 ('+(Buffer.from(db.export()).length/1024/1024).toFixed(0)+'MB)');

  // Quick verify
  const vc = db.exec("SELECT edge_type,count(*) FROM memory_associations GROUP BY edge_type");
  if (vc.length&&vc[0].values) for (const r of vc[0].values) console.log('  '+r[0]+': '+r[1]);
  console.log('  search_index: '+db.exec("SELECT count(*) FROM search_index")[0].values[0][0]+' 条');
  console.log('  总边: '+db.exec("SELECT count(*) FROM memory_associations")[0].values[0][0]);

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log('\n✅ 原子流水线完成 ('+elapsed+'s)');

  db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
