// rebuild-bd-vectors.mjs — 黑钻 emotion_vector 重建 V2
// SCRIPT-GOV-A2d-Batch-2b: 治理门控 (CRITICAL, backfill)
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const {validateGate, recordGovernanceDecision }=require('./_governance-gate.cjs');
var G={};for(var _i=2;_i<process.argv.length;_i++){var _a=process.argv[_i];if(_a==="--apply")G.apply=1;else if(_a==="--operator"&&process.argv[_i+1])G.op=process.argv[++_i];else if(_a==="--reason"&&process.argv[_i+1])G.reason=process.argv[++_i];else if(_a==="--ticket"&&process.argv[_i+1])G.ticket=process.argv[++_i];else if(_a==="--confirm"&&process.argv[_i+1])G.confirm=process.argv[++_i];else if(_a==="--scope"&&process.argv[_i+1])G.scope=process.argv[++_i];else if(_a==="--report-path"&&process.argv[_i+1])G.rpt=process.argv[++_i];else if(_a==="--help"){console.log("Usage: node rebuild-bd-vectors.mjs [--apply] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]");process.exit(0)}}
var M=G.apply?"apply":"dry-run",DR=!G.apply;

import Database from 'better-sqlite3';
import { join } from 'path';

async function main() {
  if(!DR){var C={scriptId:"rebuild-bd-vectors",riskLevel:"CRITICAL",operationType:"backfill",mode:M,environment:"local",operator:{operatorId:G.op||"",reason:G.reason||"",ticket:G.ticket||null},scope:{selector:G.scope||"table:black_diamond",limit:0,batchSize:0,since:null,until:null},confirmation:{required:true,provided:!!G.confirm,tokenDigest:G.confirm||null},backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},irreversibleConfirmation:!!G.confirm,reportPath:G.rpt||null};var V=validateGate(C);var PE=V.errors.filter(function(e){return["R008","R009","R010","R013"].indexOf(e.rule)===-1});if(PE.length>0){var DE=["","======================================================================","  SCRIPT EXECUTION CONTRACT DENIED","======================================================================","  Script:  rebuild-bd-vectors.mjs","  Risk:    CRITICAL","  Mode:    apply","  Operation: backfill","","  Issues:"];PE.forEach(function(e){DE.push("    ["+e.rule+"] "+e.message)});DE.push("","  Refusing to continue.","======================================================================","");console.error(DE.join("\n"));recordGovernanceDecision(C,V);recordGovernanceDecision(C,V);process.exit(2)}}
  if(DR){console.log("[DRY-RUN] rebuild-bd-vectors — 将扫描 black_diamond 关联 memories。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际重建。\n");process.exit(0)}

  var db = new Database(join(process.cwd(), 'data/webui/fusion_memory.db'));
  console.log('🔧 黑钻 emotion_vector 重建 V2');
  var joinRows = db.prepare("SELECT bd.id as bd_id, bd.source_id, m.perception_json FROM black_diamond bd INNER JOIN memories m ON bd.source_id = m.id WHERE bd.source_id IS NOT NULL AND m.perception_json IS NOT NULL").all();
  console.log('可关联: ' + joinRows.length + ' 条');
  var rebuilt = 0, skipped = 0;
  var updateStmt = db.prepare('UPDATE black_diamond SET emotion_vector = ?, l2_norm = ? WHERE id = ?');
  for (var i = 0; i < joinRows.length; i++) { var row = joinRows[i];
    try { var arr = JSON.parse(row.perception_json); if (!Array.isArray(arr) || arr.length < 24) { skipped++; continue; } var vec = arr.slice(0, 24).map(function(v) { return Number(v) || 0; }); if (vec.every(function(v) { return v === 0; })) { skipped++; continue; } var sumSq = 0; for (var j = 0; j < 24; j++) sumSq += vec[j] * vec[j]; var l2norm = Math.round(Math.sqrt(sumSq) * 10000) / 10000; updateStmt.run(JSON.stringify(vec), l2norm, row.bd_id); rebuilt++; } catch { skipped++; }
  }
  console.log('重建: ' + rebuilt + ' | 跳过: ' + skipped);
  var dist = db.prepare("SELECT CASE WHEN emotion_vector IS NULL THEN -1 WHEN l2_norm IS NULL OR l2_norm=0 THEN 0 WHEN l2_norm<1 THEN 1 ELSE 2 END as bucket, COUNT(*) as c FROM black_diamond GROUP BY bucket").all();
  var nullC = dist.find(function(d) { return d.bucket === -1; }); var zeroC = dist.find(function(d) { return d.bucket === 0; }); var lowC = dist.find(function(d) { return d.bucket === 1; }); var highC = dist.find(function(d) { return d.bucket === 2; });
  console.log('分布: NULL=' + (nullC?nullC.c:0) + ' zero=' + (zeroC?zeroC.c:0) + ' <1=' + (lowC?lowC.c:0) + ' >=1=' + (highC?highC.c:0));
  db.close();
}
main().catch(function(e) { console.error(e); process.exit(1); });
