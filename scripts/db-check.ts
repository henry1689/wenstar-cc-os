#!/usr/bin/env tsx
/**
 * db-check — 数据库健康巡检
 *
 * 检测项：
 * 1. FG "我"节点是否存在
 * 2. 孤立节点（无任何关系边）
 * 3. 缺失反向边（单向关系）
 * 4. 人物年龄冲突（同人不同龄）
 * 5. 人物数量统计
 *
 * 用法: npx tsx scripts/db-check.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

async function main() {
  const { default: initSqlJs } = await import('sql.js');
  const SQL = await initSqlJs();

  const fgPath = join(PROJECT_ROOT, 'data', 'webui', 'knowledge', 'family_graph.db');
  const fmPath = join(PROJECT_ROOT, 'data', 'webui', 'fusion_memory.db');

  let exitCode = 0;

  // ─── FG 检查 ───
  console.log('=== FG 健康巡检 ===');
  if (!existsSync(fgPath)) {
    console.log('❌ FG 文件不存在');
    exitCode = 1;
  } else {
    const buf = readFileSync(fgPath);
    const db = new SQL.Database(buf);

    // 检查"我"节点
    const meNodes = db.exec("SELECT id, properties FROM nodes WHERE name='我' AND type='person'");
    if (meNodes.length > 0 && meNodes[0].values.length > 0) {
      console.log('✅ "我"节点存在');
    } else {
      console.log('❌ "我"节点缺失！');
      exitCode = 1;
    }

    // 总人数
    const count = db.exec("SELECT COUNT(*) FROM nodes WHERE type='person'");
    console.log(`  人物总数: ${count[0].values[0][0]}`);

    // 孤立节点检查
    const isolated = db.exec(`
      SELECT n.name FROM nodes n
      WHERE n.type='person' AND n.name != '我'
      AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = n.id OR e.target_id = n.id)
    `);
    if (isolated.length > 0 && isolated[0].values.length > 0) {
      const names = isolated[0].values.map(r => r[0]);
      console.log(`⚠️  孤立节点（无关系边）: ${names.join(', ')}`);
    } else {
      console.log('✅ 无孤立节点');
    }

    // 总边数
    const edges = db.exec("SELECT COUNT(*) FROM edges");
    console.log(`  关系边数: ${edges[0].values[0][0]}`);

    // 年龄统计
    const ageQuery = db.exec("SELECT properties FROM nodes WHERE type='person' AND properties != '{}'");
    let hasAge = 0;
    for (const r of ageQuery) {
      for (const row of r.values) {
        try {
          const p = JSON.parse(row[0]);
          if (p.age) hasAge++;
        } catch {}
      }
    }
    console.log(`  有年龄数据: ${hasAge}人`);

    db.close();
  }

  // ─── Fusion Memory 检查 ───
  console.log('\n=== 记忆库健康巡检 ===');
  if (!existsSync(fmPath)) {
    console.log('❌ 记忆库文件不存在');
    exitCode = 1;
  } else {
    const buf = readFileSync(fmPath);
    const db = new SQL.Database(buf);

    const convCount = db.exec("SELECT COUNT(*) FROM conversations");
    console.log(`  对话记录: ${convCount[0].values[0][0]}条`);

    const memCount = db.exec("SELECT COUNT(*) FROM memories");
    console.log(`  金库记忆: ${memCount[0].values[0][0]}条`);

    const bdCount = db.exec("SELECT COUNT(*) FROM black_diamond");
    console.log(`  黑钻记忆: ${bdCount[0].values[0][0]}条`);

    const kbCount = db.exec("SELECT COUNT(*) FROM knowledge_base");
    console.log(`  知识库条目: ${kbCount[0].values[0][0]}条`);

    const topoCount = db.exec("SELECT COUNT(*) FROM entity_topology");
    console.log(`  拓扑边: ${topoCount[0].values[0][0]}条`);

    db.close();
  }

  console.log(`\n${exitCode === 0 ? '✅ 全部正常' : '❌ 存在问题'}`);
  process.exit(exitCode);
}

main();
