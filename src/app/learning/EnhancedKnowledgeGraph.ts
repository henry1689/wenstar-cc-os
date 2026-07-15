/**
 * EnhancedKnowledgeGraph.ts — 知识关联图谱增强版
 * ===============================================
 * 在 KnowledgeRelationGraph 的 3 种关联类型基础上，新增语义关联:
 *   - upstream:      A 是 B 的前提知识 (如"Python基础"→"Django项目")
 *   - complement:    A 和 B 互补 (同一话题不同角度)
 *   - conflict:      A 和 B 冲突 (矛盾信息)
 *   - generalization: A 是 B 的概括 (如"编程语言"→"Python")
 *
 * 新增知识时自动执行 autoOrganize() 发现潜在关联。
 *
 * 使用:
 *   const graph = new EnhancedKnowledgeGraph(sqlite);
 *   await graph.relateComplement('kn_xxx', 'kn_yyy');
 *   await graph.autoOrganize('kn_xxx');
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';

const ENHANCED_DDL = `
CREATE TABLE IF NOT EXISTS knowledge_relations (
    kn_id_a TEXT NOT NULL,
    kn_id_b TEXT NOT NULL,
    relation TEXT NOT NULL,
    strength REAL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (kn_id_a, kn_id_b, relation)
);
CREATE INDEX IF NOT EXISTS idx_er_a ON knowledge_relations(kn_id_a);
CREATE INDEX IF NOT EXISTS idx_er_b ON knowledge_relations(kn_id_b);
`;

export class EnhancedKnowledgeGraph {
  private sqlite: SQLiteAdapter;
  private _ready = false;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  private ensureTable(): void {
    if (this._ready) return;
    try {
      this.sqlite.writeRaw(ENHANCED_DDL);
      this._ready = true;
    } catch { /* 表已存在 */ }
  }

  /** A 是 B 的前提知识 */
  async relateUpstream(knIdA: string, knIdB: string, strength = 0.5): Promise<void> {
    await this._addEdge(knIdA, knIdB, 'upstream', strength);
  }

  /** A 和 B 互补 */
  async relateComplement(knIdA: string, knIdB: string, strength = 0.5): Promise<void> {
    await this._addEdge(knIdA, knIdB, 'complement', strength);
  }

  /** A 和 B 冲突 */
  async relateConflict(knIdA: string, knIdB: string, strength = 0.7): Promise<void> {
    await this._addEdge(knIdA, knIdB, 'conflict', strength);
  }

  /** A 是 B 的概括 */
  async relateGeneralization(knIdA: string, knIdB: string, strength = 0.6): Promise<void> {
    await this._addEdge(knIdA, knIdB, 'generalization', strength);
  }

  /**
   * 新增知识时自动执行关联发现
   * 基于标题关键词重叠 + 场景标签匹配 + 实体重叠
   */
  async autoOrganize(knId: string): Promise<number> {
    this.ensureTable();
    let count = 0;
    try {
      // 获取新增知识的标题和内容
      const rows = this.sqlite.queryAll(
        'SELECT title, content, scene_tags, classification FROM knowledge_base WHERE id = ?',
        [knId]
      );
      if (!rows.length) return 0;

      const row = rows[0] as any;
      const title = (row.title || '') as string;
      const content = (row.content || '') as string;
      const sceneTags = ((row.scene_tags || '') as string).split(',').map((t: string) => t.trim()).filter(Boolean);
      const classification = (row.classification || '') as string;

      if (!title && !content) return 0;

      // 提取关键词（中文字词 2-4 字）
      const keywords = this._extractKeywords(title + ' ' + content);

      // 扫描已有知识寻找关联
      const existing = this.sqlite.queryAll(
        `SELECT id, title, classification, scene_tags FROM knowledge_base
         WHERE id != ? ORDER BY updated_at DESC LIMIT 100`,
        [knId]
      );

      for (const ex of existing) {
        const e = ex as any;
        const eTitle = (e.title || '') as string;
        const eContent = ''; // 不需全量加载内容
        const eClass = (e.classification || '') as string;
        const eTags = ((e.scene_tags || '') as string).split(',').map((t: string) => t.trim());

        // 同分类 → complement
        if (classification && eClass === classification && classification !== '其他') {
          await this.relateComplement(knId, e.id as string, 0.4);
          count++;
        }

        // 共享场景标签 → complement
        if (sceneTags.length > 0 && eTags.length > 0) {
          const shared = sceneTags.filter(t => eTags.includes(t));
          if (shared.length > 0) {
            await this.relateComplement(knId, e.id as string, 0.3);
            count++;
          }
        }

        // 标题关键词重叠 → upstream 或 complement
        const eKeywords = this._extractKeywords(eTitle);
        const overlap = keywords.filter(k => eKeywords.includes(k));
        if (overlap.length >= 2) {
          // 短标题含长标题关键词 → generalization
          if (title.length < eTitle.length && overlap.some(k => eTitle.includes(k))) {
            await this.relateGeneralization(knId, e.id as string, 0.5);
          } else {
            await this.relateComplement(knId, e.id as string, 0.3);
          }
          count++;
        }

        // 上限控制
        if (count >= 10) break;
      }

      console.log(`[EnhancedKG] 自动关联: ${title.substring(0, 20)} → ${count} 条`);
    } catch (err) {
      console.warn('[EnhancedKG] autoOrganize 失败:', err);
    }
    return count;
  }

  /** 获取某知识的关联知识 */
  async getRelated(knId: string, limit = 10): Promise<Array<{ id: string; title: string; relation: string; strength: number }>> {
    this.ensureTable();
    try {
      const rows = this.sqlite.queryAll(
        `SELECT k.id, k.title, kr.relation, kr.strength
         FROM knowledge_relations kr
         JOIN knowledge_base k ON (k.id = kr.kn_id_a OR k.id = kr.kn_id_b)
         WHERE (kr.kn_id_a = ? OR kr.kn_id_b = ?) AND k.id != ?
         ORDER BY kr.strength DESC LIMIT ?`,
        [knId, knId, knId, limit]
      );
      return rows.map((r: any) => ({
        id: r.id as string,
        title: r.title as string,
        relation: r.relation as string,
        strength: r.strength as number,
      }));
    } catch { return []; }
  }

  private async _addEdge(knIdA: string, knIdB: string, relation: string, strength: number): Promise<void> {
    if (knIdA === knIdB) return;
    this.ensureTable();
    try {
      const now = new Date().toISOString();
      const idA = knIdA < knIdB ? knIdA : knIdB;
      const idB = knIdA < knIdB ? knIdB : knIdA;
      this.sqlite.writeRaw(
        `INSERT OR IGNORE INTO knowledge_relations (kn_id_a, kn_id_b, relation, strength, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [idA, idB, relation, strength, now, now]
      );
    } catch { /* 不阻塞 */ }
  }

  private _extractKeywords(text: string): string[] {
    const words = text.match(/[一-龥]{2,4}/g);
    if (!words) return [];
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
      '都', '一', '也', '很', '到', '说', '要', '去', '你', '会', '好', '自己', '这', '那']);
    return [...new Set(words.filter(w => !stopWords.has(w) && w.length >= 2))];
  }
}
