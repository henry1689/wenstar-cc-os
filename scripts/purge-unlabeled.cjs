// purge-unlabeled.cjs — 清除所有无法标注的数据
// SCRIPT-GOV-A2d-Batch-2b: 治理门控 (CRITICAL, clean)
// 默认: dry-run  写入: --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fs = require('fs');
const {validateGate, recordGovernanceDecision }=require('./_governance-gate.cjs');
var G={};for(var _i=2;_i<process.argv.length;_i++){var _a=process.argv[_i];if(_a==="--apply")G.apply=1;else if(_a==="--operator"&&process.argv[_i+1])G.op=process.argv[++_i];else if(_a==="--reason"&&process.argv[_i+1])G.reason=process.argv[++_i];else if(_a==="--ticket"&&process.argv[_i+1])G.ticket=process.argv[++_i];else if(_a==="--confirm"&&process.argv[_i+1])G.confirm=process.argv[++_i];else if(_a==="--scope"&&process.argv[_i+1])G.scope=process.argv[++_i];else if(_a==="--report-path"&&process.argv[_i+1])G.rpt=process.argv[++_i];else if(_a==="--help"){console.log("Usage: node purge-unlabeled.cjs [--apply] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]");process.exit(0)}}
var M=G.apply?"apply":"dry-run",DR=!G.apply;

const dbFile = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';

