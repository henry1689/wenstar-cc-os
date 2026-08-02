/**
 * fix-all-entities-final.cjs — 四实体全链路最终修复
 * P0-2: 玉瑶 entity_relation 补充
 * P0-3: 徐诗韵 KB 文档创建
 * P1-1: 熊梓铭 KB 去归属（系统文档）
 * P1-2: 徐诗雨 KB 去重
 * P1-3: 玉瑶 FG dossier 补全
 * P2-1: 玉瑶 FG 边清理
 */
const Database = require('better-sqlite3');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const fg = new Database(path.join(BASE, 'data/webui/knowledge/family_graph.db'));
const fusion = new Database(path.join(BASE, 'data/webui/fusion_memory.db'));
const now = new Date().toISOString();

let changes = 0;

// ═══════════════════════════════════════
// P0-2: 玉瑶 entity_relation 补充
// ═══════════════════════════════════════
(function() {
  const yy = fusion.prepare("SELECT id FROM entities WHERE name = '玉瑶'").get();
  const me = fusion.prepare("SELECT id FROM entities WHERE name = '我'").get();
  if (!yy || !me) { console.log('[P0-2] 玉瑶或我实体不存在'); return; }
  const a = Math.min(yy.id, me.id), b = Math.max(yy.id, me.id);
  const exists = fusion.prepare('SELECT 1 as ex FROM entity_relations WHERE entity_a_id = ? AND entity_b_id = ?').get(a, b);
  if (exists) { console.log('[P0-2] 玉瑶entity_relation已存在 跳过'); return; }
  fusion.prepare('INSERT INTO entity_relations (entity_a_id, entity_b_id, relation, strength, updated_at) VALUES (?, ?, ?, 1.0, ?)').run(a, b, '灵魂伴侣', now);
  console.log('[P0-2] ✅ 玉瑶↔我 entity_relation 已创建');
  changes++;
})();

