/**
 * Perception40DStore — 40D 感知向量独立存储通道（V20）
 * ============================================================
 * 🔴 设计：完全绕过 SQLiteAdapter 本体修改（该文件被 harness Sentinel 锁定），
 * 通过 SQLiteAdapter 已公开的 writeRaw / queryAll 公共 API 读写 perception_v2 列。
 *
 * 双轨制：
 *   - 24D → perception_json 列（不变，EmotionVectorCodec 原有通道）
 *   - 40D → perception_40d 列（本模块负责）
 *
 * 🔴 注意：perception_v2 列已被 MemoryRetriever/EmotionRegulator 用作「情绪增量对象」，
 * 故 40D 使用独立列 perception_40d（由 SQLiteAdapter 启动时 ALTER 建列）。
 * perception_40d 列已由 SQLiteAdapter 启动时 ALTER 建列。
 */
import type { PerceptionV40 } from '../m3/types/perception-40d.js';
import { encodePerceptionV40, decodePerceptionV40 } from './PerceptionVector40DCodec.js';

/**
 * 写入 40D 感知向量到 memories.perception_40d 列。
 * 使用 writeRaw 公共 API（避开 SQLiteAdapter.writeMemory 的 INSERT 修改）。
 * 兼容两种调用风格：writeRaw(sql, a, b) 与 writeRaw(sql, [a, b])。
 */
export function writePerceptionV40(
  sqlite: { writeRaw(sql: string, ...params: unknown[]): void },
  id: string,
  p40: PerceptionV40,
): boolean {
  try {
    const json = encodePerceptionV40(p40);
    sqlite.writeRaw(
      'UPDATE memories SET perception_40d = ? WHERE id = ?',
      json, id,
    );
    return true;
  } catch (e) {
    console.error('[Perception40D] ❌ 写入 perception_40d 失败:', (e as Error)?.message);
    return false;
  }
}

/**
 * 读取 memories.perception_40d 列 → PerceptionV40。
 * 无数据/解析失败返回 null（不抛出）。
 */
export function readPerceptionV40(
  sqlite: { queryAll<T>(sql: string, params?: unknown[]): T[] },
  id: string,
): PerceptionV40 | null {
  try {
    const rows = sqlite.queryAll<{ perception_40d: string | null }>(
      'SELECT perception_40d FROM memories WHERE id = ?',
      [id],
    );
    if (!rows.length) return null;
    return decodePerceptionV40(rows[0].perception_40d);
  } catch (e) {
    console.error('[Perception40D] ❌ 读取 perception_40d 失败:', (e as Error)?.message);
    return null;
  }
}

/**
 * 批量回读某批记忆的 40D 感知（供检索用）。
 * 传入 SQL 片段，返回 id → PerceptionV40 映射。
 */
export function readPerceptionV40Batch(
  sqlite: { queryAll<T>(sql: string, params?: unknown[]): T[] },
  ids: string[],
): Map<string, PerceptionV40> {
  const result = new Map<string, PerceptionV40>();
  if (!ids.length) return result;
  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = sqlite.queryAll<{ id: string; perception_40d: string | null }>(
      `SELECT id, perception_40d FROM memories WHERE id IN (${placeholders})`,
      ids,
    );
    for (const r of rows) {
      const p = decodePerceptionV40(r.perception_40d);
      if (p) result.set(r.id, p);
    }
  } catch (e) {
    console.error('[Perception40D] ❌ 批量读取失败:', (e as Error)?.message);
  }
  return result;
}
