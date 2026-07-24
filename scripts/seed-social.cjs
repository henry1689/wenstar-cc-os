const path=require('path'),fs=require('fs');
async function main(){
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
