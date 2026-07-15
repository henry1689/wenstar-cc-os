/**
 * DreamInsightExtractor — 梦境洞察提取引擎
 * ===========================================
 * 从 M7 梦境引擎的 dream_logs 和 memories 中提取行为规律，
 * 为 KnowledgeDecayEngine 和 M6 人格反哺提供素材。
 *
 * 使用:
 *   const extractor = new DreamInsightExtractor(storage);
 *   const insights = await extractor.extractAll();
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import { BehaviorPatternMiner } from './BehaviorPatternMiner.js';
import { KnowledgeGrowthLogger } from './KnowledgeGrowthLogger.js';
import type { DreamInsight } from './types.js';

export class DreamInsightExtractor {
  private storage: FusionStorageAdapter;
  private miner: BehaviorPatternMiner;
  private logger: KnowledgeGrowthLogger;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
    this.miner = new BehaviorPatternMiner(storage);
    this.logger = new KnowledgeGrowthLogger(storage);
  }

  /**
   * 提取所有类型的梦境洞察
   */
  async extractAll(): Promise<DreamInsight[]> {
    const insights: DreamInsight[] = [];

    try {
      const sleepPatterns = await this.miner.mineSleepPatterns();
      insights.push(...sleepPatterns);

      const workPatterns = await this.miner.mineWorkPatterns();
      insights.push(...workPatterns);

      const emotionTrends = await this._extractEmotionTrends();
      insights.push(...emotionTrends);

      const socialPatterns = await this.miner.mineSocialPatterns();
      insights.push(...socialPatterns);

      // 记录生长日志
      for (const ins of insights) {
        await this.logger.log({
          eventType: 'lignify',
          knId: ins.title,
          detail: ins.content.substring(0, 200),
          sourceMemoryIds: ins.sourceMemories,
          deltaCalcium: 0,
        });
      }
    } catch (err) {
      console.warn('[DreamInsight] 提取失败:', err);
    }

    return insights;
  }

  /**
   * 从 dream_logs 提取情绪趋势洞察
   */
  private async _extractEmotionTrends(): Promise<DreamInsight[]> {
    try {
      const sqlite = this.storage.getSQLite();
      const logs = sqlite.queryAll(
        `SELECT summary, emotion_tag, created_at FROM dream_logs
         WHERE emotion_tag IN ('积极', '低落', '强烈')
         ORDER BY created_at DESC LIMIT 50`,
      );
      if (!logs || logs.length < 5) return [];

      const positive = logs.filter((r: any) => r.emotion_tag === '积极').length;
      const negative = logs.filter((r: any) => r.emotion_tag === '低落').length;

      if (positive + negative < 5) return [];

      const ratio = positive / (positive + negative);
      let trend: string;
      if (ratio > 0.7) trend = '用户近期情绪整体积极向上';
      else if (ratio < 0.3) trend = '用户近期情绪偏低，需要更多关怀';
      else trend = '用户近期情绪平稳，无明显波动';

      return [{
        type: 'emotion_trend',
        title: '情绪趋势洞察',
        content: `基于最近 ${positive + negative} 次情绪记录分析：${trend}。（积极 ${positive}次 / 消极 ${negative}次）`,
        confidence: Math.min(0.8, (positive + negative) / 50),
        sourceMemories: logs.slice(0, 5).map((r: any) => r.summary as string),
      }];
    } catch { return []; }
  }
}
