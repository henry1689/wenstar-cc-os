/**
 * AutoEnhancer.ts — 知识自动整编增强器
 * =======================================
 * 为知识库条目自动生成摘要、提取标签、发现关联。
 * 在 KnowledgeEngine.add() 后异步调用，不阻塞主流程。
 *
 * 使用:
 *   const enhancer = new AutoEnhancer(sqlite, enhancedKG);
 *   await enhancer.enhance(knId);
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { EnhancedKnowledgeGraph } from '../learning/EnhancedKnowledgeGraph.js';

export class AutoEnhancer {
  private sqlite: SQLiteAdapter;
  private kg: EnhancedKnowledgeGraph;

  constructor(sqlite: SQLiteAdapter, kg: EnhancedKnowledgeGraph) {
    this.sqlite = sqlite;
    this.kg = kg;
  }

  /**
   * 对单条知识执行全量增强
   */
  async enhance(knId: string): Promise<void> {
    try {
      const rows = this.sqlite.queryAll(
        'SELECT title, content, tags FROM knowledge_base WHERE id = ?', [knId]
      );
      if (!rows.length) return;
      const row = rows[0] as any;
      const title = row.title as string || '';
      const content = row.content as string || '';

      // ① 自动标签: 从标题+内容提取关键词（已有的 tags 不覆盖）
      let tags: string[] = [];
      try { tags = JSON.parse(row.tags as string || '[]'); } catch { tags = []; }
      const autoTags = this._extractTags(title, content);
      const merged = [...new Set([...tags, ...autoTags])];
      if (merged.length > tags.length) {
        this.sqlite.writeRaw('UPDATE knowledge_base SET tags = ? WHERE id = ?',
          [JSON.stringify(merged), knId]);
      }

      // ② 自动关联: 委托 EnhancedKnowledgeGraph
      await this.kg.autoOrganize(knId);

    } catch { /* 增强失败不阻塞 */ }
  }

  /**
   * 批量增强
   */
  async enhanceBatch(limit = 50): Promise<number> {
    try {
      const rows = this.sqlite.queryAll(
        `SELECT id FROM knowledge_base ORDER BY updated_at ASC LIMIT ?`, [limit]
      );
      let count = 0;
      for (const row of rows) {
        await this.enhance((row as any).id as string);
        count++;
      }
      console.log(`[AutoEnhancer] 批量增强: ${count} 条`);
      return count;
    } catch { return 0; }
  }

  /**
   * 从文本提取标签（基于关键词规则）
   */
  private _extractTags(title: string, content: string): string[] {
    const combined = (title + ' ' + content).toLowerCase();
    const tags: string[] = [];

    const rules: Record<string, RegExp[]> = {
      '工作': [/工作|项目|客户|公司|方案|报告|会议|同事|老板|上班|加班|辞职/],
      '家庭': [/家人|妈妈|爸爸|老婆|老公|孩子|父母|妹妹|姐姐|哥哥/],
      '健康': [/健康|身体|医院|医生|药|睡|累|疼|痛|健身|运动|跑步|体检/],
      '学习': [/学习|读书|课|培训|考试|学|知识|技能|书/],
      '情感': [/开心|难过|伤心|孤独|爱|喜欢|讨厌|烦|压力|焦虑|害怕/],
      '生活': [/吃|喝|做饭|买菜|旅游|旅行|周末|日常/],
      '娱乐': [/电影|音乐|游戏|小说|动漫|画|唱|综艺/],
      '财务': [/钱|工资|收入|买房|车贷|理财|存钱|预算/],
    };

    for (const [tag, patterns] of Object.entries(rules)) {
      if (patterns.some(p => p.test(combined))) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)];
  }
}
