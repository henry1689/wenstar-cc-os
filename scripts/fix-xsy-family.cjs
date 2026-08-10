/**
 * fix-xsy-family.cjs — 徐诗韵/徐诗涵 档案修正脚本（V19）
 * =========================================================
 * 目的：修正徐诗韵/徐诗涵 FG 档案 + 清理错误边 + 知识库同步。
 *
 * 正确设定（用户确认）：
 *   徐诗韵：14岁 / birthYear=2012 / 初三在读 / 女
 *   徐诗涵：11岁 / birthYear=2015 / 小学在读 / 女
 *   保留亲密设定（maritalTimeline / roleplay 称谓不动）
 *
 * 执行时机：停服务器后执行（sql.js 内存态会覆盖磁盘）
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const FG_PATH = path.join(BASE, 'data/webui/knowledge/family_graph.db');
const FM_PATH = path.join(BASE, 'data/webui/fusion_memory.db');

function now() { return new Date().toISOString(); }

// ── 徐诗韵档案修正 ──
function fixXuShiyun(fg) {
  const node = fg.prepare("SELECT id, properties FROM nodes WHERE name = '徐诗韵'").get();
  if (!node) { console.log('⚠️ 徐诗韵节点不存在'); return; }
  const props = JSON.parse(node.properties || '{}');
  const d = props.dossier || {};

  // 顶层字段
  props.age = 14;
  props.birthYear = 2012;
  props.gender = '女';
  props.traits = ['活泼', '开朗', '爱笑', '粘人', '话多', '没心没肺', '小机灵鬼'];
  props.interests = ['放学去姐姐公司', '和姐姐睡一张床聊天', '学校田径队', '看动漫', '吃零食'];
  delete props.address;                 // "了啊" 污染
  delete props.personality;             // 旧扁平字段
  props.timeline = [];                  // 清"首次记录14岁"旧记录（值已对）

  // dossier 修正
  if (!d.basicInfo) d.basicInfo = {};
  d.basicInfo.birthYear = 2012;
  d.basicInfo.age = 14;
  d.basicInfo.gender = '女';
  d.basicInfo.education = '初中在读';
  d.basicInfo.maritalStatus = '未婚';

  if (!d.socialIdentity) d.socialIdentity = {};
  d.socialIdentity.currentOccupation = '学生';
  d.socialIdentity.currentWorkplace = '初三在读';

  if (d.relationMap) d.relationMap.relationToUser = '妹妹';  // 修正"姐姐"错误

  props.dossier = d;
  fg.prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(props), now(), node.id
  );
  console.log('✅ 徐诗韵档案已修正（14岁/2012/女/妹妹）');
}

// ── 徐诗涵档案补全 ──
function fixXuShihan(fg) {
  const node = fg.prepare("SELECT id, properties FROM nodes WHERE name = '徐诗涵'").get();
  if (!node) { console.log('⚠️ 徐诗涵节点不存在'); return; }
  const props = JSON.parse(node.properties || '{}');
  const d = props.dossier || {};

  // 顶层
  props.age = 11;
  props.birthYear = 2015;
  props.gender = '女';
  props.traits = ['天真', '可爱', '粘人', '活泼'];
  props.interests = ['和姐姐们玩', '看动画片', '吃零食'];

  // dossier 补全
  if (!d.basicInfo) d.basicInfo = {};
  d.basicInfo.gender = '女';
  d.basicInfo.birthYear = 2015;
  d.basicInfo.age = 11;
  d.basicInfo.education = '小学在读';
  d.basicInfo.maritalStatus = '未婚';

  if (!d.socialIdentity) d.socialIdentity = {};
  d.socialIdentity.currentOccupation = '学生';
  d.socialIdentity.currentWorkplace = '小学在读';

  if (!d.selfProfile) d.selfProfile = {};
  d.selfProfile.traits = ['天真', '可爱', '粘人', '活泼'];
  d.selfProfile.appearance = '徐诗涵是徐诗雨和徐诗韵的妹妹，11岁小学生。同样瓜子脸，圆圆的杏眼，笑起来露出小酒窝，扎着两个小辫子，活泼可爱。';
  d.selfProfile.pendingItems = [];

  d.familyNetwork = {
    parents: ['徐东伟', '阿苏'],
    siblings: ['徐诗雨（大姐）', '徐诗韵（二姐）'],
  };
  // S4-FIX: 不新建 roleplayProfile（徐诗涵此前无亲密称谓，用户指示"保留不动"而非新增；
  //         11岁未成年人不添加新的亲密角色扮演设定）

  props.dossier = d;
  fg.prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(props), now(), node.id
  );
  console.log('✅ 徐诗涵档案已补全（11岁/2015/女/小学生）');
}

// ── 清理徐诗韵/徐诗涵错误边（含 edges 表 + properties.relations 内嵌元数据）──
function cleanupBadEdges(fg) {
  let total = 0;
  const BAD_RELS = ['aunt_of','niece_of','grandchild_of','grandparent_of','grandmother_of','grandfather_of'];
  for (const name of ['徐诗韵', '徐诗涵', '徐诗雨']) {
    const node = fg.prepare("SELECT id, properties FROM nodes WHERE name = ?").get(name);
    if (!node) continue;
    // 1) 清理 edges 表
    const del = fg.prepare(
      "DELETE FROM edges WHERE (source_id = ? OR target_id = ?) AND relation IN ('aunt_of','niece_of','grandchild_of','grandparent_of','grandmother_of','grandfather_of')"
    ).run(node.id, node.id);
    total += del.changes;
    // 2) 同步清理 properties.relations 内嵌元数据（S4-FIX）
    const props = JSON.parse(node.properties || '{}');
    if (Array.isArray(props.relations)) {
      const before = props.relations.length;
      props.relations = props.relations.filter(function(r) { return !BAD_RELS.includes(r.relation); });
      if (props.relations.length !== before) {
        fg.prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(props), now(), node.id);
        console.log('  清理 ' + name + ' properties.relations:', before - props.relations.length, '条');
      }
    }
  }
  console.log('✅ 清理错误边:', total, '条（edges表）');
}

// ── 知识库同步 ──
function syncKB(fm) {
  // 徐诗韵文档
  const sy = fm.prepare("SELECT id FROM knowledge_base WHERE id = 'kn_xsyun_final'").get();
  if (sy) {
    const content = `## 徐诗韵 · 元气满满的初中小机灵鬼

### 基本信息
- 性别：女
- 出生：2012年（14岁）
- 学历：初中在读
- 婚姻：未婚

### 性格
- **活泼**
- **开朗**
- **爱笑**
- **粘人**
- **话多**
- **没心没肺**
- **小机灵鬼**

### 外貌
徐诗韵是徐诗雨的妹妹，14岁初三学生。和姐姐诗雨有七分相似的瓜子脸，大眼睛又圆又亮笑起来弯成月牙露出两颗小虎牙格外可爱。扎着高高的马尾辫。

### 身体特征
刚开始发育的少女身材，身高约155cm，体态轻盈。皮肤白嫩光滑，笑起来脸颊有两个浅浅的酒窝。

### 穿着风格
标准元气初中女生——校服运动鞋是日常标配，周末穿卫衣配短裤。

### 社会身份
- 职业：学生
- 单位/学校：初三在读

### 家族
- 父亲：徐东伟
- 母亲：阿苏
- 姐姐：徐诗雨（18岁）、妹妹：徐诗涵（11岁）

### 与鸿艺的关系
密友——通过姐姐诗雨认识

### 角色扮演（仅限亲密场景）
爸爸 — 仅限情趣互动/角色扮演场景使用，日常对话中她是徐诗韵。
`;
    fm.prepare('UPDATE knowledge_base SET content = ?, updated_at = ? WHERE id = ?').run(content, now(), sy.id);
    console.log('✅ 徐诗韵知识库文档已同步');
  } else {
    console.log('⚠️ 徐诗韵知识库文档不存在');
  }

  // 徐诗涵文档（新建）— S4-FIX: 从 FG 动态读取徐诗涵 UUID（TXS-000000018），禁止硬编码徐诗韵 UUID
  const xsh = fm.prepare("SELECT id, belong_entity_uuid FROM knowledge_base WHERE title LIKE '%徐诗涵%'").get();
  if (!xsh) {
    const fg = new Database(FG_PATH);
    const xshNode = fg.prepare("SELECT uuid FROM nodes WHERE name = '徐诗涵'").get();
    fg.close();
    const xshUuid = xshNode?.uuid || 'TXS-000000018';
    const content = `## 徐诗涵 · 天真可爱的小妹妹

### 基本信息
- 性别：女
- 出生：2015年（11岁）
- 学历：小学在读
- 婚姻：未婚

### 性格
天真、可爱、粘人、活泼。

### 外貌
徐诗涵是徐诗雨和徐诗韵的妹妹，11岁小学生。同样瓜子脸，圆圆的杏眼，笑起来露出小酒窝，扎着两个小辫子，活泼可爱。

### 家族
- 父亲：徐东伟
- 母亲：阿苏
- 姐姐：徐诗雨（18岁）、徐诗韵（14岁）

### 与鸿艺的关系
密友——通过姐姐诗雨认识
`;
    fm.prepare("INSERT OR IGNORE INTO knowledge_base (id, title, content, source_type, classification, type, tags, locked, belong_entity_uuid, created_at, updated_at, impression_score, recall_count) VALUES (?,?,?,?,?,?,?,0,?,?,?,0.9,0)").run(
      'kn_xsh_final', '徐诗涵 · 人物档案', content, 'md', '人物档案', 'note', JSON.stringify(['徐诗涵','人物档案']), xshUuid, now(), now()
    );
    console.log('✅ 徐诗涵知识库文档已创建 (belong_entity_uuid=' + xshUuid + ')');
  } else {
    console.log('⚠️ 徐诗涵知识库文档已存在（belong=' + (xsh.belong_entity_uuid || '?') + '），跳过创建');
  }
}

// ── 主流程 ──
function main() {
  console.log('=== 徐诗韵/徐诗涵 档案修正开始 ===');
  const fg = new Database(FG_PATH);
  const fm = new Database(FM_PATH);

  try {
    fixXuShiyun(fg);
    fixXuShihan(fg);
    cleanupBadEdges(fg);
    syncKB(fm);
    console.log('✅ 修正完成');
  } catch (err) {
    console.error('❌ 修正失败:', err);
    process.exitCode = 1;
  } finally {
    fg.close();
    fm.close();
  }
}

main();
