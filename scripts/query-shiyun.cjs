#!/usr/bin/env node
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  const node = db.exec("SELECT name, aliases, properties FROM nodes WHERE name = '徐诗韵' AND type = 'person'");
  if (!node[0]?.values?.length) { console.log('❌ 未找到'); db.close(); return; }

  const name = node[0].values[0][0];
  const aliases = JSON.parse(node[0].values[0][1] || '[]');
  const p = JSON.parse(node[0].values[0][2] || '{}');

  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║           徐诗韵 完整档案');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  console.log('📛 姓名: ' + name);
  console.log('🏷️  别名: ' + aliases.join(', '));
  console.log('📊 完整度: ' + (p.completeness !== undefined ? (p.completeness*100).toFixed(0)+'%' : '无'));
  console.log('');

  console.log('─── 基础信息 ───');
  if (p.relation_to_user) console.log('  与用户关系: ' + p.relation_to_user);
  if (p.age) console.log('  年龄: ' + p.age + '岁');
  if (p.occupation) console.log('  职业: ' + p.occupation);
  if (p.mention_count) console.log('  提及次数: ' + p.mention_count + '次');

  console.log('\n─── 外貌 ───');
  if (p.appearance) console.log('  ' + p.appearance);
  if (p.body_features) console.log('  身材: ' + p.body_features);
  if (p.style) console.log('  风格: ' + p.style);

  console.log('\n─── 性格 ───');
  if (p.traits?.length) console.log('  标签: ' + p.traits.join('、'));
  if (p.personality) console.log('  描述: ' + p.personality);

  console.log('\n─── 兴趣/习惯 ───');
  if (p.interests?.length) console.log('  兴趣: ' + p.interests.join('、'));
  if (p.habits) console.log('  习惯: ' + p.habits);
  if (p.psychology) console.log('  心理: ' + p.psychology);

  console.log('\n─── 累计描述 ───');
  if (p.description) console.log('  ' + p.description);

  const d = p.dossier;
  if (d) {
    console.log('\n═══════════════════════════════════════════');
    console.log('  结构化档案 (PersonDossier 10模块)');
    console.log('═══════════════════════════════════════════');

    if (d.basicInfo) {
      const b = d.basicInfo;
      const bi = [];
      if (b.gender) bi.push('性别: ' + b.gender);
      if (b.age) bi.push('年龄: ' + b.age);
      if (b.education) bi.push('学历: ' + b.education);
      if (b.maritalStatus) bi.push('婚姻: ' + b.maritalStatus);
      if (bi.length) console.log('\n  ① 基础信息卡\n    ' + bi.join('\n    '));
    }

    if (d.imageTraits) {
      const it = d.imageTraits;
      console.log('\n  ④ 形象特质');
      if (it.looks) console.log('    外貌详述: ' + it.looks);
      if (it.bodyFeatures) console.log('    身材详述: ' + it.bodyFeatures);
      if (it.style) console.log('    风格: ' + it.style);
      if (it.voice) console.log('    声音: ' + it.voice);

      const fd = it.feminineDetails;
      if (fd) {
        console.log('\n    ── 女性详细体征 (feminineDetails 17字段) ──');
        const fdFields = [
          ['firstImpression', '🌸 整体印象'],
          ['stature', '📏 身高体型'],
          ['measurements', '📐 三围数据'],
          ['breasts', '🍈 胸部'],
          ['buttocks', '🍑 臀部'],
          ['waist', '💃 腰腹'],
          ['legs', '🦵 腿部'],
          ['skin', '✨ 皮肤'],
          ['hands', '🤲 手部'],
          ['lips', '👄 唇部'],
          ['eyes', '👀 眼睛'],
          ['hair', '💇 秀发'],
          ['allure', '🔥 魅惑力'],
          ['bodyScent', '🌺 体味/体香'],
          ['touch', '🖐️ 触感'],
          ['intimateReaction', '💕 亲密反应'],
          ['memorableTraits', '💎 特殊记忆点'],
        ];
        for (const [k, label] of fdFields) {
          if (fd[k]) console.log('    ' + label + ': ' + fd[k]);
        }
      }
    }

    if (d.personalityPrefs) {
      console.log('\n  ⑤ 性格偏好');
      const pp = d.personalityPrefs;
      if (pp.traits?.length) console.log('    标签: ' + pp.traits.join(', '));
      if (pp.description) console.log('    描述: ' + pp.description);
      if (pp.interests?.length) console.log('    兴趣: ' + pp.interests.join(', '));
      if (pp.psychology) console.log('    心理: ' + pp.psychology);
    }

    if (d.relationMap) {
      console.log('\n  ⑥ 关系定位');
      const rm = d.relationMap;
      const ix = rm.intersections;
      if (ix) {
        if (ix.metWhen) console.log('    结识: ' + ix.metWhen);
        if (ix.lifeIntersection) console.log('    生活交集: ' + ix.lifeIntersection);
        if (ix.emotionalAssessment) console.log('    情感评价: ' + ix.emotionalAssessment);
        if (ix.sharedEvents?.length) {
          console.log('    共同事件:');
          for (const e of ix.sharedEvents) console.log('      · ' + (e.date||'') + ' ' + (e.event||''));
        }
      }
      if (rm.notes) console.log('    备注: ' + rm.notes);
    }

    if (d.familyNetwork) {
      console.log('\n  ⑦ 家庭关系网');
      const fn = d.familyNetwork;
      if (fn.siblings?.length) console.log('    兄弟姐妹: ' + fn.siblings.join('、'));
      if (fn.extended) console.log('    其他: ' + fn.extended);
    }

    if (d.health) {
      console.log('\n  ⑧ 健康状况');
      if (d.health.condition) console.log('    ' + d.health.condition);
    }

    if (d.lifeMilestones?.length) {
      console.log('\n  ⑨ 人生里程碑');
      for (const m of d.lifeMilestones) {
        console.log('    · [' + m.type + '] ' + (m.date||'') + ' - ' + (m.event||''));
      }
    }
  }

  console.log('\n─── 关联人物 ───');
  const rels = db.exec(`
    SELECT a.name as src, e.relation, b.name as tgt
    FROM edges e JOIN nodes a ON e.source_id = a.id JOIN nodes b ON e.target_id = b.id
    WHERE a.name = '徐诗韵' OR b.name = '徐诗韵'
  `);
  if (rels[0]?.values) {
    for (const r of rels[0].values) console.log('  ' + r[0] + ' --[' + r[1] + ']--> ' + r[2]);
  }

  db.close();
}
main().catch(console.error);
