/**
 * KnowledgeRelationGraph.ts — 知识社交圈（自动关联网络）
 * ======================================================
 * 当两条知识在同一对话/同一场景/同一个人物上下文被调用时，
 * 自动在 knowledge_relations 表建立关联边。
 *
 * 关联类型:
 *   co_retrieved : 同一查询被同时召回
 *   co_scene     : 同一场景标签
 *   entity_shared: 提及同一个人物/实体
 *
 * 使用:
 *   const graph = new KnowledgeRelationGraph(storage);
 *   await graph.onCoRetrieved(knIdA, knIdB);      // 同时召回
 *   await graph.onSceneMatch(knId, sceneTags);      // 场景匹配
 *   await graph.getRelated(knId);                   // 获取关联知识
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';

const RELATION_DDL = `
CREATE TABLE IF NOT EXISTS knowledge_relations (
    kn_id_a TEXT NOT NULL,
    kn_id_b TEXT NOT NULL,
    relation TEXT NOT NULL,  -- co_retrieved | co_scene | entity_shared
    strength REAL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (kn_id_a, kn_id_b, relation)
);
CREATE INDEX IF NOT EXISTS idx_kr_a ON knowledge_relations(kn_id_a);
CREATE INDEX IF NOT EXISTS idx_kr_b ON knowledge_relations(kn_id_b);
`;

export class KnowledgeRelationGraph {
  private sqlite: SQLiteAdapter;
  private _initialized = false;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  private ensureTable(): void {
    if (this._initialized) return;
    try {
      this.sqlite.writeRaw(RELATION_DDL);
      this._initialized = true;
    } catch { /* 表已存在 */ }
  }

  /**
   * 两条知识被同时召回时建立/加强关联
   */
  async onCoRetrieved(knIdA: string, knIdB: string): Promise<void> {
    if (knIdA === knIdB) return;
    this.ensureTable();
    try {
      const now = new Date().toISOString();
      this.sqlite.writeRaw(
        `INSERT OR IGNORE INTO knowledge_relations (kn_id_a, kn_id_b, relation, strength, created_at, updated_at)
         VALUES (?, ?, 'co_retrieved', 0.3, ?, ?)`,
        [knIdA, knIdB, now, now],
      );
    } catch { /* 不阻塞 */ }
  }

  /**
   * 知识匹配到场景标签时建立场景关联
   */
  async onSceneMatch(knId: string, sceneTags: string[]): Promise<void> {
    if (!sceneTags.length) return;
    this.ensureTable();
    try {
      // 找到有相同场景标签的其他知识
      const related = this.sqlite.queryAll(
        `SELECT id FROM knowledge_base WHERE scene_tags IS NOT NULL AND id != ? AND (
          ${sceneTags.map(() => `scene_tags LIKE ?`).join(' OR ')}
        ) LIMIT 20`,
        [knId, ...sceneTags.map(t => `%${t}%`)],
      );

      const now = new Date().toISOString();
      for (const r of related) {
        const relatedId = (r as any).id as string;
        this.sqlite.writeRaw(
          `INSERT OR IGNORE INTO knowledge_relations (kn_id_a, kn_id_b, relation, strength, created_at, updated_at)
           VALUES (?, ?, 'co_scene', 0.5, ?, ?)`,
          [knId < relatedId ? knId : relatedId, knId < relatedId ? relatedId : knId, now, now],
        );
      }
    } catch { /* 不阻塞 */ }
  }

  /**
   * 知识提到某个实体时建立实体关联
   */
  async onEntityMention(knId: string, entityName: string): Promise<void> {
    if (!entityName) return;
    this.ensureTable();
    try {
      const related = this.sqlite.queryAll(
        `SELECT id FROM knowledge_base WHERE (title LIKE ? OR content LIKE ?) AND id != ? LIMIT 20`,
        [`%${entityName}%`, `%${entityName}%`, knId],
      );

      const now = new Date().toISOString();
      for (const r of related) {
        const relatedId = (r as any).id as string;
        this.sqlite.writeRaw(
          `INSERT OR IGNORE INTO knowledge_relations (kn_id_a, kn_id_b, relation, strength, created_at, updated_at)
           VALUES (?, ?, 'entity_shared', 0.4, ?, ?)`,
          [knId < relatedId ? knId : relatedId, knId < relatedId ? relatedId : knId, now, now],
        );
      }
    } catch { /* 不阻塞 */ }
  }

  /**
   * 获取与某条知识关联的所有知识
   */
  async getRelated(knId: string, limit = 10): Promise<Array<{ id: string; title: string; relation: string; strength: number }>> {
    this.ensureTable();
    try {
      const rows = this.sqlite.queryAll(
        `SELECT k.id, k.title, kr.relation, kr.strength
         FROM knowledge_relations kr
         JOIN knowledge_base k ON (k.id = kr.kn_id_a OR k.id = kr.kn_id_b)
         WHERE (kr.kn_id_a = ? OR kr.kn_id_b = ?) AND k.id != ?
         ORDER BY kr.strength DESC LIMIT ?`,
        [knId, knId, knId, limit],
      );
      return rows.map((r: any) => ({
        id: r.id as string,
        title: r.title as string,
        relation: r.relation as string,
        strength: r.strength as number,
      }));
    } catch { return []; }
  }

  /**
   * 获取知识社交圈统计
   */
  async getStats(): Promise<{ totalEdges: number; avgDegree: number }> {
    this.ensureTable();
    try {
      const totalEdges = (this.sqlite.queryAll('SELECT COUNT(*) as cnt FROM knowledge_relations')[0] as any)?.cnt || 0;
      const totalNodes = (this.sqlite.queryAll('SELECT COUNT(*) as cnt FROM knowledge_base')[0] as any)?.cnt || 0;
      return {
        totalEdges,
        avgDegree: totalNodes > 0 ? totalEdges / totalNodes : 0,
      };
    } catch { return { totalEdges: 0, avgDegree: 0 }; }
  }
}
