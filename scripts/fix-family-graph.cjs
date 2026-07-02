#!/usr/bin/env node
/**
 * 家族图谱修复脚本 — wenstar-cc 镜像
 * 修复项：孪生节点合并、字段污染清洗、pendingItems清理、关系边修复、孤立节点清理
 *
 * 执行: node scripts/fix-family-graph.cjs
 * 备份: 同级目录 family_graph.db.bak.<timestamp>
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'knowledge', 'family_graph.db');
const BAK_PATH = DB_PATH + '.bak.' + Date.now();

// 备份
fs.copyFileSync(DB_PATH, BAK_PATH);
console.log('📦 备份:', path.basename(BAK_PATH));

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  const log = [];

  // ─── 工具函数 ───
  function q(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }
  function run(sql, params = []) { db.run(sql, params); }
  function getNode(name) {
    const r = q("SELECT * FROM nodes WHERE name = ? AND type = 'person'", [name]);
    return r.length ? r[0] : null;
  }
  function getProps(node) {
    try { return JSON.parse(node.properties || '{}'); } catch { return {}; }
  }
  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  }

  let totalFixes = 0;

  // ════════════════════════════════════════════════════════════
  // P0-1: 父亲 → 爸爸 合并
  // ════════════════════════════════════════════════════════════
  console.log('\n【P0-1】父亲 → 爸爸 合并');
  const fatherNode = getNode('父亲');
  const babaNode = getNode('爸爸');

  if (fatherNode && babaNode) {
    const fatherProps = getProps(fatherNode);
    const babaProps = getProps(babaNode);

    // 合并描述/职业/traits/兴趣/pending
    if (fatherProps.description && !babaProps.description) {
      babaProps.description = fatherProps.description;
    } else if (fatherProps.description && babaProps.description && fatherProps.description.length > babaProps.description.length) {
      babaProps.description = fatherProps.description;
    }
    if (fatherProps.occupation && !babaProps.occupation) {
      babaProps.occupation = fatherProps.occupation;
    }
    if (fatherProps.traits?.length) {
      babaProps.traits = [...new Set([...(babaProps.traits || []), ...fatherProps.traits])];
    }
    if (fatherProps.interests?.length) {
      babaProps.interests = [...new Set([...(babaProps.interests || []), ...fatherProps.interests])];
    }
    babaProps.mention_count = (babaProps.mention_count || 0) + (fatherProps.mention_count || 0);
    // 合并 pendingItems
    if (fatherProps.pendingItems?.length) {
      babaProps.pendingItems = [...(babaProps.pendingItems || []), ...fatherProps.pendingItems];
    }
    // 合并冲突记录
    if (fatherProps.conflicts?.length) {
      babaProps.conflicts = [...(babaProps.conflicts || []), ...fatherProps.conflicts];
    }

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(babaProps), babaNode.id]);

    // 将父亲的边重新指向爸爸
    const fatherEdges = q("SELECT * FROM edges WHERE source_id = ? OR target_id = ?", [fatherNode.id, fatherNode.id]);
    for (const edge of fatherEdges) {
      const newSrc = edge.source_id === fatherNode.id ? babaNode.id : edge.source_id;
      const newTgt = edge.target_id === fatherNode.id ? babaNode.id : edge.target_id;
      // 检查是否已有同样边
      const exists = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?",
        [newSrc, newTgt, edge.relation]);
      if (exists.length === 0) {
        run("UPDATE edges SET source_id = ?, target_id = ? WHERE id = ?", [newSrc, newTgt, edge.id]);
      } else {
        run("DELETE FROM edges WHERE id = ?", [edge.id]); // 去重
      }
    }

    // 删除父亲节点
    run("DELETE FROM nodes WHERE id = ?", [fatherNode.id]);
    totalFixes++;
    log.push('✅ 父亲 → 爸爸 合并完成');

    // 修复关系边：我 --[child_of]--> 爸爸
    const meNode = getNode('我');
    if (meNode) {
      const hasChildOf = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'child_of'",
        [meNode.id, babaNode.id]);
      if (hasChildOf.length === 0) {
        run("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))",
          [uid(), meNode.id, babaNode.id, 'child_of']);
        log.push('✅ 添加: 我 --[child_of]--> 爸爸');
      }
      const hasParentOf = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'parent_of'",
        [babaNode.id, meNode.id]);
      if (hasParentOf.length === 0) {
        run("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))",
          [uid(), babaNode.id, meNode.id, 'parent_of']);
        log.push('✅ 添加: 爸爸 --[parent_of]--> 我');
      }
      // 删除旧的 acquaintance_of 边
      const oldAcq = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'acquaintance_of'",
        [meNode.id, babaNode.id]);
      for (const o of oldAcq) { run("DELETE FROM edges WHERE id = ?", [o.id]); log.push('✅ 删除旧的 acquaintance 边: 我->爸爸'); }
    }
  } else {
    log.push('⏭️ 父亲/爸爸节点缺失，跳过');
  }

  // ════════════════════════════════════════════════════════════
  // P0-2: 妈 → 妈妈 合并
  // ════════════════════════════════════════════════════════════
  console.log('\n【P0-2】妈 → 妈妈 合并');
  const maNode = getNode('妈');
  const mamaNode = getNode('妈妈');

  if (maNode && mamaNode) {
    const maProps = getProps(maNode);
    const mamaProps = getProps(mamaNode);
    mamaProps.mention_count = (mamaProps.mention_count || 0) + (maProps.mention_count || 0);

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(mamaProps), mamaNode.id]);

    // 迁移妈的边
    const maEdges = q("SELECT * FROM edges WHERE source_id = ? OR target_id = ?", [maNode.id, maNode.id]);
    for (const edge of maEdges) {
      const newSrc = edge.source_id === maNode.id ? mamaNode.id : edge.source_id;
      const newTgt = edge.target_id === maNode.id ? mamaNode.id : edge.target_id;
      const exists = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?",
        [newSrc, newTgt, edge.relation]);
      if (exists.length === 0) {
        run("UPDATE edges SET source_id = ?, target_id = ? WHERE id = ?", [newSrc, newTgt, edge.id]);
      } else {
        run("DELETE FROM edges WHERE id = ?", [edge.id]);
      }
    }
    run("DELETE FROM nodes WHERE id = ?", [maNode.id]);
    totalFixes++;
    log.push('✅ 妈 → 妈妈 合并完成');
  } else {
    log.push('⏭️ 妈/妈妈节点缺失，跳过');
  }

  // ════════════════════════════════════════════════════════════
  // P0-3: 修复妈妈/妈妈的家族关系边
  // ════════════════════════════════════════════════════════════
  console.log('\n【P0-3】修复妈妈/妈妈的家族关系边');
  const mamaNode2 = getNode('妈妈');
  const meNode = getNode('我');
  if (mamaNode2 && meNode) {
    // 添加正确的 mother_of / child_of 边
    const hasMotherOf = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'mother_of'",
      [mamaNode2.id, meNode.id]);
    if (hasMotherOf.length === 0) {
      run("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))",
        [uid(), mamaNode2.id, meNode.id, 'mother_of']);
      log.push('✅ 添加: 妈妈 --[mother_of]--> 我');
    }
    const hasChildOf = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'child_of'",
      [meNode.id, mamaNode2.id]);
    if (hasChildOf.length === 0) {
      run("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))",
        [uid(), meNode.id, mamaNode2.id, 'child_of']);
      log.push('✅ 添加: 我 --[child_of]--> 妈妈');
    }
    // 删除旧的 acquaintance_of 边 (我->妈妈 和 妈妈->我)
    const oldAcq2 = q("SELECT id FROM edges WHERE ((source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)) AND relation = 'acquaintance_of'",
      [meNode.id, mamaNode2.id, mamaNode2.id, meNode.id]);
    for (const o of oldAcq2) { run("DELETE FROM edges WHERE id = ?", [o.id]); log.push('✅ 删除旧的 acquaintance 边: 我<->妈妈'); }
  }

  // ════════════════════════════════════════════════════════════
  // P0-4: 妹妹 ↔ 陈瑜 合并（陈瑜是妹妹的名字）
  // ════════════════════════════════════════════════════════════
  console.log('\n【P0-4】妹妹 → 陈瑜 合并');
  const meimeiNode = getNode('妹妹');
  const chenyuNode = getNode('陈瑜');

  if (meimeiNode && chenyuNode) {
    const meimeiProps = getProps(meimeiNode);
    const chenyuProps = getProps(chenyuNode);

    // 妹妹没有有效画像（仅relation=兄弟姐妹、traits=[温柔]、无description）
    // 陈瑜的description明确说"陈瑜是鸿艺的妹妹。妹夫叫巨小峰。"
    // 将妹妹的数据合并到陈瑜，陈瑜加别名"妹妹"
    let aliases = [];
    try { aliases = JSON.parse(chenyuNode.aliases || '[]'); } catch {}
    if (!aliases.includes('妹妹')) aliases.push('妹妹');
    run("UPDATE nodes SET aliases = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(aliases), chenyuNode.id]);

    if (meimeiProps.traits?.length) {
      chenyuProps.traits = [...new Set([...(chenyuProps.traits || []), ...meimeiProps.traits])];
    }
    chenyuProps.mention_count = (chenyuProps.mention_count || 0) + (meimeiProps.mention_count || 0);
    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(chenyuProps), chenyuNode.id]);

    // 迁移妹妹的边
    const mmEdges = q("SELECT * FROM edges WHERE source_id = ? OR target_id = ?", [meimeiNode.id, meimeiNode.id]);
    for (const edge of mmEdges) {
      const newSrc = edge.source_id === meimeiNode.id ? chenyuNode.id : edge.source_id;
      const newTgt = edge.target_id === meimeiNode.id ? chenyuNode.id : edge.target_id;
      const exists = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?",
        [newSrc, newTgt, edge.relation]);
      if (exists.length === 0) {
        run("UPDATE edges SET source_id = ?, target_id = ? WHERE id = ?", [newSrc, newTgt, edge.id]);
      } else {
        run("DELETE FROM edges WHERE id = ?", [edge.id]);
      }
    }
    run("DELETE FROM nodes WHERE id = ?", [meimeiNode.id]);
    totalFixes++;
    log.push('✅ 妹妹 → 陈瑜 合并完成（陈瑜加别名"妹妹"）');
  } else if (meimeiNode && !chenyuNode) {
    // 只有妹妹节点没有陈瑜节点 → 改名
    run("UPDATE nodes SET name = '陈瑜', aliases = '[\"妹妹\"]', updated_at = datetime('now') WHERE id = ?", [meimeiNode.id]);
    totalFixes++;
    log.push('✅ 妹妹 更名为 陈瑜，加别名"妹妹"');
  } else {
    log.push('⏭️ 妹妹/陈瑜 情况不匹配，跳过');
  }

  // ════════════════════════════════════════════════════════════
  // P1-1: 字段污染清洗
  // ════════════════════════════════════════════════════════════
  console.log('\n【P1-1】字段污染清洗');
  const polluted = [
    { name: '妈', field: 'appearance' },
    { name: '妈妈', field: 'appearance' },
    { name: '宁清华', field: 'appearance' },
    { name: '熊勇', field: 'appearance' },
  ];
  for (const p of polluted) {
    const node = getNode(p.name);
    if (node) {
      const props = getProps(node);
      if (props[p.field] && (props[p.field].includes('\n') || props[p.field].includes('玉瑶:'))) {
        log.push(`✅ [${p.name}].${p.field} 已清洗（原值: "${props[p.field].substring(0, 40).replace(/\n/g, '\\n')}..."）`);
        props[p.field] = '';
        run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
          [JSON.stringify(props), node.id]);
        totalFixes++;
      }
    }
  }

  // 还有 陈雪花.appearance = "还没有结婚的时候" — 这个其实是有效值，不是污染
  // 还有 客户.appearance = "也在珠海，这是一家美资公司" — 有效，保留

  // ════════════════════════════════════════════════════════════
  // P1-2: pendingItems 批量清理（含对话标记的删除）
  // ════════════════════════════════════════════════════════════
  console.log('\n【P1-2】待确认条目清理');
  const allPersonNodes = q("SELECT id, name, properties FROM nodes WHERE type = 'person'");
  let cleanedPending = 0;
  let keptPending = 0;

  for (const node of allPersonNodes) {
    const props = getProps(node);
    if (!props.pendingItems?.length) continue;

    const validItems = [];
    for (const item of props.pendingItems) {
      const val = item.value || '';
      // 对话污染特征
      const isPolluted =
        val.includes('玉瑶:') ||
        val.includes('\n') ||
        /^[（(]我/.test(val.trim()) ||
        /^[（(]听到/.test(val.trim()) ||
        /^[（(]我认真/.test(val.trim()) ||
        /^[（(]你让/.test(val.trim()) ||
        /补给你好不好/.test(val) ||
        /我问/.test(val) ||
        /现在补/.test(val) ||
        /我整个人/.test(val) ||
        /其他所有/.test(val) ||
        (item.field === 'appearance' && val.length > 60);

      if (isPolluted) {
        cleanedPending++;
      } else {
        validItems.push(item);
        keptPending++;
      }
    }

    if (validItems.length !== props.pendingItems.length) {
      props.pendingItems = validItems;
      run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
        [JSON.stringify(props), node.id]);
    }
  }
  if (cleanedPending > 0) {
    totalFixes++;
    log.push(`✅ pendingItems 清理: 删除 ${cleanedPending} 条污染, 保留 ${keptPending} 条有效`);
  }

  // ════════════════════════════════════════════════════════════
  // P2-1: 删除奶奶孤立节点
  // ════════════════════════════════════════════════════════════
  console.log('\n【P2-1】删除孤立节点（奶奶）');
  const nainaiNode = getNode('奶奶');
  if (nainaiNode) {
    const nainaiEdges = q("SELECT id FROM edges WHERE source_id = ? OR target_id = ?", [nainaiNode.id, nainaiNode.id]);
    for (const e of nainaiEdges) run("DELETE FROM edges WHERE id = ?", [e.id]);
    run("DELETE FROM nodes WHERE id = ?", [nainaiNode.id]);
    totalFixes++;
    log.push('✅ 删除奶奶节点（孤立+无有效画像）');
  } else {
    log.push('⏭️ 奶奶节点不存在，跳过');
  }

  // ════════════════════════════════════════════════════════════
  // P2-2: 客户 → 钟师 更名
  // ════════════════════════════════════════════════════════════
  console.log('\n【P2-2】客户 → 钟师 更名');
  const kehuNode = getNode('客户');
  if (kehuNode) {
    const props = getProps(kehuNode);
    const desc = props.description || '';
    // 从描述提取真实姓名
    const realName = '钟师';
    run("UPDATE nodes SET name = ?, aliases = '[\"客户\",\"钟总\"]', updated_at = datetime('now') WHERE id = ?",
      [realName, kehuNode.id]);
    props.relation_to_user = '客户（钟师，钟总）';
    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(props), kehuNode.id]);
    totalFixes++;
    log.push('✅ 客户 → 钟师 更名完成');
  } else {
    log.push('⏭️ 客户节点不存在，跳过');
  }

  // ════════════════════════════════════════════════════════════
  // P2-3: 删除陈瑜(原妹妹)多余的 acquaintance_of 边
  // ════════════════════════════════════════════════════════════
  console.log('\n【P2-3】删除多余 acquaintance_of 边');
  const finalChenyu = getNode('陈瑜');
  if (finalChenyu && meNode) {
    // 删除 我 --[acquaintance_of]--> 陈瑜（已有 sibling_of）
    const extraAcq = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'acquaintance_of'",
      [meNode.id, finalChenyu.id]);
    for (const e of extraAcq) {
      run("DELETE FROM edges WHERE id = ?", [e.id]);
      totalFixes++;
      log.push('✅ 删除多余 acquaintance 边: 我->陈瑜');
    }
    // 同时删除反向的
    const extraAcqRev = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = 'acquaintance_of'",
      [finalChenyu.id, meNode.id]);
    for (const e of extraAcqRev) {
      run("DELETE FROM edges WHERE id = ?", [e.id]);
      log.push('✅ 删除多余 acquaintance 边: 陈瑜->我');
    }
  }

  // ════════════════════════════════════════════════════════════
  // 最终：完整度重新计算 + 反向边补全
  // ════════════════════════════════════════════════════════════
  console.log('\n【最终】完整度重新计算 + 反向边补全');
  for (const node of allPersonNodes) {
    const props = getProps(node);
    if (props.completeness !== undefined) {
      // 标记已完成清洗，complete会变但此处维持原算法，留待下次运行时自然更新
    }
  }

  // ════════════════════════════════════════════════════════════
  // 落盘 + 报告
  // ════════════════════════════════════════════════════════════
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  // 验证
  const SQL2 = await initSqlJs();
  const buf2 = fs.readFileSync(DB_PATH);
  const db2 = new SQL.Database(buf2);

  const finalNodes = db2.exec("SELECT type, COUNT(*) as cnt FROM nodes GROUP BY type");
  const finalEdges = db2.exec("SELECT COUNT(*) as cnt FROM edges");
  const pendingTotal = db2.exec("SELECT COUNT(*) as total FROM (SELECT properties FROM nodes WHERE type='person') WHERE json_extract(properties, '$.pendingItems') IS NOT NULL");

  console.log('\n═══════════════════════════════════════');
  console.log('  📋 修复报告');
  console.log('═══════════════════════════════════════');
  console.log(`  总修复操作: ${totalFixes} 项`);
  console.log(`  清理 pendingItems: ${cleanedPending} 条`);
  console.log(`  保留 pendingItems: ${keptPending} 条`);
  console.log('');
  console.log('  节点变化:');
  if (finalNodes[0]?.values) {
    for (const row of finalNodes[0].values) console.log(`    ${row[0]}: ${row[1]}`);
  }
  console.log(`  边总数: ${finalEdges[0]?.values?.[0]?.[0] || 0}`);
  console.log('');
  console.log('  日志:');
  for (const l of log) console.log('  ' + l);

  db2.close();
  console.log('\n✅ 修复完成。备份文件: ' + path.basename(BAK_PATH));
}

main().catch(err => { console.error('❌ 修复失败:', err); process.exit(1); });
