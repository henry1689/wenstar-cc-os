/**
 * EntityContextStore — 上下文持久化存储
 * ======================================
 * 以 DB 为唯一真相源，提供跨会话的实体上下文重建。
 *
 * 职责：
 *   1. queryEntityContext(uuid) — 从 conversations 表按 UUID 精准查询
 *   2. rebuildAllContexts(uuids) — 启动时为所有 FG 实体重建上下文
 *   3. saveEmotionSnapshot(uuid) — 保存会晤结束时的情感快照
 *   4. loadEmotionSnapshot(uuid) — 恢复上次会晤的情感基调
 *
 * 不依赖 conversationHistory RAM 数组。
 */
import type { ConversationTurn } from '../../m5/types/index.js';

export interface EmotionSnapshot {
  pleasure: number;
  arousal: number;
  intimacy: number;
  lastTopic: string;
  savedAt: string;
}

export class EntityContextStore {
  private _sqlite: any;

  constructor(sqlite: any) {
    this._sqlite = sqlite;
  }

  /** 从 conversations 表按 UUID 精准查询实体对话历史 */
  queryEntityContext(uuid: string, limit: number = 200): ConversationTurn[] {
    try {
      const rows = this._sqlite.queryAll(
        `SELECT role, content, timestamp, belong_entity_uuid
         FROM conversations
         WHERE belong_entity_uuid = ? AND is_compacted = 0
         ORDER BY timestamp DESC LIMIT ?`,
        [uuid, limit],
      );
      if (!rows?.length) return [];
      return rows
        .reverse()
        .map((r: any) => ({
          role: r.role as 'user' | 'assistant',
          content: r.content as string,
          timestamp: r.timestamp as string,
        }));
    } catch (e: any) {
      console.warn('[EntityStore] queryEntityContext 失败:', e?.message);
      return [];
    }
  }

  /** 启动时为所有 FG 实体重建上下文（并行） */
  async rebuildAllContexts(
    entityUuids: Array<{ name: string; uuid: string }>,
  ): Promise<Map<string, ConversationTurn[]>> {
    const result = new Map<string, ConversationTurn[]>();
    for (const { name, uuid } of entityUuids) {
      const turns = this.queryEntityContext(uuid, 200);
      if (turns.length > 0) {
        result.set(name, turns);
        console.log(`[EntityStore] ${name}(${uuid}): 恢复 ${turns.length} 条对话`);
      }
    }
    return result;
  }

  /** 查询某实体的对话总数（用于活跃度判断） */
  getEntityTurnCount(uuid: string, sinceDays: number = 7): number {
    try {
      const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
      const rows = this._sqlite.queryAll(
        `SELECT COUNT(*) as cnt FROM conversations WHERE belong_entity_uuid = ? AND timestamp > ?`,
        [uuid, since],
      );
      return (rows?.[0] as any)?.cnt || 0;
    } catch {
      return 0;
    }
  }

  /** 保存会晤结束时的情感快照 */
  saveEmotionSnapshot(uuid: string, snapshot: Omit<EmotionSnapshot, 'savedAt'>): void {
    try {
      this._sqlite.writeRaw(
        `INSERT OR REPLACE INTO entity_context_snapshots (uuid, pleasure, arousal, intimacy, last_topic, saved_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid, snapshot.pleasure, snapshot.arousal, snapshot.intimacy, snapshot.lastTopic, new Date().toISOString()],
      );
    } catch (e: any) {
      console.warn('[EntityStore] saveEmotionSnapshot 失败:', e?.message);
    }
  }

  /** 恢复上次会晤的情感基调 */
  loadEmotionSnapshot(uuid: string): EmotionSnapshot | null {
    try {
      const rows = this._sqlite.queryAll(
        `SELECT pleasure, arousal, intimacy, last_topic, saved_at FROM entity_context_snapshots WHERE uuid = ?`,
        [uuid],
      );
      if (!rows?.length) return null;
      const r = rows[0] as any;
      return {
        pleasure: r.pleasure ?? 0,
        arousal: r.arousal ?? 0,
        intimacy: r.intimacy ?? 0,
        lastTopic: r.last_topic || '',
        savedAt: r.saved_at || '',
      };
    } catch {
      return null;
    }
  }

  /** 确保快照表存在（幂等） */
  static ensureSchema(sqlite: any): void {
    try {
      sqlite.run(
        `CREATE TABLE IF NOT EXISTS entity_context_snapshots (
          uuid TEXT PRIMARY KEY,
          pleasure REAL DEFAULT 0,
          arousal REAL DEFAULT 0,
          intimacy REAL DEFAULT 0,
          last_topic TEXT DEFAULT '',
          saved_at TEXT NOT NULL
        )`,
      );
    } catch { /* 表已存在 */ }
  }
}
