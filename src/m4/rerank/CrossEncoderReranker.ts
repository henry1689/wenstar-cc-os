/**
 * CrossEncoderReranker — 接口定义 (V12.0 Phase1 Noop, Phase3 ONNX)
 * ===============================================================
 * Phase 1: 只定义接口 + NoopCrossEncoderReranker 空实现
 * Phase 3: OnnxCrossEncoderReranker 真实 ONNX 推理（bge-reranker-v2-m3）
 *
 * 设计原则:
 *   - 默认 Noop，检测到 ONNX 模型存在才启用
 *   - 失败时自动降级 Noop
 *   - 只处理短列表（≤50 候选）
 */

export interface CrossEncoderCandidate {
  globalUid: string;
  content: string;
  sourceType: string;
  score: number;
}

export interface CrossEncoderResult extends CrossEncoderCandidate {
  crossScore: number;     // Cross-Encoder 相关性分数 [0, 1]
}

export interface CrossEncoderRerankOptions {
  topK?: number;          // 返回条数
  batchSize?: number;     // 推理批次大小
  timeoutMs?: number;     // 单次推理超时
}

export interface CrossEncoderReranker {
  rerank(
    query: string,
    candidates: CrossEncoderCandidate[],
    options?: CrossEncoderRerankOptions,
  ): Promise<CrossEncoderResult[]>;
}
