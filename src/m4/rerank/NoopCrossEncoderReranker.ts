/**
 * NoopCrossEncoderReranker — 空实现（Phase 1/2 默认使用）
 * ====================================================
 * 直接按原始 score 排序返回，不做 Cross-Encoder 推理。
 * Phase 3 替换为 OnnxCrossEncoderReranker。
 */

import type {
  CrossEncoderCandidate,
  CrossEncoderResult,
  CrossEncoderRerankOptions,
  CrossEncoderReranker,
} from './CrossEncoderReranker.js';

export class NoopCrossEncoderReranker implements CrossEncoderReranker {
  async rerank(
    _query: string,
    candidates: CrossEncoderCandidate[],
    options?: CrossEncoderRerankOptions,
  ): Promise<CrossEncoderResult[]> {
    const topK = options?.topK ?? candidates.length;
    return candidates.slice(0, topK).map(c => ({
      ...c,
      crossScore: c.score,
    }));
  }
}
