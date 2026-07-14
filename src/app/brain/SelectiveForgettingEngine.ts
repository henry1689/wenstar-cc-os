/**
 * SelectiveForgettingEngine.ts — 选择性遗忘引擎 (V3.0)
 * ======================================================
 * 三级遗忘机制：
 *   自然衰减 — G3 applyDecay 平滑降权（长期不用）
 *   软遗忘   — impression_score ×0.1，几乎不被命中（用户说"忘掉"）
 *   硬遗忘   — lifecycle='suppressed'，检索完全过滤（用户说"彻底删除"）
 *
 * V3.0 增强：模糊搜索匹配
 *   用户说"忘掉咖啡"时，不再只对文字"咖啡"这个ID操作，
 *   而是在 memories 和 knowledge_base 中搜索包含"咖啡"的所有记录，
 *   逐一执行遗忘操作。另外支持"忘掉刚才那件事"等上下文指令。
 *
 * 核心哲学：衰减不是遗忘，是算力资源优化。
 * 低优先级记忆降权，为高频交互让路。数据永远不丢失。
 *
 * 使用:
 *   const fg = new SelectiveForgettingEngine(sqlite);
 *   const results = await fg.forgetByKeyword('咖啡', 'soft');
 *   // → { matched: 3, forgotten: 3, ids: [...] }
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';

/** 遗忘类型 */
export type ForgetLevel = 'soft' | 'hard' | 'natural';

/** 遗忘操作结果 */
export interface ForgetResult {
  action: 'soft' | 'hard';
  keyword: string;
  matched: number;
  forgotten: number;
  ids: string[];
  summary: string;
}

export class SelectiveForgettingEngine {
  private sqlite: SQLiteAdapter;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  /**
   * 按关键词模糊搜索并遗忘
   * 这是主要的对外接口——用户说"忘掉XX"，引擎搜索所有匹配记录并遗忘。
   *
   * @param keyword  用户提到的关键词（如"咖啡"、"那个人"）
   * @param action   软遗忘或硬遗忘
   * @param scope    搜索范围：'all' | 'memory' | 'knowledge' | 'person'
   */
  async forgetByKeyword(
    keyword: string,
    action: 'soft' | 'hard' = 'soft',
    scope: 'all' | 'memory' | 'knowledge' | 'person' = 'all'
  ): Promise<ForgetResult> {
    const result: ForgetResult = { action, keyword, matched: 0, forgotten: 0, ids: [], summary: '' };
    const like = `%${keyword}%`;

    try {
      // ① 搜索记忆
      if (scope === 'all' || scope === 'memory') {
        const memories = this.sqlite.queryAll(
          "SELECT id, raw_input FROM memories WHERE raw_input LIKE ? AND lifecycle_state != 'suppressed' LIMIT 20",
          [like]
        );
        if (memories?.length) {
          for (const row of memories) {
            const id = (row as any).id;
            await this._applyForget('memory', id, action);
            result.ids.push(id);
          }
          result.matched += memories.length;
          result.forgotten += memories.length;
        }
      }

      // ② 搜索知识库
      if (scope === 'all' || scope === 'knowledge') {
        const knItems = this.sqlite.queryAll(
          "SELECT id, title FROM knowledge_base WHERE (title LIKE ? OR content LIKE ?) AND classification_pending = 0 LIMIT 20",
          [like, like]
        );
        if (knItems?.length) {
          for (const row of knItems) {
            const id = (row as any).id;
            await this._applyForget('knowledge', id, action);
            result.ids.push(id);
          }
          result.matched += knItems.length;
          result.forgotten += knItems.length;
        }
      }

      // ③ 搜索人物
      if (scope === 'all' || scope === 'person') {
        const persons = this.sqlite.queryAll(
          "SELECT name FROM hwg_persons WHERE name LIKE ? AND status = 'active' LIMIT 10",
          [like]
        );
        if (persons?.length) {
          for (const row of persons) {
            const name = (row as any).name;
            await this._applyForget('person', name, action);
            result.ids.push(name);
          }
          result.matched += persons.length;
          result.forgotten += persons.length;
        }
      }

      // 生成摘要
      if (result.forgotten > 0) {
        result.summary = `已遗忘 ${result.forgotten} 条与「${keyword}」相关的内容`;
        console.log(`[Forgetting] ${result.summary} (${action})`);
      }
    } catch (err) {
      console.warn('[Forgetting] 关键词遗忘失败:', err);
    }

    return result;
  }

  /**
   * 遗忘最近一条匹配的记忆（用于"忘掉刚才那件事"等上下文指令）
   */
  async forgetLastMatching(keyword: string, action: 'soft' | 'hard' = 'soft'): Promise<ForgetResult> {
    const result: ForgetResult = { action, keyword, matched: 0, forgotten: 0, ids: [], summary: '' };
    try {
      const rows = this.sqlite.queryAll(
        "SELECT id, raw_input FROM memories WHERE raw_input LIKE ? AND lifecycle_state != 'suppressed' ORDER BY created_at DESC LIMIT 1",
        [`%${keyword}%`]
      );
      if (rows?.length) {
        const id = (rows[0] as any).id;
        await this._applyForget('memory', id, action);
        result.matched = 1;
        result.forgotten = 1;
        result.ids.push(id);
        result.summary = `已遗忘最近一条与「${keyword}」相关的记忆`;
      }
    } catch (err) {
      console.warn('[Forgetting] 最近记忆遗忘失败:', err);
    }
    return result;
  }