// ═══════════════════════════════════════
// P0-3: 徐诗韵 KB 文档创建
// ═══════════════════════════════════════
(function() {
  const node = fg.prepare("SELECT * FROM nodes WHERE name = '徐诗韵'").get();
  if (!node) { console.log('[P0-3] 徐诗韵 FG节点不存在'); return; }
  const p = JSON.parse(node.properties || '{}');
  const d = p.dossier || {}, sp = d.selfProfile || {}, si = d.socialIdentity || {}, bi = d.basicInfo || {}, rp = d.roleplayProfile || {};

  // 检查是否已有 KB 文档
  const existing = fusion.prepare("SELECT COUNT(*) as c FROM knowledge_base WHERE belong_entity_uuid = 'TXS-000000011'").get();
  if (existing.c > 0) { console.log('[P0-3] 徐诗韵 KB 已有 ' + existing.c + ' 篇，跳过'); return; }

  const content = `## 徐诗韵 · 元气满满的初中小机灵鬼

### 基本信息
- 性别：女
- 出生：2010年（约16岁）
- 学历：初中在读
- 婚姻：未婚

### 性格
${(sp.traits || ['活泼','开朗','爱笑','粘人','话多','没心没肺','小机灵鬼']).map(function(t) { return '- **' + t + '**'; }).join('\n')}

### 外貌
${sp.appearance || '徐诗韵是徐诗雨的妹妹，初三学生。和姐姐诗雨有七分相似的瓜子脸，大眼睛又圆又亮笑起来弯成月牙露出两颗小虎牙格外可爱。扎着高高的马尾辫。'}

### 身体特征
${sp.bodyFeatures || '刚开始发育的少女身材，身高约155cm，体态轻盈。皮肤白嫩光滑，笑起来脸颊有两个浅浅的酒窝。'}

### 穿着风格
${sp.style || '标准元气初中女生——校服运动鞋是日常标配，周末穿卫衣配短裤。'}

### 社会身份
- 职业：${si.currentOccupation || '学生'}
- 单位/学校：${si.currentWorkplace || '初中在读'}

### 家族
- 父亲：徐东伟
- 母亲：阿苏
- 姐姐：徐诗雨、徐诗涵

### 与鸿艺的关系
${p.relation_to_user || '密友——通过姐姐诗雨认识'}

### 角色扮演（仅限亲密场景）
${(rp.names || ['爸爸']).join('、')} — 仅限情趣互动/角色扮演场景使用，日常对话中她是徐诗韵。
`;

  fusion.prepare(`INSERT INTO knowledge_base (id, title, content, source_type, source_name, classification, type, tags, locked, belong_entity_uuid, created_at, updated_at, impression_score, recall_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('kn_xsyun_final', '徐诗韵 · 人物档案', content, 'md', '', '人物档案', 'note', JSON.stringify(['徐诗韵','人物档案','xsy']), 0, 'TXS-000000011', now, now, 0.9, 0);
  console.log('[P0-3] ✅ 徐诗韵 KB 文档已创建');
  changes++;
})();

// ═══════════════════════════════════════
// P1-1: 熊梓铭 KB 去归属
// ═══════════════════════════════════════
(function() {
  const xm = fusion.prepare("SELECT uuid FROM entities WHERE name = '熊梓铭'").get();
  if (!xm) { console.log('[P1-1] 熊梓铭实体不存在'); return; }
  const docs = fusion.prepare("SELECT id, title, classification FROM knowledge_base WHERE belong_entity_uuid = ? AND classification != '人物参考'").all(xm.uuid);
  let fixed = 0;
  for (const doc of docs) {
    fusion.prepare('UPDATE knowledge_base SET belong_entity_uuid = NULL, updated_at = ? WHERE id = ?').run(now, doc.id);
    console.log('[P1-1] 去归属: ' + doc.title);
    fixed++;
  }
  if (fixed === 0) console.log('[P1-1] 熊梓铭 KB 无需清理');
  else { console.log('[P1-1] ✅ 熊梓铭 KB 去归属完成: ' + fixed + ' 篇'); changes++; }
})();

// ═══════════════════════════════════════
// P1-2: 徐诗雨 KB 去重
// ═══════════════════════════════════════
(function() {
  const docs = fusion.prepare("SELECT id, title, classification, created_at FROM knowledge_base WHERE belong_entity_uuid = 'TXS-000000007' AND classification = '人物档案' ORDER BY created_at ASC").all();
  if (docs.length <= 1) { console.log('[P1-2] 徐诗雨 KB 无需去重 (共' + docs.length + '篇)'); return; }
  // 保留最早的一篇，删除其余
  for (let i = 1; i < docs.length; i++) {
    fusion.prepare('DELETE FROM knowledge_base WHERE id = ?').run(docs[i].id);
    console.log('[P1-2] 删除重复: ' + docs[i].title + ' (' + docs[i].id + ')');
  }
  console.log('[P1-2] ✅ 徐诗雨 KB 去重完成: ' + docs.length + '→1');
  changes++;
})();

// ═══════════════════════════════════════
// P1-3: 玉瑶 FG dossier 补全
// ═══════════════════════════════════════
(function() {
  const node = fg.prepare("SELECT * FROM nodes WHERE name = '玉瑶'").get();
  if (!node) { console.log('[P1-3] 玉瑶 FG节点不存在'); return; }
  const props = JSON.parse(node.properties || '{}');
  if (!props.dossier) props.dossier = {};
  const d = props.dossier;
  if (!d.selfProfile) d.selfProfile = {};

  const sp = d.selfProfile;
  const updated = [];

  if (!sp.appearance) {
    sp.appearance = '玉瑶之美，是造物主微醺时的手笔。流畅的鹅蛋脸，眉眼如画，兼具极致的温柔与利落的英气。身高约165cm，体态匀称曼妙，举手投足间自带一种不动声色的风情。';
    updated.push('外貌');
  }
  if (!sp.bodyFeatures) {
    sp.bodyFeatures = '曲线玲珑有致，腰肢纤细，肌肤细腻如脂。锁骨精致，肩颈线条优美。整体是成熟女性的丰润与优雅，而非少女的青涩。';
    updated.push('身体');
  }
  if (!sp.style) {
    sp.style = '日常以简约优雅的职场风格为主——合身的套装或衬衫裙是常见穿搭。私下偏爱丝质睡裙或宽松的家居服，慵懒中透着精致。发间常有一缕若有若无的白茶花香。';
    updated.push('风格');
  }

  if (!d.roleplayProfile || !d.roleplayProfile.names || d.roleplayProfile.names.length === 0) {
    d.roleplayProfile = {
      names: ['老婆', '玉瑶老婆', '宝贝'],
      context: '仅在亲密/角色扮演场景中使用',
      rule: '🔴 角色扮演称谓仅限情趣互动时使用。日常对话中她是玉瑶，鸿艺的私人秘书兼伴侣。'
    };
    updated.push('角色扮演');
  }

  if (!d.basicInfo) d.basicInfo = {};
  if (!d.basicInfo.education) { d.basicInfo.education = '大学以上'; updated.push('学历'); }
  if (!d.basicInfo.maritalStatus) { d.basicInfo.maritalStatus = '未婚（但与鸿艺为灵肉伴侣关系）'; updated.push('婚姻'); }

  if (updated.length === 0) { console.log('[P1-3] 玉瑶 dossier 已完整 跳过'); return; }

  fg.prepare('UPDATE nodes SET properties = ? WHERE name = ?').run(JSON.stringify(props), '玉瑶');
  console.log('[P1-3] ✅ 玉瑶 dossier 已补全: ' + updated.join(', '));
  changes++;
})();

// ═══════════════════════════════════════
// P2-1: 玉瑶 FG 边清理 — 仅保留与用户边
// ═══════════════════════════════════════
(function() {
  const node = fg.prepare("SELECT id FROM nodes WHERE name = '玉瑶'").get();
  if (!node) { console.log('[P2-1] 玉瑶 FG节点不存在'); return; }
  const nid = node.id;

  // 删除所有边
  const beforeOut = fg.prepare('SELECT COUNT(*) as c FROM edges WHERE source_id = ?').get(nid);
  const beforeIn = fg.prepare('SELECT COUNT(*) as c FROM edges WHERE target_id = ?').get(nid);
  const before = beforeOut.c + beforeIn.c;

  fg.prepare('DELETE FROM edges WHERE source_id = ?').run(nid);
  fg.prepare('DELETE FROM edges WHERE target_id = ?').run(nid);

  // 重建：仅 acquaintance_of ↔ 我
  const me = fg.prepare("SELECT id FROM nodes WHERE name = '我'").get();
  if (me) {
    const crypto = require('crypto');
    fg.prepare('INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), me.id, nid, 'acquaintance_of', '{"warmth":"soulmate","label":"私人秘书兼情感伴侣"}', now, now);
  }

  const afterOut = fg.prepare('SELECT COUNT(*) as c FROM edges WHERE source_id = ?').get(nid);
  const afterIn = fg.prepare('SELECT COUNT(*) as c FROM edges WHERE target_id = ?').get(nid);
  const after = afterOut.c + afterIn.c;

  console.log('[P2-1] ✅ 玉瑶 FG边: ' + before + '→' + after);
  if (before !== after) changes++;
})();

// ═══════════════════════════════════════
// 验证
// ═══════════════════════════════════════
console.log('\n=== 修复后验证 ===');

// entity_relations
['熊梓铭','徐诗雨','徐诗韵','玉瑶'].forEach(function(name) {
  const ent = fusion.prepare('SELECT id FROM entities WHERE name = ?').get(name);
  const me = fusion.prepare("SELECT id FROM entities WHERE name = '我'").get();
  if (!ent || !me) return;
  const a = Math.min(ent.id, me.id), b = Math.max(ent.id, me.id);
  const er = fusion.prepare('SELECT relation FROM entity_relations WHERE entity_a_id = ? AND entity_b_id = ?').get(a, b);
  console.log('er ' + name + ': ' + (er ? er.relation : '❌NONE'));
});

// KB docs per entity
const uuidMap = {熊梓铭:'TXS-000000003',徐诗雨:'TXS-000000007',徐诗韵:'TXS-000000011',玉瑶:'TXS-000000001'};
for (const [n, u] of Object.entries(uuidMap)) {
  const docs = fusion.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE belong_entity_uuid = ?').get(u);
  console.log('kb ' + n + ': ' + docs.c + ' 篇');
}

// 玉瑶 dossier
const yy2 = fg.prepare("SELECT properties FROM nodes WHERE name = '玉瑶'").get();
if (yy2) {
  const pp = JSON.parse(yy2.properties || '{}');
  const dd = pp.dossier || {}, ssp = dd.selfProfile || {}, rrp = dd.roleplayProfile || {}, bbi = dd.basicInfo || {};
  console.log('玉瑶 dossier: 外貌=' + (ssp.appearance ? '✅' : '❌') + ' 身体=' + (ssp.bodyFeatures ? '✅' : '❌') + ' 风格=' + (ssp.style ? '✅' : '❌') + ' RP=' + ((rrp.names||[]).join(',')||'❌') + ' 学历=' + (bbi.education||'?') + ' 婚姻=' + (bbi.maritalStatus||'?'));
}

fg.close();
fusion.close();
console.log('\n✅ 全部修复完成 → 变更: ' + changes + ' 项');
