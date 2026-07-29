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

  /** 中文 n-gram tokenization（1-3 字符） */
  private _tokenize(text: string): Set<string> {
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
