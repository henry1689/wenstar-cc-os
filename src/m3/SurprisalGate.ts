/**
 * SurprisalGate — 惊奇值写入门控 (V13.0)
 * ======================================
 * 写入前判断信息量，低新奇+低钙化的冗余记忆不进入金库。
 *
 * 核心规则:
 *   novelty < 0.15 && calcium < 2.0 → BLOCK
 *   calcium >= 2.0 → ALWAYS ALLOW
 *   novelty >= 0.15 → ALLOW
 *
 * 默认 dryRun=true: 只记录日志不真拦截，观察误杀率。
 */

import { buildNgrams } from '../m4/SearchIndexBuilder.js';

export interface SurprisalGateInput {
  namespace: string;
  belongEntityUuid: string;
  content: string;
  calciumScore: number;
  timestampMs: number;
}

export interface SurprisalGateResult {
  shouldWrite: boolean;
  noveltyScore: number;
  duplicateScore: number;
  reason: string;
}

export interface SurprisalGateConfig {
  enabled: boolean;
  dryRun: boolean;
  blockThreshold: number;
  calciumWhitelist: number;
}

export const DEFAULT_SURPRISAL_CONFIG: SurprisalGateConfig = {
  enabled: false,         // 默认关闭
  dryRun: true,           // 先 dry-run 观察，不真拦截
  blockThreshold: 0.15,
  calciumWhitelist: 2.0,
};

export class SurprisalGate {
  private config: SurprisalGateConfig;

  constructor(config?: Partial<SurprisalGateConfig>) {
    this.config = { ...DEFAULT_SURPRISAL_CONFIG, ...config };
  }

  /**
   * 门控判定
   * @param input 新记忆上下文
   * @param recentTexts 最近 10 条同实体记忆的文本
   */
  evaluate(input: SurprisalGateInput, recentTexts: string[]): SurprisalGateResult {
    if (!this.config.enabled) {
      return { shouldWrite: true, noveltyScore: 1.0, duplicateScore: 0, reason: 'gate_disabled' };
    }

    // 首条记忆，始终放行
    if (recentTexts.length === 0) {
      return { shouldWrite: true, noveltyScore: 1.0, duplicateScore: 0, reason: 'first_memory' };
    }

    // 计算与历史记忆的最大 n-gram Jaccard 相似度
    const newNgrams = new Set(buildNgrams(input.content));
    const similarities = recentTexts.map(t => {
      const oldNgrams = new Set(buildNgrams(t));
      const intersection = [...newNgrams].filter(n => oldNgrams.has(n)).length;
      const union = new Set([...newNgrams, ...oldNgrams]).size;
      return union > 0 ? intersection / union : 0;
    });

    const maxSim = Math.max(...similarities);
    const noveltyScore = 1 - maxSim;

    // 钙化白名单
    if (input.calciumScore >= this.config.calciumWhitelist) {
      const msg = `[SurprisalGate] 高钙化 bypass (${input.calciumScore.toFixed(1)})`;
      if (this.config.dryRun) console.log(msg, input.content.substring(0, 50));
      return { shouldWrite: true, noveltyScore, duplicateScore: maxSim, reason: 'high_calcium_whitelist' };
    }

    // 门控判定
    if (noveltyScore < this.config.blockThreshold) {
      const msg = `[SurprisalGate] ${this.config.dryRun ? 'would_block' : 'BLOCKED'} novelty=${noveltyScore.toFixed(3)} calcium=${input.calciumScore}`;
      console.log(msg, input.content.substring(0, 50));
      return {
        shouldWrite: this.config.dryRun,  // dry-run 时不真拦截
        noveltyScore,
        duplicateScore: maxSim,
        reason: this.config.dryRun ? 'would_block_dryrun' : 'low_novelty_low_calcium_blocked',
      };
    }

    return { shouldWrite: true, noveltyScore, duplicateScore: maxSim, reason: 'novel_enough' };
  }
}
