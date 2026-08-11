/**
 * AlgorithmicCrossEncoder — 纯算法轻量精排器 (V13.0 无模型降级方案)
 * ============================================================================
 *
 * 当 ONNX 模型不可用时，利用已有的语义信号做二次精排：
 *   1. Query-Document n-gram Jaccard 重叠度
 *   2. 关键词命中密度
 *   3. 实体归属匹配加成
 *   4. 钙化分加成
 *
 * 加权公式:
 *   score = 0.35 * jaccard + 0.25 * keywordDensity + 0.20 * entityBoost + 0.20 * calciumBoost
 *
 * 比 Noop 的改进:
 *   - Noop 直接复用 RRF 分数（纯 n-gram 排名）
 *   - Algorithmic 综合考虑文本重叠+实体归属+钙化分
 *   - 能区分"提到关键词"和"深度相关"的记忆
 */

import type { CrossEncoderReranker, CrossEncoderCandidate, CrossEncoderResult, CrossEncoderRerankOptions } from './CrossEncoderReranker.js';

/**
 * 🔴 第二阶段 P0-1: 提取导出的纯文本相关性打分函数（二次精筛用）。
 * 从原 _computeRelevance 提取，去掉 entityBoost(≤0.1)/calciumBoost(≤0.3) 两个精排专属项，
 * 仅保留 jaccard + keywordDensity 并归一化: (0.35+0.25)/0.6=1.0 → 满分 1.0，阈值可解释。
 * 原 _computeRelevance 不动，rerank 精排行为零影响。
 */
export function computeQueryRelevance(query: string, docText: string): number {
  const tokens = _tokenizeShared(query);
  if (tokens.size === 0) return 0;
  const docTokens = _tokenizeShared(docText);
  if (docTokens.size === 0) return 0;

  // 1. Jaccard 重叠度 [0, 1]
  const intersection = [...tokens].filter(t => docTokens.has(t)).length;
  const union = new Set([...tokens, ...docTokens]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // 2. 关键词命中密度: 查询词在文档中的覆盖比例（长文档抗稀释的关键）
  const keywordDensity = intersection / tokens.size;

  // 归一化: 0.35*jaccard + 0.25*keywordDensity 满分 0.6 → 除 0.6 映射到 [0,1]
  const score = (0.35 * jaccard + 0.25 * keywordDensity) / 0.6;
  return Math.min(score, 1.0);
}

/** 共享的中文 1-3 字 n-gram tokenize（类内部 _tokenize 的复用实现） */
function _tokenizeShared(text: string): Set<string> {
  const cleaned = (text || '').replace(/[，。！？、；：""''（）《》【】\s\d\-\/\\@#$%^&*+=~`|]/g, '').trim();
  const tokens = new Set<string>();
  if (cleaned.length < 2) { tokens.add(cleaned); return tokens; }
  for (let len = 1; len <= 3; len++) {
    for (let i = 0; i <= cleaned.length - len; i++) {
      tokens.add(cleaned.substring(i, i + len));
    }
  }
  return tokens;
}

export class AlgorithmicCrossEncoder implements CrossEncoderReranker {
  private _ready = true;

  /** 始终就绪（无需模型加载） */
  isReady(): boolean { return this._ready; }
  warmup(): Promise<boolean> { return Promise.resolve(true); }

  async rerank(
    query: string,
    candidates: CrossEncoderCandidate[],
    options?: CrossEncoderRerankOptions,
  ): Promise<CrossEncoderResult[]> {
    const topK = options?.topK ?? candidates.length;

    if (candidates.length === 0) return [];

    const queryTokens = this._tokenize(query);
    if (queryTokens.size === 0) {
      return candidates.slice(0, topK).map(c => ({ ...c, crossScore: c.score }));
    }

    const results: CrossEncoderResult[] = candidates.map(c => {
      const docTokens = this._tokenize(c.content || '');
      const crossScore = this._computeRelevance(queryTokens, docTokens, c);
      return { ...c, crossScore };
    });

    results.sort((a, b) => b.crossScore - a.crossScore);
    return results.slice(0, topK);
  }

  /** 中文 n-gram tokenization（1-3 字符）— 复用导出共享实现，避免复制 */
  private _tokenize(text: string): Set<string> {
    return _tokenizeShared(text);
  }

  private _computeRelevance(
    queryTokens: Set<string>,
    docTokens: Set<string>,
    candidate: CrossEncoderCandidate,
  ): number {
    // 1. Jaccard 重叠度 [0, 1]
    const intersection = [...queryTokens].filter(t => docTokens.has(t)).length;
    const union = new Set([...queryTokens, ...docTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;

    // 2. 关键词命中密度: 查询词在文档中的覆盖比例
    const keywordDensity = queryTokens.size > 0
      ? intersection / queryTokens.size
      : 0;

    // 3. 实体匹配加成（如果候选来自相关实体）
    const entityBoost = candidate.sourceType === 'memory' ? 0.1 : 0;

    // 4. 钙化分加成（高钙化记忆更可能是用户想找的核心记忆）
    const calciumBoost = Math.min(candidate.score * 0.5, 0.3);

    // 加权融合
    const score = 0.35 * jaccard + 0.25 * keywordDensity + 0.20 * entityBoost + 0.20 * calciumBoost;

    return Math.min(score, 1.0);
  }
}