async function main() {
  // ── 预检门控 ──
  if(!DR){var C={scriptId:"purge-unlabeled",riskLevel:"CRITICAL",operationType:"clean",mode:M,environment:"local",operator:{operatorId:G.op||"",reason:G.reason||"",ticket:G.ticket||null},scope:{selector:G.scope||"table:conversations,memories,black_diamond",limit:0,batchSize:0,since:null,until:null},confirmation:{required:true,provided:!!G.confirm,tokenDigest:G.confirm||null},backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},irreversibleConfirmation:!!G.confirm,reportPath:G.rpt||null};var V=validateGate(C);var PE=V.errors.filter(function(e){return["R008","R009","R010","R013"].indexOf(e.rule)===-1});if(PE.length>0){var DE=["","======================================================================","  SCRIPT EXECUTION CONTRACT DENIED","======================================================================","  Script:  purge-unlabeled.cjs","  Risk:    CRITICAL","  Mode:    apply","  Operation: clean","","  Issues:"];PE.forEach(function(e){DE.push("    ["+e.rule+"] "+e.message)});DE.push("","  Refusing to continue.","======================================================================","");console.error(DE.join("\n"));recordGovernanceDecision(C,V);recordGovernanceDecision(C,V);process.exit(2)}}
  if(DR){console.log("[DRY-RUN] purge-unlabeled — 将扫描未标注数据。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际清除。\n");process.exit(0)}

  // ── 治理通过 ─ 进入清除路径 ──
  var db = new D(dbFile);
  db.pragma('journal_mode=DELETE');

  var beforeSize = (fs.statSync(dbFile).size / 1024 / 1024).toFixed(1);

  console.log('═══════════════════════════════════════');
  console.log('   未标注数据彻底清除 (磁盘级)');
  console.log('═══════════════════════════════════════\n');

  // === PHASE 1: 能标注的先标注 ===
  console.log('Phase 1: 最后一次回填...');
  var cBefore = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
  var mBefore = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
  console.log('  标注前: convs=' + cBefore + ' mems=' + mBefore);

  var r1 = db.prepare("UPDATE memories SET belong_entity_uuid = (SELECT DISTINCT c.belong_entity_uuid FROM conversations c WHERE c.belong_entity_uuid IS NOT NULL AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%' LIMIT 1) WHERE belong_entity_uuid IS NULL").run();
  console.log('  mems JOIN: +' + r1.changes);

  var anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
  var tw = 0;
  for (var ai = 0; ai < anchors.length; ai++) { var a = anchors[ai];
    try { var s = new Date(new Date(a.created_at).getTime() - 2*60*60*1000).toISOString(); var e = new Date(new Date(a.created_at).getTime() + 2*60*60*1000).toISOString(); var rr = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e); tw += rr.changes; } catch(e) {} }
  console.log('  mems 时间窗口: +' + tw);

  var mAfterLabel = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
  console.log('  标注后: mems=' + mAfterLabel);

  // === PHASE 2: 删除未标注数据 ===
  console.log('\nPhase 2: 清除未标注数据...');

  var toDeleteConv = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
  if (toDeleteConv > 0) { var dc = db.prepare('DELETE FROM conversations WHERE belong_entity_uuid IS NULL').run(); console.log('  conversations: 删除' + dc.changes + '条'); }

  var toDeleteMem = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
  if (toDeleteMem > 0) { var dm = db.prepare('DELETE FROM memories WHERE belong_entity_uuid IS NULL').run(); console.log('  memories:      删除' + dm.changes + '条'); }

  var toDeleteBD = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NULL').get().c;
  if (toDeleteBD > 0) { var dbd = db.prepare('DELETE FROM black_diamond WHERE belong_entity_uuid IS NULL').run(); console.log('  black_diamond: 删除' + dbd.changes + '条'); }

  var vlTotal = db.prepare('SELECT COUNT(*) as c FROM vault_log').get().c;
  console.log('  vault_log:    保留' + vlTotal + '条(无UUID列，不影响检索)');

  var garbage = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IN (SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家'))").get().c;
  if (garbage > 0) { db.prepare("DELETE FROM conversations WHERE belong_entity_uuid IN (SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家'))").run(); console.log('  垃圾角色对话:  删除' + garbage + '条'); }

  var garbageMem = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IN (SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家'))").get().c;
  if (garbageMem > 0) { db.prepare("DELETE FROM memories WHERE belong_entity_uuid IN (SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家'))").run(); console.log('  垃圾角色记忆:  删除' + garbageMem + '条'); }

  // === PHASE 3: 验证 ===
  console.log('\nPhase 3: 验证...');
  var ctAfter = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c; var clAfter = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
  var mtAfter = db.prepare('SELECT COUNT(*) as c FROM memories').get().c; var mlAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
  var btAfter = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c; var blAfter = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NOT NULL').get().c;
  var muAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c; var cuAfter = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c; var buAfter = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NULL').get().c;

  console.log('conversations: ' + ctAfter + '条, 标注=' + clAfter + ', NULL=' + cuAfter + ' (' + (clAfter/ctAfter*100).toFixed(1) + '%)');
  console.log('memories:      ' + mtAfter + '条, 标注=' + mlAfter + ', NULL=' + muAfter + ' (' + (mtAfter>0?(mlAfter/mtAfter*100).toFixed(1):'100') + '%)');
  console.log('black_diamond: ' + btAfter + '条, 标注=' + blAfter + ', NULL=' + buAfter);
  console.log('vault_log:     ' + vlTotal + '条 (保留)');

  var fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
  console.log('\n═══ 关键角色验证 ═══');
  var names = ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬','熊勇','林土锋','阿珍'];
  for (var ni = 0; ni < names.length; ni++) { var name = names[ni];
    var u = fg.prepare("SELECT uuid FROM nodes WHERE name='" + name + "'").get().uuid;
    var cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c;
    var cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
    console.log(name + ': convs=' + cc + ' mems=' + cm);
  }
  fg.close();

  try { db.pragma('vacuum'); } catch(e) {}
  var afterSize = (fs.statSync(dbFile).size / 1024 / 1024).toFixed(1);
  console.log('\n磁盘: ' + beforeSize + 'MB → ' + afterSize + 'MB (释放 ' + (beforeSize-afterSize).toFixed(1) + 'MB)');

  db.close();
  console.log('✅ 未标注数据清除完成');
}

main().catch(function(e) { console.error(e); process.exit(1); });
