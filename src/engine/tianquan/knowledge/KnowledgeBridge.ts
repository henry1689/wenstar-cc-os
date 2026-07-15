/**
 * KnowledgeBridge.ts — 知识库桥接层 (V1.0 / BIONIC-002 Phase 1)
 * ==============================================================
 * 大脑皮层桥接层：封装对 m2/KnowledgeBase 的调用，提供统一的摘要索引接口。
 *
 * 定位（用户确认）:
 *   - 不存储原始数据，不搬迁 app/knowledge/
 *   - 作为 temporal 和 prefrontal 的统一知识入口
 *   - 提供摘要索引，不返回全文
 *
 * 使用:
 *   const bridge = new KnowledgeBridge(knowledgeBase, sqlite);
 *   const entries = await bridge.search(['关键词1', '关键词2'], 5);
 *   bridge.recordAccess('kb_001');
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分 §3
 */
import type { KnowledgeBase } from '../../../m2/KnowledgeBase.js';
import type { SQLiteAdapter } from '../../../m2/SQLiteAdapter.js';
import type { KnowledgeIndexEntry, KnowledgeIndexStats } from './types.js';

export class KnowledgeBridge {
  private knowledgeBase: KnowledgeBase;
  private sqlite: SQLiteAdapter;

  constructor(knowledgeBase: KnowledgeBase, sqlite: SQLiteAdapter) {
    this.knowledgeBase = knowledgeBase;
    this.sqlite = sqlite;
    this._ensureTable();
  }

  // ═══════════════════════════════════════════════════════
  //  对外查询接口
  // ═══════════════════════════════════════════════════════

  /**
   * 按关键词搜索知识索引摘要
   * @returns 摘要索引条目（不含全文）
   */
  async search(keywords: string[], topK: number = 5): Promise<KnowledgeIndexEntry[]> {
    if (keywords.length === 0) return [];

    try {
      const results = await this.knowledgeBase.search(keywords.join(' '), topK);
      return results.slice(0, topK).map(item => this._toIndexEntry(item));
    } catch (err) {
      console.warn('[KnowledgeBridge] 搜索失败:', err);
      return [];
    }
  }

  /**
   * 按实体名称检索关联知识
   */
  async queryByEntities(entityNames: string[], topK: number = 5): Promise<KnowledgeIndexEntry[]> {
    if (entityNames.length === 0) return [];

    try {
      // 用实体名做关键词搜索
      const results = await this.knowledgeBase.search(entityNames.join(' '), topK * 2);
      // 简单过滤：标题或内容包含任一实体名
      const filtered = results.filter(item => {
        const text = (item.title || '') + (item.content || '');
        return entityNames.some(name => text.includes(name));
      });
      return filtered.slice(0, topK).map(item => this._toIndexEntry(item));
    } catch (err) {
      console.warn('[KnowledgeBridge] 实体检索失败:', err);
      return [];
    }
  }

  /**
   * 按场景标签检索
   */
  queryByScene(sceneTags: string[], topK: number = 3): KnowledgeIndexEntry[] {
    try {
      const results = this.knowledgeBase.searchByScene(sceneTags, topK);
      return results.slice(0, topK).map(item => this._toIndexEntry(item));
    } catch (err) {
      console.warn('[KnowledgeBridge] 场景检索失败:', err);
      return [];
    }
  }

  /**
   * 加权搜索（情感感知）
   */
  async weightedSearch(
    keyword: string,
    sceneTags: string[],
    perception: { pleasure: number; arousal: number; intimacy: number },
    limit: number = 5,
  ): Promise<KnowledgeIndexEntry[]> {
    try {
      const results = await this.knowledgeBase.weightedSearch(keyword, sceneTags, perception, limit);
      return results.slice(0, limit).map(item => this._toIndexEntry(item));
    } catch (err) {
      console.warn('[KnowledgeBridge] 加权搜索失败:', err);
      return [];
    }
  }

  /**
   * 按 ID 获取完整知识条目（供 temporal 构建 SceneSnapshot 时使用）
   * 注意：这是唯一返回完整内容的接口，仅供 temporal 调用
   */
  getFullContent(sourceId: string): Record<string, unknown> | null {
    try {
      return this.knowledgeBase.getById(sourceId) as any;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  访问记录与索引维护
  // ═══════════════════════════════════════════════════════

  /**
   * 记录知识条目被访问（更新 hippocampal_index 中的时间戳）
   */
  recordAccess(sourceId: string): void {
    try {
      this.sqlite.writeRaw(
        `UPDATE knowledge_base SET last_recalled_at = ? WHERE id = ?`,
        [new Date().toISOString(), sourceId]
      );
    } catch { /* 非关键路径，静默 */ }
  }

  /**
   * 从 knowledge_base 表中拉取条目并构建摘要索引
   * 供初始化时全量同步使用
   */
  buildIndexFromSource(limit: number = 100): KnowledgeIndexEntry[] {
    try {
      const items = this.knowledgeBase.list(limit);
      return items.map(item => this._toIndexEntry(item));
    } catch (err) {
      console.warn('[KnowledgeBridge] 索引构建失败:', err);
      return [];
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): KnowledgeIndexStats {
    try {
      const items = this.knowledgeBase.list(1);
      const totalCount = items.length > 0
        ? (this.sqlite.queryAll("SELECT COUNT(*) as c FROM knowledge_base")[0] as any)?.c || 0
        : 0;
      return {
        totalIndexes: totalCount as number,
        avgImpressionScore: 0.5,
        lastFullSyncAt: null,
        pendingUpdates: 0,
      };
    } catch {
      return { totalIndexes: 0, avgImpressionScore: 0, lastFullSyncAt: null, pendingUpdates: 0 };
    }
  }

  // ═══════════════════════════════════════════════════════
  //  内部
  // ═══════════════════════════════════════════════════════

  /**
   * 确保 knowledge_index 表存在
   * 注意：此表为后续 Phase 预建，当前仅作 schema 预留。
   * 所有检索操作委托给 knowledgeBase（app/knowledge/KnowledgeEngine），
   * knowledge_index 的摘要写入管线将在 SleepTimeConsolidator 的 δ 节律中实现。
   */
  private _ensureTable(): void {
    try {
      this.sqlite.writeRaw(`
        CREATE TABLE IF NOT EXISTS knowledge_index (
          index_id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL UNIQUE,
          summary TEXT NOT NULL,
          tags TEXT DEFAULT '[]',
          scene_tags TEXT DEFAULT '[]',
          emotion_signature TEXT,
          impression_score REAL DEFAULT 0.5,
          interaction_type TEXT DEFAULT 'conversation',
          last_accessed_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
    } catch { /* 非关键 */ }
  }

  /** 将 KnowledgeItem 转为索引条目 */
  private _toIndexEntry(item: any): KnowledgeIndexEntry {
    const content = item.content || '';
    return {
      indexId: `idx_${item.id || 'unknown'}`,
      sourceId: item.id || 'unknown',
      summary: content.length > 100 ? content.substring(0, 97) + '...' : content,
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 5) : [],
      sceneTags: typeof item.scene_tags === 'string'
        ? item.scene_tags.split(',').filter(Boolean)
        : Array.isArray(item.scene_tags) ? item.scene_tags : [],
      emotionSignature: item.emotion_vector || undefined,
      impressionScore: typeof item.impression_score === 'number' ? item.impression_score : 0.5,
      interactionType: item.interaction_type || 'conversation',
      lastAccessedAt: item.last_recalled_at || new Date().toISOString(),
      createdAt: item.created_at || new Date().toISOString(),
    };
  }
}
