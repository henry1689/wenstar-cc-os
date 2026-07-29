/**
 * MMRDiversifier — Maximum Marginal Relevance 多样性去重 (V12.0)
 * ==============================================================
 * 公式: MMR(d) = λ × relevance(d) − (1−λ) × max_{s∈S} similarity(d, s)
 *
 * λ=0.7: 偏重相关性; λ=0.3: 偏重多样性
 * 相似度用 n-gram Jaccard 近似（避免全量向量计算）
 *
 * 设计原则:
 *   - λ=1.0 退化回纯相关性排序
 *   - 重复文本对（Jaccard>0.8）不会同时出现在最终结果中
 *   - 复用 SearchIndexBuilder 的 buildNgrams 做文本切分
 */

import type { RankedItem, MMRSelectedItem } from './types/retrieval.js';
import { buildNgrams } from './SearchIndexBuilder.js';

export interface MMRConfig {
  /** 相关性 vs 多样性 权衡: 1.0=纯相关, 0.0=纯多样 */
  lambda: number;
  /** 最终保留条数 */
  topK: number;
}

export const DEFAULT_MMR_CONFIG: MMRConfig = {
  lambda: 0.7,
  topK: 10,
};

/**
 * n-gram Jaccard 相似度（轻量近似，O(n) 计算）
 * 值域 [0, 1]，1 表示完全相同
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(buildNgrams(a));
  const setB = new Set(buildNgrams(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * MMR 多样性去重
 *
 * @param candidates       候选条目列表（已按相关性降序）
 * @param relevanceScores  id → 相关性分数（如 RRF score）
 * @param config           MMR 配置
 * @returns                去重后的最终结果（带 mmrScore）
 */
export function mmrDiversify(
  candidates: RankedItem[],
  relevanceScores: Map<string, number>,
  config: MMRConfig = DEFAULT_MMR_CONFIG,
): MMRSelectedItem[] {
  const selected: MMRSelectedItem[] = [];
  const remaining = [...candidates];

  while (selected.length < config.topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestMMR = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = relevanceScores.get(remaining[i].id) ?? 0;
      const maxSim = selected.length === 0
        ? 0
        : Math.max(...selected.map(s => jaccardSimilarity(s.text, remaining[i].text)));
      const mmr = config.lambda * relevance - (1 - config.lambda) * maxSim;
      if (mmr > bestMMR) {
        bestMMR = mmr;
        bestIdx = i;
      }
    }

    const [chosen] = remaining.splice(bestIdx, 1);
    selected.push({ ...chosen, mmrScore: bestMMR });
  }

  return selected;
}

/**
 * MMR 模式预设（按检索力度）
 */
export function getMMRConfig(mode: string): MMRConfig {
  switch (mode) {
    case 'introvert':
      return { lambda: 0.8, topK: 5 };   // 内敛: 更注重相关性
    case 'full':
      return { lambda: 0.5, topK: 15 };   // 全开: 更注重多样性
    case 'balanced':
    default:
      return DEFAULT_MMR_CONFIG;
  }
}
