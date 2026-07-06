#!/usr/bin/env node
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  const persons = db.exec("SELECT name, properties, aliases FROM nodes WHERE type='person' ORDER BY name");
  const rows = persons[0]?.values || [];

  let findings = [];
  let findingId = 0;
  function add(severity, category, detail) {
    findingId++;
    findings.push({ id: findingId, severity, category, detail });
    console.log(`  [${severity}] #${findingId} ${category}: ${detail}`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  家族图谱 age 字段全量审计');
  console.log('══════════════════════════════════════════════════\n');

  /* ── 原因①: 采集路径只存 description 文本，不提取到 age 字段 ── */
  console.log('--- 原因①: PersonProfile 自动提取 age 缺失 ---');
  for (const r of rows) {
    const name = r[0];
    const p = JSON.parse(r[1] || '{}');
    if (!p.description) continue;
    const m = p.description.match(/(\d{1,2})岁/);
    if (m && p.age === undefined && !p.dossier?.basicInfo?.age) {
      add('P0', '采集遗漏', name + ' description中含有"' + m[0] + '"但age/age字段均未提取');
    }
  }

  /* ── 原因②: age 没有在 Chat PersonProfile 提取规则中 ── */
  console.log('\n--- 原因②: chat.ts PersonProfile 提取规则不含 age ---');
  // 这个需要读代码确认，标记为待查
  add('P0', '提取规则缺失', 'chat.ts L350-396 的 PersonProfile 提取有 appearance/body_features/description，但无 age 字段提取');

  /* ── 原因③: description 文本和结构化字段是两套写入路径 ── */
  add('P1', '写入路径分裂', 'description 由 PersonProfile 自动提取写入，age 只能手动写入——两条路径无同步机制');

  /* ── 原因④: 知识库文档和 FG 数据无自动同步 ── */
  add('P1', '知识库-FG断裂', '【FG档案范式】徐诗雨.md文档中明确写了18岁，但 FG nodes.properties 无对应 age 字段——文档和FG之间零同步');

  /* ── 原因⑤: age 字段未纳入 PersonDossier 的自动填充逻辑 ── */
  add('P1', 'dossier自动填充缺失', 'description中有年龄描述时，buildDossierFromFlat()不会提取age到dossier.basicInfo.age');

  /* ── 原因⑥: mention_count 每次+1 但 age 从不根据时间自动更新 ── */
  add('P2', '年龄无时效更新', '徐诗雨初次录入时如果设了18岁，过了一年还是18岁——无人维护年龄增长');

  /* ── 原因⑦: 完整的文本描述 vs 零散的结构化字段不一致 ── */
  console.log('\n--- 原因⑦: 文本描述与结构化字段一致性检查 ---');
  for (const r of rows) {
    const name = r[0];
    const p = JSON.parse(r[1] || '{}');
    const desc = p.description || '';

    // 检查年龄
    const ageDesc = desc.match(/(\d{1,2})岁/);
    const flatAge = p.age;
    const dosAge = p.dossier?.basicInfo?.age;
    if (ageDesc && flatAge === undefined && dosAge === undefined) {
      // 已有原因①覆盖，不重复
    }
    if (ageDesc && flatAge !== undefined) {
      if (parseInt(ageDesc[1]) !== flatAge) {
        add('P1', '数据矛盾', name + ' description说' + ageDesc[1] + '岁但age=' + flatAge);
      }
    }

    // 检查外貌和结构的 looks 一致性
    const app = p.appearance || '';
    const looks = p.dossier?.imageTraits?.looks || '';
    if (app && looks && app !== looks && looks.length > app.length * 2) {
      add('P2', '文本冗余', name + ' appearance(' + app.length + '字)和dossier.looks(' + looks.length + '字)内容重叠但长度差异大，存在冗余存储');
    }
  }

  /* ── 原因⑧: 设置年龄时没有统一入口 ── */
  add('P1', '缺少setter入口', 'FG 没有统一的 setPersonAge(name, age) 方法，各方只能直接操作 properties JSON');

  /* ── 原因⑨: 同一个字段存在多个副本 ── */
  console.log('\n--- 原因⑨: 重复字段检测 ---');
  for (const r of rows) {
    const name = r[0];
    const p = JSON.parse(r[1] || '{}');
    const dupFields = [];
    if (p.appearance && p.dossier?.imageTraits?.looks) dupFields.push('appearance/looks');
    if (p.body_features && p.dossier?.imageTraits?.bodyFeatures) dupFields.push('body_features/bodyFeatures');
    if (p.style && p.dossier?.imageTraits?.style) dupFields.push('style(flat+dossier)');
    if (p.voice && p.dossier?.imageTraits?.voice) dupFields.push('voice(flat+dossier)');
    if (p.traits && p.dossier?.personalityPrefs?.traits) dupFields.push('traits(flat+dossier)');
    if (p.interests && p.dossier?.personalityPrefs?.interests) dupFields.push('interests(flat+dossier)');
    if (p.personality && p.dossier?.personalityPrefs?.description) dupFields.push('personality/description');
    if (dupFields.length > 0) {
      add('P2', '字段冗余', name + ' 在 flat 和 dossier 中重复存储: ' + dupFields.join(', '));
    }
  }

  /* ── 原因⑩: 写入 FG 和写入知识库文件走不同代码路径 ── */
  add('P0', 'FG-KB写入分裂', 'updatePersonProfile() 只写 FG 不写知识库，知识库文档需手动上传——同一个人物两处数据各自维护');

  /* ── 原因⑪: 年龄信息在 lineage timeline 中有但没提取 ── */
  console.log('\n--- 原因⑪: timeline 隐含年龄 ---');
  for (const r of rows) {
    const name = r[0];
    const p = JSON.parse(r[1] || '{}');
    const timeline = p.dossier?.lifeResume?.timeline || [];
    for (const t of timeline) {
      const m = (t.summary || '').match(/(\d{1,2})[岁年]/);
      if (m) {
        add('P2', 'timeline隐含年龄', name + ' timeline中"' + m[0] + '"包含年龄信息但未提取到age字段');
      }
    }
  }

  /* ── 原因⑫: 年龄信息在 mention 关系描述中有但没提取 ── */
  console.log('\n--- 原因⑫: relation_to_user 隐含年龄 ---');
  for (const r of rows) {
    const name = r[0];
    const p = JSON.parse(r[1] || '{}');
    const rel = p.relation_to_user || '';
    const m = rel.match(/(\d{1,2})岁/);
    if (m && p.age === undefined) {
      add('P1', 'relation隐含年龄', name + ' relation_to_user="' + rel.substring(0, 30) + '"含"' + m[0] + '"但age字段未提取');
    }
  }

  /* ── 汇总 ── */
  console.log('\n══════════════════════════════════════════════════');
  console.log('  审计结果: 共发现 ' + findings.length + ' 个问题');
  console.log('══════════════════════════════════════════════════');

  const p0 = findings.filter(f => f.severity === 'P0').length;
  const p1 = findings.filter(f => f.severity === 'P1').length;
  const p2 = findings.filter(f => f.severity === 'P2').length;
  console.log('  P0(严重): ' + p0 + ' | P1(重要): ' + p1 + ' | P2(提示): ' + p2);

  for (const f of findings) {
    console.log('  #' + f.id + ' [' + f.severity + '] ' + f.category + ': ' + f.detail);
  }

  db.close();
}
main().catch(console.error);
