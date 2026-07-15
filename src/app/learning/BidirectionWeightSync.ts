/**
 * BidirectionWeightSync — 记忆钙化↔知识印象值双向联动
 * =======================================================
 * 知识被引用 → 关联记忆钙化 +0.1
 * 记忆被回忆 → 关联知识印象值 +0.02
 *
 * 让记忆和知识不再是两条独立的系统，而是互相增强的生命体。
 *
 * 使用:
 *   const sync = new BidirectionWeightSync(storage);
 *   await sync.onMemoryRecalled(memoryId, memoryContent);  // 记忆被召回时
 *   await sync.onKnowledgeUsed(knId);                      // 知识被引用时
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';

export class BidirectionWeightSync {
  private storage: FusionStorageAdapter;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
  }

  /**
   * 记忆被召回时 → 关联知识印象值 +0.02
   * 在 M4 检索后调用
   */
  async onMemoryRecalled(memoryId: string, memoryContent: string): Promise<number> {
    try {
      const sqlite = this.storage.getSQLite();
      // 从 memoryContent 提取关键词找关联知识
      const keywords = this._extractKeywords(memoryContent);
      if (keywords.length === 0) return 0;

      let updated = 0;
      for (const kw of keywords.slice(0, 3)) {
        const related = sqlite.queryAll(
          `SELECT id FROM knowledge_base WHERE (title LIKE ? OR content LIKE ?) AND locked = 0 LIMIT 3`,
          [`%${kw}%`, `%${kw}%`],
        );
        for (const r of related) {
          sqlite.writeRaw(
            `UPDATE knowledge_base SET impression_score = MIN(1.0, COALESCE(impression_score, 0.5) + 0.02), last_recalled_at = ? WHERE id = ?`,
            [new Date().toISOString(), (r as any).id],
          );
          updated++;
        }
      }
      if (updated > 0) console.log(`[BiSync] 记忆→知识: ${updated} 条印象值 +0.02`);
      return updated;
    } catch { return 0; }
  }

  /**
   * 知识被引用（搜索命中/用户提及）时 → 关联记忆钙化 +0.1
   * 在 knowledge search 命中后调用
   */
  async onKnowledgeUsed(knId: string): Promise<number> {
    try {
      const sqlite = this.storage.getSQLite();

      // 获取知识内容
      const kn = sqlite.queryAll(`SELECT title, content FROM knowledge_base WHERE id = ?`, [knId]);
      if (!kn.length) return 0;

      const content = ((kn[0] as any).title + ' ' + (kn[0] as any).content || '');
      const keywords = this._extractKeywords(content);
      if (keywords.length === 0) return 0;

      let updated = 0;
      for (const kw of keywords.slice(0, 3)) {
        const related = sqlite.queryAll(
          `SELECT id FROM memories WHERE (raw_input LIKE ?) AND calcium_score < 10 LIMIT 5`,
          [`%${kw}%`],
        );
        for (const r of related) {
          sqlite.writeRaw(
            `UPDATE memories SET calcium_score = MIN(10.0, COALESCE(calcium_score, 0) + 0.1) WHERE id = ?`,
            [(r as any).id],
          );
          updated++;
        }
      }
      if (updated > 0) console.log(`[BiSync] 知识→记忆: ${updated} 条钙化 +0.1`);
      return updated;
    } catch { return 0; }
  }

  /**
   * 批量同步：每天定时执行，将高频知识对应记忆做批量钙化增强
   */
  async dailySync(): Promise<{ memoryToKnowledge: number; knowledgeToMemory: number }> {
    let memoryToKnowledge = 0;
    let knowledgeToMemory = 0;

    try {
      const sqlite = this.storage.getSQLite();

      // 最近 7 天被召回最多的 20 条知识
      const hotKnowledge = sqlite.queryAll(
        `SELECT id, title FROM knowledge_base
         WHERE last_recalled_at IS NOT NULL
         ORDER BY COALESCE(impression_score, 0) DESC LIMIT 20`,
      );
      for (const kn of hotKnowledge) {
        const content = ((kn as any).title || '') as string;
        const keywords = this._extractKeywords(content);
        for (const kw of keywords.slice(0, 2)) {
          const related = sqlite.queryAll(
            `SELECT id FROM memories WHERE raw_input LIKE ? AND calcium_score < 10 LIMIT 3`,
            [`%${kw}%`],
          );
          for (const r of related) {
            sqlite.writeRaw(
              `UPDATE memories SET calcium_score = MIN(10.0, COALESCE(calcium_score, 0) + 0.05) WHERE id = ?`,
              [(r as any).id],
            );
            knowledgeToMemory++;
          }
        }
      }

      console.log(`[BiSync] 每日同步: ${memoryToKnowledge}记忆→知识, ${knowledgeToMemory}知识→记忆`);
    } catch { /* 不阻塞 */ }

    return { memoryToKnowledge, knowledgeToMemory };
  }

  private _extractKeywords(text: string): string[] {
    const words = text.match(/[一-龥]{2,4}/g);
    if (!words) return [];
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '这', '那']);
    return [...new Set(words.filter(w => !stopWords.has(w) && w.length >= 2))].slice(0, 5);
  }
}
