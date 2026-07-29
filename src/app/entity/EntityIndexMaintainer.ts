/**
 * EntityIndexMaintainer — UUID索引维护器
 * ======================================
 * 确保三张业务表的 belong_entity_uuid 列有索引，
 * 保障多角色超长上下文检索性能 (O(n)→O(log n))。
 *
 * 幂等设计：启动时执行，索引已存在则跳过。
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';

const UUID_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_conversations_belong_entity_uuid ON conversations(belong_entity_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_memories_belong_entity_uuid ON memories(belong_entity_uuid)',
  'CREATE INDEX IF NOT EXISTS idx_black_diamond_belong_entity_uuid ON black_diamond(belong_entity_uuid)',
];

/** 启动时确保三表 UUID 索引存在（幂等） */
export function ensureEntityUUIDIndexes(sqlite: SQLiteAdapter): void {
  let created = 0;
  for (const ddl of UUID_INDEXES) {
    try {
      (sqlite as any).runSql(ddl);
      created++;
    } catch (e: any) {
      console.warn('[EntityIndex] 索引创建失败:', e?.message);
    }
  }
  if (created > 0) {
    console.log(`[EntityIndex] UUID索引就绪: ${created}/${UUID_INDEXES.length}`);
  }
}

/** 运行时校验索引是否存在 */
export function verifyIndexes(sqlite: SQLiteAdapter): boolean {
  try {
    const rows = sqlite.queryAll(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%_belong_entity_uuid'"
    );
    return (rows?.length ?? 0) >= 3;
  } catch {
    return false;
  }
}
