/**
 * SourceTracker.ts — MD源文件→记忆条目溯源追踪 (V4.0 Phase 2)
 * ============================================================
 * 在 fusion_memory.db 中维护 source_tracking 表，
 * 记录第二大脑 MD 文件与第一大脑 memories 表条目的双向映射。
 *
 * 核心功能:
 *   - track(sourceMD, memoryId) — 记录溯源链
 *   - findMemoriesBySource(sourcePath) — 反向查询 → 用于级联删除
 *   - findSourceByMemory(memoryId) — 正向查询 → 用于溯源
 *   - getChain(sourcePath) — 完整溯源链
 *
 * 使用:
 *   const tracker = new SourceTracker(sqlite);
 *   await tracker.initialize();
 */

import type { SQLiteAdapter } from '../../../m2/SQLiteAdapter.js';
import type { SourceTrackingRecord } from './types.js';

export class SourceTracker {
  private sqlite: SQLiteAdapter;
  private _ready = false;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  initialize(): void {
    if (this._ready) return;
    try {
      this.sqlite.writeRaw(`
        CREATE TABLE IF NOT EXISTS source_tracking (
          id TEXT PRIMARY KEY,
          source_path TEXT NOT NULL,
          source_uuid TEXT NOT NULL,
          source_hash TEXT NOT NULL,
          memory_id TEXT NOT NULL,
          synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          status TEXT NOT NULL DEFAULT 'active'
        )
      `);
      // 索引加速查询
      this.sqlite.writeRaw(`CREATE INDEX IF NOT EXISTS idx_st_source_path ON source_tracking(source_path)`);
      this.sqlite.writeRaw(`CREATE INDEX IF NOT EXISTS idx_st_memory_id ON source_tracking(memory_id)`);
      this.sqlite.writeRaw(`CREATE INDEX IF NOT EXISTS idx_st_status ON source_tracking(status)`);
      this._ready = true;
    } catch (err) {
      console.warn('[SourceTracker] 初始化失败:', err);
    }
  }

  /** 记录一条 MD 文件→记忆条目的同步映射 */
  track(
    sourcePath: string,
    sourceUuid: string,
    sourceHash: string,
    memoryId: string,
  ): boolean {
    if (!this._ready) this.initialize();
    try {
      const id = `st_${sourceUuid}_${memoryId}`.substring(0, 64);
      this.sqlite.writeRaw(
        `INSERT OR REPLACE INTO source_tracking (id, source_path, source_uuid, source_hash, memory_id, synced_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')`,
        [id, sourcePath, sourceUuid, sourceHash, memoryId, new Date().toISOString()]
      );
      return true;
    } catch {
      return false;
    }
  }

  /** 按源文件路径查找所有关联的记忆条目 ID */
  findMemoriesBySource(sourcePath: string): string[] {
    if (!this._ready) return [];
    try {
      const rows = this.sqlite.queryAll(
        "SELECT memory_id FROM source_tracking WHERE source_path = ? AND status = 'active'",
        [sourcePath]
      );
      return (rows || []).map((r: any) => r.memory_id as string);
    } catch {
      return [];
    }
  }

  /** 按记忆条目 ID 反查源文件 */
  findSourceByMemory(memoryId: string): SourceTrackingRecord | null {
    if (!this._ready) return null;
    try {
      const rows = this.sqlite.queryAll(
        "SELECT * FROM source_tracking WHERE memory_id = ? AND status = 'active' LIMIT 1",
        [memoryId]
      );
      if (!rows?.length) return null;
      return this._rowToRecord(rows[0]);
    } catch {
      return null;
    }
  }

  /** 获取源文件的完整溯源链（含 expired/orphaned） */
  getChain(sourcePath: string): SourceTrackingRecord[] {
    if (!this._ready) return [];
    try {
      const rows = this.sqlite.queryAll(
        "SELECT * FROM source_tracking WHERE source_path = ? ORDER BY synced_at DESC",
        [sourcePath]
      );
      return (rows || []).map(r => this._rowToRecord(r));
    } catch {
      return [];
    }
  }

  /** 标记源文件的所有关联记录为 expired（级联删除时调用） */
  markExpiredBySource(sourcePath: string): number {
    if (!this._ready) return 0;
    try {
      this.sqlite.writeRaw(
        "UPDATE source_tracking SET status = 'expired' WHERE source_path = ? AND status = 'active'",
        [sourcePath]
      );
      const rows = this.sqlite.queryAll("SELECT changes() as cnt");
      return (rows?.[0] as any)?.cnt || 0;
    } catch {
      return 0;
    }
  }

  /** 标记孤立记录（源文件被删除但记忆仍在） */
  markOrphanedBySource(sourcePath: string): number {
    if (!this._ready) return 0;
    try {
      this.sqlite.writeRaw(
        "UPDATE source_tracking SET status = 'orphaned' WHERE source_path = ? AND status = 'active'",
        [sourcePath]
      );
      const rows = this.sqlite.queryAll("SELECT changes() as cnt");
      return (rows?.[0] as any)?.cnt || 0;
    } catch {
      return 0;
    }
  }

  /** 获取溯源统计 */
  getStats(): { totalRecords: number; activeCount: number; expiredCount: number; orphanedCount: number } {
    if (!this._ready) return { totalRecords: 0, activeCount: 0, expiredCount: 0, orphanedCount: 0 };
    try {
      const rows = this.sqlite.queryAll(
        "SELECT status, COUNT(*) as cnt FROM source_tracking GROUP BY status"
      );
      const map: Record<string, number> = {};
      for (const r of rows || []) {
        map[(r as any).status] = (r as any).cnt as number;
      }
      return {
        totalRecords: Object.values(map).reduce((a, b) => a + b, 0),
        activeCount: map['active'] || 0,
        expiredCount: map['expired'] || 0,
        orphanedCount: map['orphaned'] || 0,
      };
    } catch {
      return { totalRecords: 0, activeCount: 0, expiredCount: 0, orphanedCount: 0 };
    }
  }

  private _rowToRecord(row: any): SourceTrackingRecord {
    return {
      id: row.id as string,
      sourcePath: row.source_path as string,
      sourceUuid: row.source_uuid as string,
      sourceHash: row.source_hash as string,
      memoryId: row.memory_id as string,
      syncedAt: row.synced_at as string,
      status: row.status as 'active' | 'expired' | 'orphaned',
    };
  }
}
