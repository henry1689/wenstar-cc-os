/**
 * fix-xsy-kb.cjs — 徐诗雨知识库清理
 * - 修复错误归属的 6 篇文档
 * - 更新 2 篇旧描述文档
 */
const Database = require('better-sqlite3');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const fusion = new Database(path.join(BASE, 'data/webui/fusion_memory.db'));

const XSY_UUID = 'TXS-000000007';

// ── 1. 错误归属文档 — 清空 UUID ──
const WRONG_DOCS = [
  '吴波的自述：',
  '吴波的大学时光',
  '恋梦园人员详细居住信息表',
  '秦可卿',
  '大学时光',
  '大学时光.吴波',
];

let fixed = 0;
for (const title of WRONG_DOCS) {
  const row = fusion.prepare("SELECT id, belong_entity_uuid FROM knowledge_base WHERE title = ? AND belong_entity_uuid = ?").get(title, XSY_UUID);
  if (row) {
    fusion.prepare("UPDATE knowledge_base SET belong_entity_uuid = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    console.log('  去归属: ' + title);
    fixed++;
  }
}

// ── 2. 更新徐诗雨描述文档 ──
const NEW_CONTENT = `## 徐诗雨 · 清纯温柔的邻家姐姐

### 基本信息
- 性别：女
- 出生：2002年（24岁）
- 学历：高中
- 婚姻：已婚
- 职业：高峰电业营业部跟单员

### 性格
温柔、令人怜爱、清纯、讨人喜欢、细心。文静内向，说话轻声细语，做事认真但不太会表达自己。

### 外貌
气质清纯温柔。身高160cm，身材纤细苗条，一头乌黑长发自然垂落。五官精致但不张扬，属于越看越好看的耐看型。笑起来眼睛弯弯的，让人看了心里就暖。

### 穿着风格
通勤时简约端庄——白衬衫配深色半身裙是标配。私下在家穿棉麻居家服。喜欢栀子花香。

### 家族
- 父亲：徐东伟
- 母亲：阿苏
- 妹妹：徐诗韵（15岁初三学生）、徐诗涵

### 与鸿艺的关系
鸿艺的熟人——亲密关系（热力追踪已确认）
`;

const XSY_DOCS = fusion.prepare("SELECT id, title, classification FROM knowledge_base WHERE belong_entity_uuid = ? AND title LIKE '%徐诗雨%'").all(XSY_UUID);
let updated = 0;
for (const doc of XSY_DOCS) {
  if (doc.classification === '人物档案') { console.log('  跳过（已更新）: ' + doc.title); continue; }
  fusion.prepare("UPDATE knowledge_base SET content = ?, title = '徐诗雨 · 人物档案', classification = '人物档案', updated_at = ? WHERE id = ?")
    .run(NEW_CONTENT, new Date().toISOString(), doc.id);
  console.log('  更新: ' + doc.title + ' → 人物档案');
  updated++;
}

// ── 3. 验证 ──
const after = fusion.prepare("SELECT id, title, classification, belong_entity_uuid FROM knowledge_base WHERE belong_entity_uuid = ?").all(XSY_UUID);
console.log('\n=== 徐诗雨 UUID 知识库文档（修复后） ===');
after.forEach(d => console.log('  [' + (d.classification||'?') + '] ' + d.title));

const nullDocs = fusion.prepare("SELECT COUNT(*) as c FROM knowledge_base WHERE belong_entity_uuid IS NULL").get();
console.log('\n无归属文档: ' + nullDocs.c + ' 篇');
console.log('✅ KB清理完成: 去归属' + fixed + ' 更新' + updated);

fusion.close();
