// recalibrate-calcium.mjs — 全量钙化重算 V10.1
// SCRIPT-GOV-A2d-Batch-2b: 治理门控 (CRITICAL, update)
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const {validateGate, recordGovernanceDecision }=require('./_governance-gate.cjs');
var G={};for(var _i=2;_i<process.argv.length;_i++){var _a=process.argv[_i];if(_a==="--apply")G.apply=1;else if(_a==="--operator"&&process.argv[_i+1])G.op=process.argv[++_i];else if(_a==="--reason"&&process.argv[_i+1])G.reason=process.argv[++_i];else if(_a==="--ticket"&&process.argv[_i+1])G.ticket=process.argv[++_i];else if(_a==="--confirm"&&process.argv[_i+1])G.confirm=process.argv[++_i];else if(_a==="--scope"&&process.argv[_i+1])G.scope=process.argv[++_i];else if(_a==="--report-path"&&process.argv[_i+1])G.rpt=process.argv[++_i];else if(_a==="--help"){console.log("Usage: node recalibrate-calcium.mjs [--apply] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]");process.exit(0)}}
var M=G.apply?"apply":"dry-run",DR=!G.apply;

import Database from 'better-sqlite3';
import { join } from 'path';

const LEVEL0_MAX = 0.25; const LEVEL1_MAX = 0.45; const LEVEL2_MAX = 0.65;
function calcLevel(score) { if (score < LEVEL0_MAX) return 0; if (score < LEVEL1_MAX) return 1; if (score < LEVEL2_MAX) return 2; return 3; }
function label(level) { return ['粉末','液体','固体','晶体'][level] || '未知('+level+')'; }

async function main() {
  if(!DR){var C={scriptId:"recalibrate-calcium",riskLevel:"CRITICAL",operationType:"update",mode:M,environment:"local",operator:{operatorId:G.op||"",reason:G.reason||"",ticket:G.ticket||null},scope:{selector:G.scope||"table:memories",limit:0,batchSize:0,since:null,until:null},confirmation:{required:true,provided:!!G.confirm,tokenDigest:G.confirm||null},backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},irreversibleConfirmation:!!G.confirm,reportPath:G.rpt||null};var V=validateGate(C);var PE=V.errors.filter(function(e){return["R008","R009","R010","R013"].indexOf(e.rule)===-1});if(PE.length>0){var DE=["","======================================================================","  SCRIPT EXECUTION CONTRACT DENIED","======================================================================","  Script:  recalibrate-calcium.mjs","  Risk:    CRITICAL","  Mode:    apply","  Operation: update","","  Issues:"];PE.forEach(function(e){DE.push("    ["+e.rule+"] "+e.message)});DE.push("","  Refusing to continue.","======================================================================","");console.error(DE.join("\n"));recordGovernanceDecision(C,V);recordGovernanceDecision(C,V);process.exit(2)}}
  if(DR){console.log("[DRY-RUN] recalibrate-calcium — 将扫描 memories 钙化分布。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际重算。\n");process.exit(0)}

  const DB_PATH = join(process.cwd(), 'data/webui/fusion_memory.db');
  console.log('═'.repeat(60)); console.log('🧪 钙化重算工具 V10.1'); console.log('   阈值: L0<'+LEVEL0_MAX+' L1<'+LEVEL1_MAX+' L2<'+LEVEL2_MAX+' L3≥'+LEVEL2_MAX); console.log('═'.repeat(60));
  var db = new Database(DB_PATH);

  console.log('\n📊 重算前分布:');
  var before = db.prepare('SELECT calcium_level, COUNT(*) as c FROM memories GROUP BY calcium_level ORDER BY calcium_level').all();
  for (var bi = 0; bi < before.length; bi++) { var r = before[bi]; console.log('   L'+r.calcium_level+' ('+label(r.calcium_level)+'): '+String(r.c).padStart(5)+' 条'); }

  var rows = db.prepare('SELECT id, calcium_score, calcium_level FROM memories').all();
  console.log('\n📋 共 '+rows.length+' 条记忆待重算');

  var changed = 0; var migration = { '0→1': 0, '0→2': 0, '0→3': 0, '1→2': 0, '1→3': 0, '2→3': 0, other: 0 };
  var updateStmt = db.prepare('UPDATE memories SET calcium_level = ? WHERE id = ?');
  db.transaction(function() {
    for (var ri = 0; ri < rows.length; ri++) { var row = rows[ri];
      var newLevel = calcLevel(row.calcium_score);
      if (newLevel !== row.calcium_level) { updateStmt.run(newLevel, row.id); changed++; var key = row.calcium_level+'→'+newLevel; if (migration[key] !== undefined) migration[key]++; else migration.other++; }
    }
  })();

  console.log('\n📊 重算后分布:');
  var after = db.prepare('SELECT calcium_level, COUNT(*) as c FROM memories GROUP BY calcium_level ORDER BY calcium_level').all();
  for (var ai = 0; ai < after.length; ai++) { var ar = after[ai]; var beforeCount = before.find(function(b) { return b.calcium_level === ar.calcium_level; })?.c || 0; var delta = ar.c - beforeCount; var sign = delta >= 0 ? '+' : ''; console.log('   L'+ar.calcium_level+' ('+label(ar.calcium_level)+'): '+String(ar.c).padStart(5)+' 条  ('+sign+delta+')'); }

  console.log('\n📋 等级迁移:'); console.log('   变更总数: '+changed+' / '+rows.length+' ('+(changed/rows.length*100).toFixed(1)+'%)');
  var keys = Object.keys(migration); for (var ki = 0; ki < keys.length; ki++) { var k = keys[ki]; var v = migration[k]; if (v > 0) console.log('   '+k+': '+v+' 条'); }

  console.log('\n📈 钙化分分布:');
  var ranges = [[0, 0.25], [0.25, 0.45], [0.45, 0.65], [0.65, 1.0]];
  for (var rgi = 0; rgi < ranges.length; rgi++) { var lo = ranges[rgi][0], hi = ranges[rgi][1]; var cnt = db.prepare('SELECT COUNT(*) as c FROM memories WHERE calcium_score >= ? AND calcium_score < ?').get(lo, hi).c; var pct = (cnt / rows.length * 100).toFixed(1); var bar = '█'.repeat(Math.round(cnt / rows.length * 50)); console.log('   ['+lo.toFixed(2)+', '+hi.toFixed(2)+'): '+String(cnt).padStart(5)+' ('+pct.padStart(5)+'%) '+bar); }

  var crystals = db.prepare("SELECT id, raw_input, calcium_score, calcium_level FROM memories WHERE calcium_level = 3 ORDER BY calcium_score DESC LIMIT 10").all();
  console.log('\n💎 黑钻候选 (L3): '+crystals.length+' 条');
  for (var ci = 0; ci < crystals.length; ci++) { var c = crystals[ci]; console.log('   score='+c.calcium_score.toFixed(3)+' | '+(c.raw_input || '').substring(0, 80)); }

  db.close(); console.log('\n✅ 重算完成。');
}
main().catch(function(e) { console.error(e); process.exit(1); });
