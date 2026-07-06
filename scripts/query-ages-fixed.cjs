#!/usr/bin/env node
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();

  // 1. FG 数据库
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  for (const name of ['徐诗雨', '徐诗韵']) {
    const n = db.exec("SELECT properties FROM nodes WHERE name = ? AND type='person'", [name]);
    const p = JSON.parse(n[0].values[0][0]);
    console.log('=== ' + name + ' FG ===');
    console.log('  age=' + (p.age ?? '无'));
    console.log('  dossier.basicInfo.age=' + (p.dossier?.basicInfo?.age ?? '无'));
    const desc = p.description || '';
    const m = desc.match(/\d+岁/);
    console.log('  description中含年龄: ' + (m ? m[0] : '无'));
    const rel = p.relation_to_user || '';
    const rm = rel.match(/\d+岁/);
    console.log('  relation_to_user中含年龄: ' + (rm ? rm[0] : '无'));
    const timeline = p.dossier?.lifeResume?.timeline || [];
    let hasAge = false;
    for (const t of timeline) {
      if (/\d+岁/.test(t.summary || '')) { hasAge = true; break; }
    }
    console.log('  timeline中含年龄: ' + (hasAge ? '有' : '无'));
    console.log('  occupation中含年龄: ' + ((p.occupation||'').match(/\d+岁/)?.[0] || '无'));
    console.log('');
  }
  db.close();

  // 2. 徐诗雨的两个旧知识库文件
  console.log('=== 知识库旧贴文件（含年龄） ===');
  for (const f of fs.readdirSync('data/knowledge-md')) {
    if (f.includes('徐诗雨') && f.endsWith('.md')) {
      const content = fs.readFileSync('data/knowledge-md/' + f, 'utf-8');
      const m = content.match(/\d+岁/);
      console.log('  ' + f + ' -> ' + (m ? '含"' + m[0] + '"' : '无年龄'));
    }
  }

  // 3. 范式文档
  for (const f of ['【FG档案范式】徐诗雨.md', '【FG档案范式】徐诗韵.md']) {
    const content = fs.readFileSync('data/knowledge-md/' + f, 'utf-8');
    const m = content.match(/\d+岁/);
    console.log('  ' + f + ' -> ' + (m ? '含"' + m[0] + '"' : '无年龄'));
  }

  // 4. interaction_logs 徐诗雨年龄相关对话
  const data = JSON.parse(fs.readFileSync('data/dreams/interaction_logs.json', 'utf-8'));
  const ageMentions = [];
  for (const item of data) {
    const q = ((item.original_query || '') + (item.user_clue || '')).toLowerCase();
    if (q.includes('徐诗雨') && q.match(/\d+/)) {
      ageMentions.push({ query: (item.original_query || item.user_clue || '').substring(0, 80), ts: (item.timestamp || '').substring(0, 16) });
    }
  }
  console.log('\n=== 对话中徐诗雨相关含数字的记录 ===');
  for (const a of ageMentions.slice(0, 5)) {
    console.log('  [' + a.ts + '] ' + a.query);
  }
}
main().catch(console.error);
