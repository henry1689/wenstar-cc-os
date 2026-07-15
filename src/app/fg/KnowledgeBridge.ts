/**
 * KnowledgeBridge.ts — FG↔知识库双向桥接
 * ==========================================
 * 实现"人物挂载知识、知识反向定义人物"的双向联动。
 * 打通玉瑶的双核心（第二大脑 + 世界关系网络）。
 *
 * 使用:
 *   const bridge = new KnowledgeBridge(sqlite, familyGraph);
 *   await bridge.bridgeFromPerson(personId, '张忠谋');
 *   await bridge.bridgeFromKnowledge('张忠谋', knId);
 */
import type { FamilyGraph } from '../../m4/FamilyGraph.js';
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { CONFIDENCE } from './RelationshipTypes.js';

const BRIDGE_TABLE = `
CREATE TABLE IF NOT EXISTS hwg_bridges (
  id TEXT PRIMARY KEY,
  person_name TEXT NOT NULL,
  knowledge_id TEXT,
  knowledge_title TEXT,
  relation_type TEXT DEFAULT 'related',
  confidence REAL DEFAULT 0.5,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hwg_bridge_p ON hwg_bridges(person_name);
CREATE INDEX IF NOT EXISTS idx_hwg_bridge_k ON hwg_bridges(knowledge_id);
`;

export class KnowledgeBridge {
  private sqlite: SQLiteAdapter;
  private fg: FamilyGraph;
  private _ready = false;

  constructor(sqlite: SQLiteAdapter, fg: FamilyGraph) {
    this.sqlite = sqlite;
    this.fg = fg;
  }

  private ensureTable(): void {
    if (this._ready) return;
    try { this.sqlite.writeRaw(BRIDGE_TABLE); this._ready = true; } catch { /* */ }
  }

  /**
   * 从人物到知识库的桥接
   * 对话中提到某人 → 搜索知识库 → 建立关联
   */
  async bridgeFromPerson(personId: string, personName: string): Promise<number> {
    this.ensureTable();
    let count = 0;
    try {
      const rows = this.sqlite.queryAll(
        `SELECT id, title FROM knowledge_base WHERE title LIKE ? OR content LIKE ? LIMIT 3`,
        [`%${personName}%`, `%${personName}%`]
      );
      const now = new Date().toISOString();
      for (const row of rows) {
        const knId = (row as any).id as string;
        const knTitle = (row as any).title as string;
        const existing = this.sqlite.queryAll(
          'SELECT id FROM hwg_bridges WHERE person_name = ? AND knowledge_id = ?',
          [personName, knId]
        );
        if (!existing.length) {
          const id = `hwb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          this.sqlite.writeRaw(
            'INSERT INTO hwg_bridges (id, person_name, knowledge_id, knowledge_title, relation_type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, personName, knId, knTitle, 'related', CONFIDENCE.FROM_KNOWLEDGE, now]
          );
          count++;
        }
      }
      if (count > 0) console.log(`[KnowledgeBridge] ${personName} → ${count} 条知识关联`);
    } catch { /* */ }
    return count;
  }

  /**
   * 从知识到人物的反向桥接
   * 知识库新增条目 → 搜索 FG 中的人物 → 关联
   */
  async bridgeFromKnowledge(knId: string, title: string, content: string): Promise<number> {
    this.ensureTable();
    let count = 0;
    try {
      const combined = title + ' ' + content;
      const personNames = this.sqlite.queryAll(
        'SELECT name FROM hwg_persons WHERE ? LIKE ?',
        ['%' + combined + '%', '%' + name + '%']  // placeholder
      );
      // Simplified: extract possible person names from title
      const nameMatch = title.match(/[一-龥]{2,4}/g);
      if (nameMatch) {
        const now = new Date().toISOString();
        for (const name of [...new Set(nameMatch)]) {
          const p = this.sqlite.queryAll('SELECT id FROM hwg_persons WHERE name = ?', [name]);
          if (p.length) {
            const existing = this.sqlite.queryAll(
              'SELECT id FROM hwg_bridges WHERE person_name = ? AND knowledge_id = ?', [name, knId]
            );
            if (!existing.length) {
              const id = `hwb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
              this.sqlite.writeRaw(
                'INSERT INTO hwg_bridges (id, person_name, knowledge_id, knowledge_title, relation_type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, name, knId, title, 'related', CONFIDENCE.FROM_KNOWLEDGE, now]
              );
              count++;
            }
          }
        }
      }
    } catch { /* */ }
    return count;
  }

  /**
   * 获取某人的关联知识
   */
  getLinkedKnowledge(personName: string): Array<{ knowledgeId: string; title: string; confidence: number }> {
    this.ensureTable();
    try {
      const rows = this.sqlite.queryAll(
        'SELECT knowledge_id, knowledge_title, confidence FROM hwg_bridges WHERE person_name = ? ORDER BY confidence DESC',
        [personName]
      );
      return rows.map((r: any) => ({
        knowledgeId: r.knowledge_id as string,
        title: r.knowledge_title as string,
        confidence: r.confidence as number,
      }));
    } catch { return []; }
  }

  /**
   * 获取知识关联的人物
   */
  getLinkedPersons(knowledgeTitle: string): string[] {
    this.ensureTable();
    try {
      const rows = this.sqlite.queryAll(
        'SELECT person_name FROM hwg_bridges WHERE knowledge_title = ? OR knowledge_id = ?',
        [knowledgeTitle, knowledgeTitle]
      );
      return rows.map((r: any) => r.person_name as string);
    } catch { return []; }
  }
}
