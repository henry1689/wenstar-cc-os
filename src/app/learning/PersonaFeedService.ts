/**
 * PersonaFeedService — 人格反哺服务 (知识库→M6 自我模型)
 * =======================================================
 * 每天读取知识库中积累的用户偏好/习惯/资料，
 * 反哺到 M6 自我模型的偏好/边界/叙事中。
 *
 * 适配: 知识库自学习改善方案 Phase 3
 *
 * 使用:
 *   const feed = new PersonaFeedService(storage, m6);
 *   const report = await feed.dailyFeed();
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import { KnowledgeGrowthLogger } from './KnowledgeGrowthLogger.js';

export interface FeedReport {
  preferencesFed: number;
  boundariesFed: number;
  narrativeFed: number;
  details: string[];
}

export class PersonaFeedService {
  private storage: FusionStorageAdapter;
  private m6: any; // M6Orchestrator
  private logger: KnowledgeGrowthLogger;

  constructor(storage: FusionStorageAdapter, m6: any) {
    this.storage = storage;
    this.m6 = m6;
    this.logger = new KnowledgeGrowthLogger(storage);
  }

  /**
   * 每日一次：从知识库反哺 M6 自我模型
   */
  async dailyFeed(): Promise<FeedReport> {
    const report: FeedReport = { preferencesFed: 0, boundariesFed: 0, narrativeFed: 0, details: [] };

    try {
      const sqlite = this.storage.getSQLite();
      const today = new Date().toISOString().substring(0, 10);

      // ── ① 偏好学习 ──
      const prefs = sqlite.queryAll(
        `SELECT title, content, impression_score FROM knowledge_base
         WHERE classification = '用户偏好' AND classification_pending = 0
         ORDER BY COALESCE(impression_score, 0.5) DESC
         LIMIT 20`,
      );
      for (const pref of prefs) {
        const title = pref.title as string;
        const content = pref.content as string;

        // 判断喜好类型
        const isLike = /喜欢|爱|想要|希望/.test(content);
        const isDislike = /讨厌|不喜欢|不爱|不要|不想/.test(content);
        const prefName = title.replace(/^(喜好|习惯):\s*/, '').trim();

        if (prefName.length < 2) continue;

        if (isLike && typeof this.m6?.addPreference === 'function') {
          try {
            await this.m6.addPreference(prefName, 'like', (pref.impression_score as number) || 0.5);
            report.preferencesFed++;
          } catch { /* 重复添加跳过 */ }
        } else if (isDislike && typeof this.m6?.addPreference === 'function') {
          try {
            await this.m6.addPreference(prefName, 'dislike', (pref.impression_score as number) || 0.5);
            report.preferencesFed++;
          } catch { /* 重复添加跳过 */ }
        }
      }

      // ── ② 边界学习 ──
      const routines = sqlite.queryAll(
        `SELECT content FROM knowledge_base
         WHERE classification = '生活记录' AND classification_pending = 0
         ORDER BY created_at DESC LIMIT 20`,
      );
      const boundaryPatterns: string[] = [];
      for (const r of routines) {
        const text = r.content as string;
        if (/周末不|平时不|工作日不|晚上不|早上不/.test(text) && !boundaryPatterns.includes(text.substring(0, 30))) {
          boundaryPatterns.push(text.substring(0, 30));
        }
      }
      if (boundaryPatterns.length > 0 && typeof this.m6?.addBoundary === 'function') {
        for (const bp of boundaryPatterns) {
          try {
            await this.m6.addBoundary(bp, 0.6);
            report.boundariesFed++;
          } catch { /* 重复添加跳过 */ }
        }
      }

      // ── ③ 叙事反馈 ──
      const milestones = sqlite.queryAll(
        `SELECT title, content FROM knowledge_base
         WHERE classification IN ('人生地标', '梦境洞察', '冲突检测')
           AND classification_pending = 0
         ORDER BY created_at DESC LIMIT 10`,
      );
      for (const ms of milestones) {
        const title = ms.title as string;
        const content = ms.content as string;
        if (typeof this.m6?.addNarrativeEvent === 'function') {
          try {
            await this.m6.addNarrativeEvent(title, content.substring(0, 200));
            report.narrativeFed++;
          } catch { /* 重复添加跳过 */ }
        }
      }

      // ── ④ 记录生长日志 ──
      if (report.preferencesFed + report.boundariesFed + report.narrativeFed > 0) {
        await this.logger.log({
          eventType: 'feedback_distill',
          knId: 'persona_feed',
          detail: `反哺M6: ${report.preferencesFed}偏好 ${report.boundariesFed}边界 ${report.narrativeFed}叙事`,
          deltaCalcium: 0,
        });
        report.details.push(`成功反哺: ${report.preferencesFed}偏好, ${report.boundariesFed}边界, ${report.narrativeFed}叙事`);
      }

      console.log(`[PersonaFeed] ${report.details.join(' | ')}`);
    } catch (err) {
      console.warn('[PersonaFeed] 反哺失败:', err);
    }

    return report;
  }
}
