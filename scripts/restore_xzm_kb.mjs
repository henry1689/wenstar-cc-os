/**
 * restore_xzm_kb.mjs — 补写熊梓铭纪实研究完整档案
 * ==================================================
 * 之前 CJS 脚本的 INSERT 静默失败导致 content 为空。
 * 用已验证的 ESM + exec() 重新写入。
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

const DB_PATH = 'data/webui/fusion_memory.db';
const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(DB_PATH));

const esc = (s) => String(s || '').replace(/'/g, "''");

// Read chapters from conversations DB
const getContent = (id) => {
  const r = db.exec('SELECT content FROM conversations WHERE id = ' + id);
  if (r.length && r[0].values.length) {
    return String(r[0].values[0][0]).replace(/^\(.*?\n\n---\n\n/s, '---\n\n');
  }
  return '';
};

const prelude = getContent(15319);
const ch3p1   = getContent(15325);
const finger  = getContent(15361);
const ejac    = getContent(15399);
const ch2     = getContent(15328);

// Build complete archive
const lines = [
  "# 熊梓铭的纪实研究小说与学术计划——完整档案（V2修复版）",
  "",
  "> 2026年7月19日，梓铭完成了她人生中最重要的一组写作。本文档收录了她的全部作品。",
  "",
  "---",
  "## 一、第三章：熊梓玥组进入实验",
  "",
  "### 第一节：准备与前戏",
  ch3p1.trimEnd(),
  "",
  "### 第二节：手指进入",
  finger.trim(),
  "",
  "### 第三节：射精采集与宫腔灌注",
  ejac.trim(),
  "",
  "---",
  "## 二、第二章：王全芬组进入实验",
  ch2,
  "",
  "---",
  "## 三、前传：梓玥第一天观察记录",
  prelude,
  "",
  "---",
  "**备注: 以上内容从2026年7月19日对话中逐段恢复。梓铭同时扮演研究者/记录员/女儿/姐姐四重角色。**"
];

const content = lines.join('\n');
const now = new Date().toISOString().replace('T',' ').substring(0,19);
const uuid = 'TXS-000000003';

// Delete old empty entry
db.exec("DELETE FROM knowledge_base WHERE id IN ('kn_xzm_research_complete','kn_xzm_research_stories')");

// Write new entry via exec()
db.exec(`INSERT INTO knowledge_base (id,title,content,source_type,tags,created_at,updated_at,belong_entity_uuid,type,classification_pending) VALUES ('kn_xzm_research_complete','${esc('熊梓铭的纪实研究小说与学术计划(完整版)')}','${esc(content)}','text','${esc('熊梓铭,纪实研究,小说,笔记,学术计划,完整档案')}','${now}','${now}','${uuid}','note',0)`);

// Verify
const check = db.exec("SELECT id, title, length(content) as len FROM knowledge_base WHERE id = 'kn_xzm_research_complete'");
const row = check[0]?.values?.[0];
if (row && row[2] > 0) {
  console.log(`✅ ${row[1]}: ${row[2]} chars`);
} else {
  console.log('❌ 写入失败: content 仍为空');
}

const data = db.export();
writeFileSync(DB_PATH, Buffer.from(data));
db.close();
console.log('Done.');
