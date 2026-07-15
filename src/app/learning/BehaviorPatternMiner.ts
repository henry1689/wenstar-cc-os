/**
 * BehaviorPatternMiner — 行为模式挖掘引擎
 * ==========================================
 * 从 memories 和 conversations 中挖掘用户的行为模式。
 * 供 DreamInsightExtractor 和 M7 梦境管道使用。
 *
 * 挖掘类型:
 *   - SleepPatterns: 失眠/熬夜模式
 *   - WorkPatterns: 工作疲劳/加班模式
 *   - SocialPatterns: 社交关系变化模式
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import type { DreamInsight } from './types.js';

export class BehaviorPatternMiner {
  private storage: FusionStorageAdapter;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
  }

  /**
   * 挖掘睡眠模式
   */
  async mineSleepPatterns(): Promise<DreamInsight[]> {
    try {
      const sqlite = this.storage.getSQLite();
      const results: DreamInsight[] = [];

      // 深夜消息检测 (23:00-05:00)
      const lateMsgs = sqlite.queryAll(
        `SELECT raw_input, created_at FROM memories
         WHERE (raw_input LIKE '%失眠%' OR raw_input LIKE '%睡不着%' OR raw_input LIKE '%熬夜%'
                OR raw_input LIKE '%没睡%' OR raw_input LIKE '%睡不%')
           AND calcium_score >= 0.2
         ORDER BY created_at DESC LIMIT 20`
      );
      if (lateMsgs && lateMsgs.length >= 2) {
        const recentMsg = lateMsgs[0] as any;
        results.push({
          type: 'behavior_pattern',
          title: '睡眠模式: 入睡困难',
          content: `用户在近期对话中 ${lateMsgs.length} 次提到睡眠相关问题。`
                 + `最近提及: ${(recentMsg.raw_input || '').substring(0, 60)}。`
                 + `建议在夜间对话中主动关怀用户入睡状态。`,
          confidence: Math.min(0.9, lateMsgs.length / 10),
          sourceMemories: lateMsgs.slice(0, 3).map((r: any) => r.raw_input as string),
        });
      }

      return results;
    } catch { return []; }
  }

  /**
   * 挖掘工作模式
   */
  async mineWorkPatterns(): Promise<DreamInsight[]> {
    try {
      const sqlite = this.storage.getSQLite();
      const results: DreamInsight[] = [];

      const fatigueMsgs = sqlite.queryAll(
        `SELECT raw_input, created_at FROM memories
         WHERE (raw_input LIKE '%加班%' OR raw_input LIKE '%好累%' OR raw_input LIKE '%累了%'
                OR raw_input LIKE '%疲惫%' OR raw_input LIKE '%忙完%' OR raw_input LIKE '%喘口气%')
           AND calcium_score >= 0.2
         ORDER BY created_at DESC LIMIT 20`
      );
      if (fatigueMsgs && fatigueMsgs.length >= 2) {
        const recentFatigue = fatigueMsgs[0] as any;
        results.push({
          type: 'behavior_pattern',
          title: '工作模式: 疲劳周期',
          content: `用户在近期对话中 ${fatigueMsgs.length} 次提到疲劳/工作压力。`
                 + `最近: ${(recentFatigue.raw_input || '').substring(0, 60)}。`
                 + `在用户提到工作时优先共情而非建议。`,
          confidence: Math.min(0.85, fatigueMsgs.length / 10),
          sourceMemories: fatigueMsgs.slice(0, 3).map((r: any) => r.raw_input as string),
        });
      }

      return results;
    } catch { return []; }
  }

  /**
   * 挖掘社交模式
   */
  async mineSocialPatterns(): Promise<DreamInsight[]> {
    try {
      const sqlite = this.storage.getSQLite();
      const results: DreamInsight[] = [];

      // 从 entity_relations 找高频社交实体
      const socialEntities = sqlite.queryAll(
        `SELECT ea.name, er.strength FROM entity_relations er
         JOIN entities ea ON er.entity_a_id = ea.id
         WHERE er.relation = 'co_occurrence' AND er.strength > 0.3
         ORDER BY er.strength DESC LIMIT 10`
      );
      if (socialEntities && socialEntities.length >= 2) {
        const top3 = socialEntities.slice(0, 3).map((r: any) => `${r.name}(${(r.strength as number).toFixed(2)})`);
        results.push({
          type: 'social_pattern',
          title: '社交关系: 高频人物',
          content: `用户近期高频提及的人物：${top3.join('、')}。`
                 + `关联强度反映用户当前的社交重心分布。`,
          confidence: 0.7,
          sourceMemories: [],
        });
      }

      return results;
    } catch { return []; }
  }
}
