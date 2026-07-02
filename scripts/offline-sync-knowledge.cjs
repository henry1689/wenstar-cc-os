#!/usr/bin/env node
/**
 * 离线同步：家族图谱(FG) → 知识库(KnowledgeBase) + knowledge-md + knowledge-cabinet
 *
 * 等价于在线 POST /api/family/sync-knowledge 的效果。
 * 从 family_graph.db 读取所有人物dossier，写入 fusion_memory.db 的 knowledge_base，
 * 并同步到 knowledge-md/*.md 和 knowledge-cabinet/docs/*.txt。
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const WENSTAR_ROOT = 'D:/wenstar';
const FG_PATH = path.join(WENSTAR_ROOT, 'data', 'knowledge', 'family_graph.db');
const FM_PATH = path.join(WENSTAR_ROOT, 'data', 'webui', 'fusion_memory.db');
const KB_MD_DIR = path.join(WENSTAR_ROOT, 'data', 'knowledge-md');
const KC_DOCS_DIR = path.join(WENSTAR_ROOT, 'data', 'knowledge-cabinet', 'docs');

function uid() {
  return 'kn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

// ══ buildPersonSummary（与 FamilyGraphSync.ts v1.1 一致） ══
function buildPersonSummary(name, profile) {
  const parts = [];

  if (profile.relation_to_user) parts.push(`关系: ${profile.relation_to_user}`);
  if (profile.appearance) parts.push(`外貌: ${profile.appearance}`);
  if (profile.body_features) parts.push(`身材: ${profile.body_features}`);
  if (profile.traits?.length) parts.push(`性格: ${profile.traits.join('、')}`);
  if (profile.personality) parts.push(`性格描述: ${profile.personality}`);
  if (profile.occupation) parts.push(`职业: ${profile.occupation}`);
  if (profile.interests?.length) parts.push(`兴趣: ${profile.interests.join('、')}`);
  if (profile.habits) parts.push(`习惯: ${profile.habits}`);
  if (profile.description) parts.push(`备注: ${profile.description}`);

  const d = profile.dossier;
  if (d) {
    // ① 基础信息
    const bi = d.basicInfo;
    if (bi) {
      const bp = [];
      if (bi.gender) bp.push(bi.gender);
      if (bi.age) bp.push(`${bi.age}岁`);
      if (bi.birthYear) bp.push(`${bi.birthYear}年出生`);
      if (bi.birthPlace) bp.push(bi.birthPlace);
      if (bi.education) bp.push(bi.education);
      if (bi.maritalStatus) bp.push(bi.maritalStatus);
      if (bp.length) parts.push(`基础信息: ${bp.join('，')}`);
    }
    // ② 联系方式
    const ct = d.contact;
    if (ct) {
      const cp = [];
      if (ct.phone) cp.push(`电话:${ct.phone}`);
      if (ct.wechat) cp.push(`微信:${ct.wechat}`);
      if (ct.address) cp.push(`地址:${ct.address}`);
      if (ct.workplace) cp.push(`工作地:${ct.workplace}`);
      if (cp.length) parts.push(`联系方式: ${cp.join('，')}`);
    }
    // ③ 人生履历
    const lr = d.lifeResume;
    if (lr) {
      if (lr.careerHistory) parts.push(`职业生涯: ${lr.careerHistory}`);
      if (lr.notableEvents?.length) parts.push(`大事记: ${lr.notableEvents.join('、')}`);
      if (lr.timeline?.length) {
        parts.push(`人生时间线: ${lr.timeline.map(t => `${t.date||''} ${t.summary||''}${t.emotion ? `[${t.emotion}]` : ''}`).join(' → ')}`);
      }
    }
    // ④ 形象特质 + feminineDetails
    const it = d.imageTraits;
    if (it) {
      if (it.looks) parts.push(`外貌详述: ${it.looks}`);
      if (it.bodyFeatures && it.bodyFeatures !== profile.body_features) parts.push(`身材详述: ${it.bodyFeatures}`);
      if (it.style) parts.push(`风格: ${it.style}`);
      if (it.voice) parts.push(`声音: ${it.voice}`);
      if (it.distinguishingMarks) parts.push(`辨识特征: ${it.distinguishingMarks}`);
      if (it.scent) parts.push(`气味标签: ${it.scent}`);
      const fd = it.feminineDetails;
      if (fd) {
        const fp = [];
        if (fd.firstImpression) fp.push(`整体印象: ${fd.firstImpression}`);
        if (fd.stature) fp.push(`身高体型: ${fd.stature}`);
        if (fd.measurements) fp.push(`三围数据: ${fd.measurements}`);
        if (fd.breasts) fp.push(`胸部: ${fd.breasts}`);
        if (fd.buttocks) fp.push(`臀部: ${fd.buttocks}`);
        if (fd.waist) fp.push(`腰腹: ${fd.waist}`);
        if (fd.legs) fp.push(`腿部: ${fd.legs}`);
        if (fd.skin) fp.push(`皮肤: ${fd.skin}`);
        if (fd.hands) fp.push(`手部: ${fd.hands}`);
        if (fd.lips) fp.push(`唇部: ${fd.lips}`);
        if (fd.eyes) fp.push(`眼睛: ${fd.eyes}`);
        if (fd.hair) fp.push(`秀发: ${fd.hair}`);
        if (fd.allure) fp.push(`魅惑力: ${fd.allure}`);
        if (fd.bodyScent) fp.push(`体味/体香: ${fd.bodyScent}`);
        if (fd.touch) fp.push(`触感: ${fd.touch}`);
        if (fd.intimateReaction) fp.push(`亲密反应: ${fd.intimateReaction}`);
        if (fd.memorableTraits) fp.push(`特殊记忆点: ${fd.memorableTraits}`);
        if (fp.length) parts.push(`女性详细体征: ${fp.join(' | ')}`);
      }
    }
    // ⑤ 性格偏好
    const pp = d.personalityPrefs;
    if (pp) {
      if (pp.psychology) parts.push(`心理特征: ${pp.psychology}`);
      if (pp.description && pp.description !== profile.personality) parts.push(`性格详述: ${pp.description}`);
    }
    // ⑥ 关系定位
    const rm = d.relationMap;
    if (rm) {
      if (rm.notes) parts.push(`关系备注: ${rm.notes}`);
      const ix = rm.intersections;
      if (ix) {
        if (ix.metWhen) parts.push(`结识场景: ${ix.metWhen}`);
        if (ix.workTogether) parts.push(`共事记录: ${ix.workTogether}`);
        if (ix.lifeIntersection) parts.push(`生活交集: ${ix.lifeIntersection}`);
        if (ix.emotionalAssessment) parts.push(`情感评价: ${ix.emotionalAssessment}`);
        if (ix.sharedEvents?.length) parts.push(`共同事件: ${ix.sharedEvents.map(e => `${e.date||''} ${e.event||''}`).join('；')}`);
      }
    }
    // ⑦ 家庭关系网
    const fn = d.familyNetwork;
    if (fn) {
      const fp = [];
      if (fn.parents?.length) fp.push(`父母: ${fn.parents.join('、')}`);
      if (fn.spouse) fp.push(`配偶: ${fn.spouse}`);
      if (fn.children?.length) fp.push(`子女: ${fn.children.join('、')}`);
      if (fn.siblings?.length) fp.push(`兄弟姐妹: ${fn.siblings.join('、')}`);
      if (fn.extended) fp.push(`其他: ${fn.extended}`);
      if (fp.length) parts.push(`家庭关系: ${fp.join('；')}`);
    }
    // ⑧ 健康
    const h = d.health;
    if (h) {
      if (h.condition) parts.push(`健康状况: ${h.condition}`);
      if (h.medicalHistory) parts.push(`病史: ${h.medicalHistory}`);
      if (h.lifestyle) parts.push(`生活习惯: ${h.lifestyle}`);
    }
    // ⑨ 里程碑
    if (d.lifeMilestones?.length) {
      parts.push(`人生里程碑: ${d.lifeMilestones.map(m => `${m.date||''} ${m.event||''}${m.detail ? `（${m.detail}）` : ''}`).join('；')}`);
    }
    // ⑩ 社会资本
    const sc = d.socialCapital;
    if (sc) {
      if (sc.colleagues?.length) parts.push(`同事: ${sc.colleagues.join('、')}`);
      if (sc.friends?.length) parts.push(`朋友: ${sc.friends.join('、')}`);
      if (sc.description) parts.push(`社交描述: ${sc.description}`);
    }
  }

  return parts.length ? `${name}：${parts.join('；')}` : null;
}

// ══ 写入知识库MD文件 ══
function writeMdFile(id, title, content, tags, now) {
  const fname = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().substring(0, 80) + '.md';
  const tagsYaml = Array.isArray(tags) ? '\n' + tags.map(t => `  - "${t}"`).join('\n') : '';
  const frontmatter = `---
id: "${id}"
title: "${title}"
type: "family_graph"
source_type: "family_graph"
created_at: "${now}"
updated_at: "${now}"
tags:${tagsYaml}
---\n\n`;
  fs.writeFileSync(path.join(KB_MD_DIR, fname), frontmatter + (content || ''), 'utf-8');
  return fname;
}

function writeTxtFile(title, content) {
  const fname = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().substring(0, 80) + '.txt';
  fs.writeFileSync(path.join(KC_DOCS_DIR, fname), content, 'utf-8');
}

async function main() {
  // 确保目录存在
  for (const d of [KB_MD_DIR, KC_DOCS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  const SQL = await initSqlJs();

  // 读 FG
  const fgBuf = fs.readFileSync(FG_PATH);
  const fgDb = new SQL.Database(fgBuf);
  const rows = fgDb.exec("SELECT name, properties FROM nodes WHERE type='person' AND name NOT IN ('我', '我自己', '玉瑶')");
  fgDb.close();

  if (!rows[0]?.values) { console.log('❌ FG 无数据'); return; }

  const now = new Date().toISOString();
  const skipNames = new Set(['我', '我自己', '玉瑶']);
  const persons = [];

  for (const row of rows[0].values) {
    const name = row[0];
    if (skipNames.has(name)) continue;
    try {
      const props = JSON.parse(row[1] || '{}');
      const summary = buildPersonSummary(name, props);
      if (summary) persons.push({ name, summary });
    } catch(e) {
      console.warn(`  ⚠️  ${name} 解析失败: ${e.message}`);
    }
  }

  console.log(`FG读取: ${rows[0].values.length} 人 → 可同步: ${persons.length} 人\n`);

  // 读取 FM 已有条目
  const fmBuf = fs.readFileSync(FM_PATH);
  const fmDb = new SQL.Database(fmBuf);

  // 获取当前最大 id 偏移（用时间戳保证唯一）
  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const { name, summary } of persons) {
    try {
      const title = `人物档案: ${name}`;
      const tags = JSON.stringify(['人物档案', `person:${name}`]);

      // 查是否已有
      const existing = fmDb.exec("SELECT id, content FROM knowledge_base WHERE title = ?", [title]);
      const existingContent = existing[0]?.values?.[0]?.[1] || '';
      const existingId = existing[0]?.values?.[0]?.[0] || null;

      const hasNewSections = !existingContent.includes('女性详细体征') || !existingContent.includes('人生时间线');
      const hasGrowth = summary.length > existingContent.length + 50;

      if (existingId && !hasNewSections && !hasGrowth) {
        skipped++;
        process.stdout.write(`  ⏭️  ${name}（已有无变化）\n`);
        continue;
      }

      const id = existingId || 'kn_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

      // 写入 knowledge_base
      if (existingId) {
        fmDb.run("UPDATE knowledge_base SET content = ?, tags = ?, updated_at = ? WHERE id = ?",
          [summary, tags, now, id]);
        updated++;
      } else {
        fmDb.run("INSERT INTO knowledge_base (id, title, content, source_type, tags, created_at, updated_at, classification) VALUES (?, ?, ?, 'family_graph', ?, ?, ?, '人物档案')",
          [id, title, summary, tags, now, now]);
        created++;
      }

      // 同步到 knowledge-md/*.md
      const mdFile = writeMdFile(id, title, summary, ['人物档案', `person:${name}`], now);

      // 同步到 knowledge-cabinet/docs/*.txt
      writeTxtFile(title, summary);

      const status = existingId ? '🔄 更新' : '🆕 新建';
      const oldLen = existingContent.length || 0;
      process.stdout.write(`  ${status} ${name} (${oldLen}字→${summary.length}字) → md:${mdFile.substring(0,30)}\n`);
    } catch(e) {
      errors++;
      process.stdout.write(`  ❌  ${name}: ${e.message}\n`);
    }
  }

  // 落盘 FM
  const outBuf = fmDb.export();
  fs.writeFileSync(FM_PATH, Buffer.from(outBuf));
  fmDb.close();

  console.log(`\n✅ 同步完成`);
  console.log(`  新建: ${created} | 更新: ${updated} | 跳过: ${skipped} | 错误: ${errors}`);
  console.log(`  knowledge-md/ + knowledge-cabinet/docs/ 已同步`);
}

main().catch(console.error);
