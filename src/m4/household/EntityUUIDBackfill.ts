/**
 * EntityUUIDBackfill — 实体 UUID 即时回填 (V12.1)
 * =================================================
 * 解决新实体首次对话时 belong_entity_uuid=NULL 的问题。
 *
 * 场景: 用户首次提及一个人名 → FG 中尚无此节点
 *   → persistence-stage 写入 conversation/memory 时 belong_entity_uuid=NULL
 *   → 同一轮 FG.addNode() 创建节点并分配 UUID
 *   → 此函数在同一轮结束时回填刚才写入的记录
 *
 * 设计:
 *   - 独立纯函数，不依赖 FG（避免循环依赖）
 *   - 基于文本匹配 + 人名查找
 *   - 幂等安全：只回填 belong_entity_uuid IS NULL 的记录
 */

/**
 * 对指定人名的新实体进行即时 UUID 回填。
 *
 * @param sqliteDB  fusion_memory.db 的 sql.js 实例
 * @param name      FG 中已创建的人名
 * @param uuid      该人的 UUID (TXS-ID)
 * @returns 回填的记录总数
 */
export function backfillEntityUUID(sqliteDB: any, name: string, uuid: string): number {
  if (!sqliteDB || !name || !uuid) return 0;

  let count = 0;

  // 回填 conversations — 全文匹配
  try {
    const convResult = sqliteDB.run(
      "UPDATE conversations SET belong_entity_uuid = ? WHERE belong_entity_uuid IS NULL AND content LIKE ?",
      [uuid, '%' + name + '%']
    );
    count += (sqliteDB.getRowsModified?.() || 0);
  } catch { /* 回填不阻塞 */ }

  // 回填 memories — 全文匹配
  try {
    sqliteDB.run(
      "UPDATE memories SET belong_entity_uuid = ? WHERE belong_entity_uuid IS NULL AND raw_input LIKE ?",
      [uuid, '%' + name + '%']
    );
    count += (sqliteDB.getRowsModified?.() || 0);
  } catch { /* 回填不阻塞 */ }

  // 回填 black_diamond — 通过 source_id 链传导
  try {
    sqliteDB.run(
      "UPDATE black_diamond SET belong_entity_uuid = ? WHERE belong_entity_uuid IS NULL AND source_id IN (SELECT id FROM memories WHERE belong_entity_uuid = ?)",
      [uuid, uuid]
    );
  } catch { /* 回填不阻塞 */ }

  if (count > 0) {
    console.log(`[EntityUUIDBackfill] "${name}" (${uuid}) → ${count} 条回填`);
  }

  return count;
}

/**
 * 批量回填 — 对 FG 全部已知人名重试一次
 * 供 pipeline 中在 FG 变更后调用
 */
export function backfillAllEntities(sqliteDB: any, fg: any): number {
  if (!sqliteDB || !fg) return 0;
  let total = 0;
  try {
    const names = fg.getAllPersonNames?.() || [];
    for (const name of names) {
      if (name.length < 2 || name === '我') continue;
      const uuid = fg.getUUIDByName?.(name);
      if (uuid) {
        total += backfillEntityUUID(sqliteDB, name, uuid);
      }
    }
  } catch { /* 不阻塞 */ }
  if (total > 0) console.log(`[EntityUUIDBackfill] 批量回填: ${total} 条`);
  return total;
}

export default { backfillEntityUUID, backfillAllEntities };
