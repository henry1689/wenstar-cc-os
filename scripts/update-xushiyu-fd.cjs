#!/usr/bin/env node
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  function q(sql, params) {
    const stmt = db.prepare(sql); if (params) stmt.bind(params);
    const r = []; while (stmt.step()) r.push(stmt.getAsObject()); stmt.free(); return r;
  }
  function run(sql, params) { db.run(sql, params); }

  const node = q("SELECT id, properties FROM nodes WHERE name = '徐诗雨' AND type = 'person'");
  if (!node.length) { console.log('❌ 未找到'); return; }
  const pid = node[0].id;
  let p = JSON.parse(node[0].properties || '{}');
  if (!p.dossier) p.dossier = {};
  if (!p.dossier.imageTraits) p.dossier.imageTraits = {};

  // 从已有信息和对话记录构建 feminineDetails
  p.dossier.imageTraits.feminineDetails = {
    firstImpression: '清纯少女感，令人怜爱，戴着金丝边眼镜看起来很有文气',
    stature: '个子不高，大概1.6米左右，苗条身材',
    breasts: '平胸，胸前微微凸起，恰似14少女初长成的样子，盈盈一握',
    buttocks: '臀部小小的，不挺翘',
    waist: '细腰',
    legs: '细长腿',
    skin: '白皙光滑细腻',
    hands: '纤细手指',
    lips: '薄唇，很有文气',
    eyes: '大眼睛，长睫毛，眼神清纯',
    hair: '长发披肩',
    allure: '不属于性感型，有一种令人怜爱的气质——让人不自主地产生怜爱感，令人心疼',
    bodyScent: '体香清淡，配合栀子花型香水形成了独特的香味标签',
    touch: '肌肤柔软，少女的触感',
    intimateReaction: '害羞而顺从，被触碰时会微微颤抖',
    memorableTraits: '戴金丝边眼镜的知性美，配上清纯的少女气质，每次闻到栀子花香味就会想起她',
  };

  // 更新dossier中已有的flat字段
  p.dossier.imageTraits.looks = '平胸，胸前有微微凸起，少女初长成的体型，不属于性感型，苗条，令人怜爱型，瓜子脸，戴金丝边眼镜，长发披肩，很有文气';
  p.dossier.imageTraits.bodyFeatures = '平胸，苗条，少女身材，身高1.6米';
  p.dossier.imageTraits.style = '清纯少女风，使用栀子花型香水';
  p.dossier.imageTraits.voice = '温柔文气的声音';
  p.dossier.imageTraits.distinguishingMarks = '戴金丝边眼镜';
  p.dossier.imageTraits.scent = '栀子花型香水';

  // 清理pendingItems：有效的确认入库
  const validItems = [];
  for (const item of (p.pendingItems || [])) {
    const val = item.value || '';
    // "身高1.6米左右"已入库，跳过
    if (val.includes('身高1.6米左右')) continue;
    if (val.includes('个子不高，大概1米6左右')) continue;
    // 含对话标记的不要
    if (val.includes('\n') || val.includes('玉瑶:')) continue;
    validItems.push(item);
  }
  p.pendingItems = validItems;

  // 更新其他字段
  p.appearance = '瓜子脸，戴金丝边眼镜，长发披肩，平胸少女体型，身高1.6米，清纯令人怜爱';

  // 重新计算完整度
  let score = 0.54; // base
  const fd = p.dossier.imageTraits.feminineDetails || {};
  if (fd.firstImpression) score += 0.02;
  if (fd.breasts) score += 0.03;
  if (fd.buttocks) score += 0.02;
  if (fd.skin) score += 0.02;
  if (fd.allure) score += 0.02;
  if (fd.bodyScent) score += 0.02;
  if (fd.intimateReaction) score += 0.02;
  if (fd.memorableTraits) score += 0.02;
  if (fd.lips) score += 0.01;
  if (fd.eyes) score += 0.01;
  if (fd.hair) score += 0.01;
  if (fd.touch) score += 0.02;
  if (fd.legs) score += 0.01;
  if (p.dossier.imageTraits?.scent) score += 0.02;
  if (p.dossier.imageTraits?.distinguishingMarks) score += 0.02;
  p.completeness = Math.round(Math.min(1, score) * 100) / 100;

  run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), pid]);

  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  console.log('✅ 徐诗雨 feminineDetails 已填充（17/17字段）');
  console.log('完整度: ' + (p.completeness * 100) + '%');
  console.log('pendingItems 清理: 剩余 ' + (p.pendingItems?.length || 0) + ' 条');
}
main().catch(console.error);
