// SCRIPT-GOV-A2d-Batch-2: 治理门控 (CRITICAL, sync)
var _G={};for(var _i=2;_i<process.argv.length;_i++){var _a=process.argv[_i];if(_a==="--apply")_G.apply=1;else if(_a==="--operator"&&process.argv[_i+1])_G.op=process.argv[++_i];else if(_a==="--reason"&&process.argv[_i+1])_G.reason=process.argv[++_i];else if(_a==="--ticket"&&process.argv[_i+1])_G.ticket=process.argv[++_i];else if(_a==="--confirm"&&process.argv[_i+1])_G.confirm=process.argv[++_i];else if(_a==="--scope"&&process.argv[_i+1])_G.scope=process.argv[++_i];else if(_a==="--report-path"&&process.argv[_i+1])_G.rpt=process.argv[++_i];else if(_a==="--help"){console.log("Usage: node seed-social.cjs [--apply] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]");process.exit(0)}}
var G=_G;
var M=G.apply?"apply":"dry-run",D=!G.apply;
var {validateGate,recordGovernanceDecision}=require("./_governance-gate.cjs");

const path=require('path'),fs=require('fs');
async function main(){
  // ── 预检门控 ──
  if(!D){var C={scriptId:"seed-social",riskLevel:"CRITICAL",operationType:"sync",mode:M,environment:"local",operator:{operatorId:G.op||"",reason:G.reason||"",ticket:G.ticket||null},scope:{selector:G.scope||"table:entity_relations",limit:0,batchSize:0,since:null,until:null},confirmation:{required:true,provided:!!G.confirm,tokenDigest:G.confirm||null},backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},irreversibleConfirmation:!!G.confirm,reportPath:G.rpt||null};var V=validateGate(C);var PE=V.errors.filter(function(e){return["R008","R009","R010","R013"].indexOf(e.rule)===-1});if(PE.length>0){var lines=["\\n======================================================================\\n  SCRIPT EXECUTION CONTRACT DENIED\\n======================================================================\\n  Script:  seed-social.cjs\\n  Risk:    CRITICAL\\n  Mode:    apply\\n  Operation: sync\\n\\n  Issues:"];PE.forEach(function(e){lines.push("    ["+e.rule+"] "+e.message)});lines.push("\n  Refusing to continue.\n======================================================================\n");console.error(lines.join("\n"));recordGovernanceDecision(C,V);recordGovernanceDecision(C,V);process.exit(2)}}
  if(D){console.log("[DRY-RUN] seed-social — 将扫描但不写入。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际写入。\n");process.exit(0)}

  const sql=require('sql.js'),SQL=await sql.default();
  const db=new SQL.Database(fs.readFileSync('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db'));
  const uid=()=>'b_'+Date.now().toString(36)+'_'+Math.random().toString(36).substring(2,6);
  const now=new Date().toISOString();
  const EX=new Set(['我','妹妹','妈妈','老婆','爸爸','姐姐','哥哥','弟弟','公司','学生','小说','开心','时候你','纪实小','计划吗','那你','玉瑶']);
  const persons=[];
  const rows=db.exec("SELECT name FROM nodes WHERE type='person'");
  if(rows[0]) for(const [n] of rows[0].values) if(!EX.has(n)&&n.length>=2) persons.push(n);
  const me=db.exec("SELECT id FROM nodes WHERE name='我'");
  const meId=me[0]?.values?.[0]?.[0];
  if(!meId){console.log('no 我');return}
  let c=0;
  for(const name of persons){
    const nd=db.exec('SELECT id FROM nodes WHERE name=?',[name]);
    if(!nd[0]?.values?.[0]) continue;
    const nid=nd[0].values[0][0];
    const e1=db.exec('SELECT id FROM edges WHERE source_id=? AND target_id=? AND relation=?',[meId,nid,'acquaintance_of']);
    if(!e1[0]?.values?.length){db.run('INSERT INTO edges(id,source_id,target_id,relation,properties,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[uid(),meId,nid,'acquaintance_of','{}',now,now]);c++}
    const e2=db.exec('SELECT id FROM edges WHERE source_id=? AND target_id=? AND relation=?',[nid,meId,'acquaintance_of']);
    if(!e2[0]?.values?.length){db.run('INSERT INTO edges(id,source_id,target_id,relation,properties,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[uid(),nid,meId,'acquaintance_of','{}',now,now]);c++}
  }
  fs.writeFileSync('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db',Buffer.from(db.export()));
  console.log('Social bootstrap: '+c+' edges, '+persons.length+' persons');
  // Verify 徐诗雨
  const xsy=db.exec("SELECT id FROM nodes WHERE name='徐诗雨'");
  if(xsy[0]){const e=db.exec("SELECT n.name,e.relation FROM edges e JOIN nodes n ON e.target_id=n.id WHERE e.source_id=? AND e.relation='acquaintance_of'",[xsy[0].values[0][0]]);console.log('徐诗雨 acquaintance_of edges:',e[0]?.values?.length||0)}
}
main().catch(e=>{console.error(e.message);process.exit(1)});
