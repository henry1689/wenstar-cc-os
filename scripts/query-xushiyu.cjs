#!/usr/bin/env node
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  const node = db.exec("SELECT name, aliases, properties FROM nodes WHERE name = '徐诗雨' AND type = 'person'");
  if (!node[0]?.values?.length) { console.log('未找到'); db.close(); return; }

  const name = node[0].values[0][0];
  const aliases = node[0].values[0][1];
  const props = JSON.parse(node[0].values[0][2] || '{}');

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          徐诗雨 完整档案');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('📛 姓名: ' + name);
  try { const a = JSON.parse(aliases); if (a.length) console.log('  别名: ' + a.join(', ')); } catch {}

  console.log('\n─── 基础信息 ───');
  if (props.relation_to_user) console.log('  与用户关系: ' + props.relation_to_user);
  if (props.occupation) console.log('  职业: ' + props.occupation);
  if (props.mention_count) console.log('  提及次数: ' + props.mention_count);
  if (props.last_mentioned) console.log('  最近提及: ' + props.last_mentioned);
  if (props.completeness !== undefined) console.log('  画像完整度: ' + (props.completeness * 100).toFixed(0) + '%');
  if (props.first_mentioned) console.log('  首次提及: ' + props.first_mentioned);

  console.log('\n─── 外貌 ───');
  if (props.appearance) console.log('  ' + props.appearance);
  if (props.body_features) console.log('  身材: ' + props.body_features);
  if (props.style) console.log('  风格: ' + props.style);
  if (props.voice) console.log('  声音: ' + props.voice);

  console.log('\n─── 性格 ───');
  if (props.traits?.length) console.log('  标签: ' + props.traits.join('、'));
  if (props.personality) console.log('  描述: ' + props.personality);

  console.log('\n─── 兴趣/习惯 ───');
  if (props.interests?.length) console.log('  - ' + props.interests.join('\n  - '));
  if (props.habits) console.log('  习惯: ' + props.habits);

  console.log('\n─── 累计描述(分段) ───');
  if (props.description) {
    const descs = props.description.split(/[。\n]/).filter(Boolean);
    for (const d of descs) console.log('  · ' + d.trim());
  }

  // Dossier
  const d = props.dossier;
  if (d) {
    console.log('\n═══════════════════════════════════════════');
    console.log('  结构化档案 (PersonDossier 10模块)');
    console.log('═══════════════════════════════════════════');

    /* ① */
    const { basicInfo } = d;
    if (basicInfo) {
      const infos = [];
      if (basicInfo.gender) infos.push('性别: ' + basicInfo.gender);
      if (basicInfo.birthYear) infos.push('出生: ' + basicInfo.birthYear);
      if (basicInfo.birthPlace) infos.push('籍贯: ' + basicInfo.birthPlace);
      if (basicInfo.education) infos.push('学历/职业: ' + basicInfo.education);
      if (basicInfo.maritalStatus) infos.push('婚姻: ' + basicInfo.maritalStatus);
      if (infos.length) console.log('\n  ① 基础信息卡\n    ' + infos.join('\n    '));
    }

    /* ② */
    const { contact } = d;
    if (contact) {
      const infos = [];
      if (contact.phone) infos.push('电话: ' + contact.phone);
      if (contact.wechat) infos.push('微信: ' + contact.wechat);
      if (contact.address) infos.push('地址: ' + contact.address);
      if (contact.email) infos.push('邮箱: ' + contact.email);
      if (contact.workplace) infos.push('工作地: ' + contact.workplace);
      if (infos.length) console.log('\n  ② 联系方式\n    ' + infos.join('\n    '));
    }

    /* ③ */
    const { lifeResume } = d;
    if (lifeResume) {
      console.log('\n  ③ 人生履历');
      if (lifeResume.careerHistory) console.log('    职业生涯: ' + lifeResume.careerHistory);
      if (lifeResume.notableEvents?.length) console.log('    大事记: ' + lifeResume.notableEvents.join(', '));
      if (lifeResume.timeline?.length) {
        for (const t of lifeResume.timeline) {
          console.log('    · ' + t.date + ' - ' + t.summary + (t.emotion ? ' [' + t.emotion + ']' : ''));
        }
      }
    }

    /* ④ */
    const { imageTraits } = d;
    if (imageTraits) {
      console.log('\n  ④ 形象特质');
      if (imageTraits.looks) console.log('    外貌: ' + imageTraits.looks);
      if (imageTraits.bodyFeatures) console.log('    身材: ' + imageTraits.bodyFeatures);
      if (imageTraits.style) console.log('    风格: ' + imageTraits.style);
      if (imageTraits.voice) console.log('    声音: ' + imageTraits.voice);
      if (imageTraits.distinguishingMarks) console.log('    辨识特征: ' + imageTraits.distinguishingMarks);
      if (imageTraits.scent) console.log('    香水/气味: ' + imageTraits.scent);
      const fd = imageTraits.feminineDetails;
      if (fd) {
        console.log('    ── 女性详细体征 ──');
        if (fd.firstImpression) console.log('      整体印象: ' + fd.firstImpression);
        if (fd.stature) console.log('      身高体型: ' + fd.stature);
        if (fd.measurements) console.log('      三围: ' + fd.measurements);
        if (fd.breasts) console.log('      胸部: ' + fd.breasts);
        if (fd.buttocks) console.log('      臀部: ' + fd.buttocks);
        if (fd.waist) console.log('      腰腹: ' + fd.waist);
        if (fd.legs) console.log('      腿部: ' + fd.legs);
        if (fd.skin) console.log('      皮肤: ' + fd.skin);
        if (fd.hands) console.log('      手部: ' + fd.hands);
        if (fd.lips) console.log('      唇部: ' + fd.lips);
        if (fd.eyes) console.log('      眼睛: ' + fd.eyes);
        if (fd.hair) console.log('      秀发: ' + fd.hair);
        if (fd.allure) console.log('      魅惑力: ' + fd.allure);
        if (fd.bodyScent) console.log('      体味/体香: ' + fd.bodyScent);
        if (fd.touch) console.log('      触感: ' + fd.touch);
        if (fd.intimateReaction) console.log('      亲密反应: ' + fd.intimateReaction);
        if (fd.memorableTraits) console.log('      特殊记忆点: ' + fd.memorableTraits);
      }
    }

    /* ⑤ */
    const { personalityPrefs } = d;
    if (personalityPrefs) {
      console.log('\n  ⑤ 性格偏好');
      if (personalityPrefs.traits?.length) console.log('    标签: ' + personalityPrefs.traits.join(', '));
      if (personalityPrefs.description) console.log('    描述: ' + personalityPrefs.description);
      if (personalityPrefs.interests?.length) console.log('    兴趣: ' + personalityPrefs.interests.join(', '));
      if (personalityPrefs.habits) console.log('    习惯: ' + personalityPrefs.habits);
      if (personalityPrefs.psychology) console.log('    心理: ' + personalityPrefs.psychology);
    }

    /* ⑥ */
    const { relationMap } = d;
    if (relationMap) {
      console.log('\n  ⑥ 关系定位');
      if (relationMap.relationToUser) console.log('    关系: ' + relationMap.relationToUser);
      if (relationMap.notes) console.log('    备注: ' + relationMap.notes);
      const ix = relationMap.intersections;
      if (ix) {
        if (ix.metWhen) console.log('    结识场景: ' + ix.metWhen);
        if (ix.workTogether) console.log('    共事记录: ' + ix.workTogether);
        if (ix.lifeIntersection) console.log('    生活交集: ' + ix.lifeIntersection);
        if (ix.emotionalAssessment) console.log('    情感评价: ' + ix.emotionalAssessment);
        if (ix.interestRelation) console.log('    利益关系: ' + ix.interestRelation);
        if (ix.sharedEvents?.length) {
          for (const ev of ix.sharedEvents) {
            console.log('    · [' + ev.type + '] ' + ev.date + ' ' + ev.event);
          }
        }
      }
    }

    /* ⑦~⑩ */
    if (d.familyNetwork) {
      const f = d.familyNetwork;
      const infos = [];
      if (f.parents?.length) infos.push('父母: ' + f.parents.join(', '));
      if (f.spouse) infos.push('配偶: ' + f.spouse);
      if (f.children?.length) infos.push('子女: ' + f.children.join(', '));
      if (f.siblings?.length) infos.push('兄弟姐妹: ' + f.siblings.join(', '));
      if (f.extended) infos.push('其他: ' + f.extended);
      if (infos.length) console.log('\n  ⑦ 家庭关系网\n    ' + infos.join('\n    '));
    }

    if (d.health) {
      const h = d.health;
      const infos = [];
      if (h.condition) infos.push('状况: ' + h.condition);
      if (h.medicalHistory) infos.push('病史: ' + h.medicalHistory);
      if (h.allergies) infos.push('过敏: ' + h.allergies);
      if (h.lifestyle) infos.push('生活习惯: ' + h.lifestyle);
      if (infos.length) console.log('\n  ⑧ 健康状况\n    ' + infos.join('\n    '));
    }

    if (d.lifeMilestones?.length) {
      console.log('\n  ⑨ 人生里程碑');
      for (const m of d.lifeMilestones) {
        console.log('    · [' + m.type + '] ' + m.date + ' - ' + m.event + (m.detail ? ': ' + m.detail : ''));
      }
    }

    if (d.socialCapital) {
      const s = d.socialCapital;
      const infos = [];
      if (s.colleagues?.length) infos.push('同事: ' + s.colleagues.join(', '));
      if (s.friends?.length) infos.push('朋友: ' + s.friends.join(', '));
      if (s.clients?.length) infos.push('客户: ' + s.clients.join(', '));
      if (s.description) infos.push('描述: ' + s.description);
      if (infos.length) console.log('\n  ⑩ 社会资本\n    ' + infos.join('\n    '));
    }

    if (d.memoryAnchors?.diamondIds?.length) {
      console.log('\n  记忆锚点 (黑钻)');
      for (const id of d.memoryAnchors.diamondIds) {
        console.log('    · ' + id);
      }
    }
  }

  // pending items
  if (props.pendingItems?.length) {
    console.log('\n─── 待确认条目 (' + props.pendingItems.length + '条) ───');
    for (const item of props.pendingItems) {
      const dt = item.timestamp ? item.timestamp.substring(0, 10) : '??';
      console.log('  [' + dt + '] ' + item.field + ': \"' + item.value.substring(0, 80) + '\"');
    }
  }

  // 关联关系
  console.log('\n─── 关联人物 ───');
  const rels = db.exec(`
    SELECT a.name as src, e.relation, b.name as tgt
    FROM edges e
    JOIN nodes a ON e.source_id = a.id
    JOIN nodes b ON e.target_id = b.id
    WHERE a.name = '徐诗雨' OR b.name = '徐诗雨'
  `);
  if (rels[0]?.values) {
    for (const r of rels[0].values) {
      console.log('  ' + r[0] + ' --[' + r[1] + ']--> ' + r[2]);
    }
  }

  db.close();
}

main().catch(console.error);