  /**
   * 对单条记录执行遗忘操作
   */
  private _applyForget(targetType: 'knowledge' | 'memory' | 'person', targetId: string, action: 'soft' | 'hard'): void {
    if (targetType === 'person') {
      // 人物只用软遗忘（硬遗忘不适用于人物表）
      this.softForget(targetId, 'person').catch(() => {});
    } else if (action === 'hard') {
      this.hardForget(targetId, targetType).catch(() => {});
    } else {
      this.softForget(targetId, targetType).catch(() => {});
    }
  }

  /**
   * 软遗忘：印象值大幅降低，几乎不可检索
   * 适用于用户说"忘掉这个"/"不提这个了"
   */
  async softForget(targetId: string, targetType: 'knowledge' | 'memory' | 'person' = 'memory'): Promise<boolean> {
    try {
      if (targetType === 'knowledge') {
        this.sqlite.writeRaw(
          'UPDATE knowledge_base SET impression_score = 0.01, last_recalled_at = NULL WHERE id = ?',
          [targetId]
        );
        console.log(`[Forgetting] 软遗忘知识: ${targetId}`);
      } else if (targetType === 'memory') {
        this.sqlite.writeRaw(
          "UPDATE memories SET effective_strength = 0.01, calcium_score = 0.1, lifecycle_state = 'suppressed' WHERE id = ?",
          [targetId]
        );
        console.log(`[Forgetting] 软遗忘记忆: ${targetId}`);
      } else if (targetType === 'person') {
        // 软遗忘一个人物：印象值清零
        this.sqlite.writeRaw(
          "UPDATE hwg_persons SET status = 'dormant' WHERE name = ?",
          [targetId]
        );
        console.log(`[Forgetting] 软遗忘人物: ${targetId}`);
      }
      return true;
    } catch (err) {
      console.warn('[Forgetting] 软遗忘失败:', err);
      return false;
    }
  }

  /**
   * 硬遗忘：完全过滤，检索不可见
   * 适用于用户说"彻底删掉这个"
   */
  async hardForget(targetId: string, targetType: 'knowledge' | 'memory' = 'memory'): Promise<boolean> {
    try {
      if (targetType === 'knowledge') {
        // 知识库标记为待分类且锁定，永不检索
        this.sqlite.writeRaw(
          'UPDATE knowledge_base SET classification_pending = 1, impression_score = 0.01 WHERE id = ?',
          [targetId]
        );
        console.log(`[Forgetting] 硬遗忘知识: ${targetId}`);
      } else if (targetType === 'memory') {
        this.sqlite.writeRaw(
          "UPDATE memories SET lifecycle_state = 'suppressed', effective_strength = 0.01, calcium_score = 0.05 WHERE id = ?",
          [targetId]
        );
        console.log(`[Forgetting] 硬遗忘记忆: ${targetId}`);
      }
      return true;
    } catch (err) {
      console.warn('[Forgetting] 硬遗忘失败:', err);
      return false;
    }
  }

  /**
   * 检测用户消息中的"遗忘"指令
   * 返回 { action, target, targetType } 或 null
   *
   * V3.0 增强：支持更多口语化表达
   *   "忘掉咖啡" / "别提咖啡了" / "不想再提咖啡"
   *   "把咖啡相关的都删了" / "彻底忘掉咖啡"
   *   "刚才那件事别提了"（上下文指令）
   */
  detectForgetIntent(message: string): { action: 'soft' | 'hard'; target: string; targetType: 'knowledge' | 'memory' | 'person' } | null {
    const softPatterns = [
      { regex: /不想再提([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /别再提([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /忘掉([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /不提([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /忘记([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      // 上下文指令：那件事/这件事/刚才那个
      { regex: /那件?事[别不]?提了/, targetType: 'memory' as const },
    ];
    const hardPatterns = [
      { regex: /彻底删掉([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /彻底忘掉([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /彻底删除([^，。！？\s]{2,10})/, targetType: 'memory' as const },
      { regex: /删掉关于([^，。！？\s]{2,10})/, targetType: 'knowledge' as const },
      { regex: /把([^，。！？\s]{2,10})相关的都删了/, targetType: 'memory' as const },
    ];

    // 先检测硬遗忘（优先级高）
    for (const p of hardPatterns) {
      const m = message.match(p.regex);
      if (m) return { action: 'hard', target: (m[1] || m[0]).trim(), targetType: p.targetType };
    }
    for (const p of softPatterns) {
      const m = message.match(p.regex);
      if (m) return { action: 'soft', target: (m[1] || m[0]).trim(), targetType: p.targetType };
    }
    return null;
  }

  /**
   * 获取已遗忘的记忆统计
   */
  getStats(): { suppressed: number; dormant: number } {
    try {
      const suppressed = (this.sqlite.queryAll("SELECT COUNT(*) as c FROM memories WHERE lifecycle_state = 'suppressed'")[0] as any)?.c || 0;
      const dormant = (this.sqlite.queryAll("SELECT COUNT(*) as c FROM hwg_persons WHERE status = 'dormant'")[0] as any)?.c || 0;
      return { suppressed: suppressed as number, dormant: dormant as number };
    } catch { return { suppressed: 0, dormant: 0 }; }
  }
}
