/**
 * KnowledgeDecayEngine — 知识衰减引擎
 * ======================================
 * 每天运行一次，对知识库执行三类修剪:
 *   ① 印象值衰减: 90天未召回的知识 impression_score x0.9/月
 *   ② 矛盾标记: 冲突双方同时降权 x0.7
 *   ③ 冷热分流: hot(7天) / warm(7-90天) / cold(90天+)
 *
 * 使用:
 *   const engine = new KnowledgeDecayEngine(storage);
 *   const report = await engine.runDaily();
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import { LEARNING_CONFIG } from '../../config/learning-config.js';

export interface DecayReport {
  impressionDecayed: number;
  conflictSuppressed: number;
  dormantMarked: number;
  staleCleaned: number;
  details: string[];
}

export class KnowledgeDecayEngine {
  private storage: FusionStorageAdapter;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
  }

  /**
   * 执行每日衰减维护
   */
  async runDaily(): Promise<DecayReport> {
    const report: DecayReport = {
      impressionDecayed: 0,
      conflictSuppressed: 0,
      dormantMarked: 0,
      staleCleaned: 0,
      details: [],
    };

    try {
      const sqlite = this.storage.getSQLite();

      // ── ① 印象值衰减 ──
      const warmCutoff = new Date(Date.now() - LEARNING_CONFIG.DECAY_DAYS_WARM * 86400000).toISOString();
      sqlite.writeRaw(
        `UPDATE knowledge_base
         SET impression_score = MAX(0.01, COALESCE(impression_score, 0.5) * ?)
         WHERE last_recalled_at IS NOT NULL AND last_recalled_at < ?
           AND impression_score > 0.01`,
        [LEARNING_CONFIG.DECAY_IMPRESSION_FACTOR, warmCutoff],
      );
      report.impressionDecayed = 1;
      report.details.push(`印象值衰减: >=90天未召回的知识已降权`);

      // ── ② 休眠标记 ──
      const dormantCutoff = new Date(Date.now() - LEARNING_CONFIG.DECAY_DAYS_DORMANT * 86400000).toISOString();
      sqlite.writeRaw(
        `UPDATE knowledge_base
         SET impression_score = MAX(0.01, impression_score * 0.5)
         WHERE last_recalled_at IS NOT NULL AND last_recalled_at < ?
           AND impression_score > 0.01`,
        [dormantCutoff],
      );
      report.dormantMarked = 1;
      report.details.push(`休眠标记: >=180天未召回的知识已休眠降权`);

      // ── ③ 冲突降权 ──
      const conflictRows = sqlite.queryAll(
        `SELECT id FROM knowledge_base WHERE classification = '冲突检测' AND classification_pending = 1`,
      );
      for (const row of conflictRows) {
        sqlite.writeRaw(
          `UPDATE knowledge_base SET impression_score = MAX(0.01, COALESCE(impression_score, 0.5) * 0.7) WHERE id = ?`,
          [row.id as string],
        );
      }
      report.conflictSuppressed = conflictRows.length;

      // ── ④ 垃圾清理: 365天未召回的可归档 ──
      const archiveCutoff = new Date(Date.now() - LEARNING_CONFIG.DECAY_DAYS_ARCHIVE * 86400000).toISOString();
      sqlite.writeRaw(
        `DELETE FROM knowledge_base
         WHERE last_recalled_at IS NOT NULL AND last_recalled_at < ?
           AND (COALESCE(impression_score, 0.5) < 0.05 OR impression_score IS NULL)
           AND locked = 0`,
        [archiveCutoff],
      );
      report.staleCleaned = 1;
      report.details.push(`垃圾清理: >=365天未召回的已清理`);

      console.log(`[DecayEngine] 每日维护完成: ${JSON.stringify({
        decayed: report.impressionDecayed,
        dormant: report.dormantMarked,
        conflict: report.conflictSuppressed,
        cleaned: report.staleCleaned,
      })}`);

    } catch (err) {
      console.warn('[DecayEngine] 维护失败:', err);
    }

    return report;
  }

  /**
   * 新知识冷启动助推: 查询时调用
   * 创建 72 小时内的知识检索权重 x1.3
   */
  async applyNoveltyBoost(results: Array<{ id: string; created_at: string; matchScore?: number }>): Promise<Array<{ id: string; created_at: string; matchScore?: number }>> {
    const now = Date.now();
    const boostMs = LEARNING_CONFIG.NOVELTY_BOOST_HOURS * 3_600_000;

    return results.map(r => {
      const createdAt = new Date(r.created_at).getTime();
      const age = now - createdAt;
      if (age < boostMs) {
        return { ...r, matchScore: (r.matchScore || 0.5) * LEARNING_CONFIG.NOVELTY_BOOST_FACTOR };
      }
      return r;
    });
  }
}
