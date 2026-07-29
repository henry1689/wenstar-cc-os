/**
 * OnnxCrossEncoderReranker — 基于 transformers.js 的 Cross-Encoder 精排器 (V13.0)
 * ============================================================================
 *
 * 模型: Xenova/bge-reranker-base (ONNX 量化, ~280MB, transformers.js 自动下载+缓存)
 * 引擎: @huggingface/transformers v4.2.0 (AutoModel + AutoTokenizer)
 *
 * 通过环境变量 HF_ENDPOINT=https://hf-mirror.com 实现国内镜像下载。
 * 首次加载时自动下载模型到 HF 缓存目录 (~./cache/huggingface/), 后续启动秒开。
 *
 * 设计原则:
 *   - 异步 warmup: 启动时不阻塞
 *   - 三态降级: ready → Algorithmic → Noop
 *   - 短列表: 最多处理 20 对
 *   - 超时保护: 单次推理 10s 上限
 */

import type { CrossEncoderReranker, CrossEncoderCandidate, CrossEncoderResult, CrossEncoderRerankOptions } from './CrossEncoderReranker.js';

export class OnnxCrossEncoderReranker implements CrossEncoderReranker {
  private _pipeline: any = null;
  private _ready = false;
  private _warming = false;
  private _warmPromise: Promise<boolean> | null = null;
  private _modelId = 'Xenova/bge-reranker-base';

  async warmup(): Promise<boolean> {
    if (this._ready) return true;
    if (this._warming && this._warmPromise) return this._warmPromise;

    this._warming = true;
    this._warmPromise = this._doWarmup();
    return this._warmPromise;
  }

  private async _doWarmup(): Promise<boolean> {
    try {
      const t0 = Date.now();
      console.log(`[CrossEncoder] 加载模型 ${this._modelId}...`);
      // 设置国内镜像 + pipeline
      const tf = await import('@huggingface/transformers');
      if (process.env.HF_ENDPOINT && (tf as any).env) {
        (tf as any).env.remoteHost = process.env.HF_ENDPOINT;
        console.log(`[CrossEncoder] 使用镜像: ${process.env.HF_ENDPOINT}`);
      }
      this._pipeline = await tf.pipeline('text-classification', this._modelId);
      this._ready = true;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[CrossEncoder] ✅ 就绪 (${elapsed}s)`);
      return true;
    } catch (err) {
      this._ready = false;
      console.warn(`[CrossEncoder] ⚠️ 加载失败: ${(err as Error).message}`);
      return false;
    } finally {
      this._warming = false;
    }
  }

  isReady(): boolean { return this._ready; }

  async rerank(
    query: string,
    candidates: CrossEncoderCandidate[],
    options?: CrossEncoderRerankOptions,
  ): Promise<CrossEncoderResult[]> {
    const topK = options?.topK ?? candidates.length;
    const timeoutMs = options?.timeoutMs ?? 10000;

    if (candidates.length === 0) return [];
    if (!this._ready) {
      if (!this._warming) this.warmup().catch(() => {});
      return candidates.slice(0, topK).map(c => ({ ...c, crossScore: c.score }));
    }

    try {
      const toRank = candidates.slice(0, Math.min(candidates.length, topK));

      const results = await Promise.race([
        this._scoreAll(query, toRank),
        new Promise<CrossEncoderResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        ),
      ]);

      results.sort((a, b) => b.crossScore - a.crossScore);
      return results;
    } catch (err) {
      console.warn(`[CrossEncoder] 推理失败, 降级 pass-through: ${(err as Error).message}`);
      return candidates.slice(0, topK).map(c => ({ ...c, crossScore: c.score }));
    }
  }

  /** 逐对打分 */
  private async _scoreAll(
    query: string,
    candidates: CrossEncoderCandidate[],
  ): Promise<CrossEncoderResult[]> {
    const results: CrossEncoderResult[] = [];
    for (const c of candidates) {
      // bge-reranker 输入: [CLS] query [SEP] document [SEP] → logits
      const input = `${query} [SEP] ${c.content || ''}`;
      const output = await this._pipeline(input, { topk: 1 });
      const score = output?.[0]?.score ?? 0;
      results.push({ ...c, crossScore: score });
    }
    return results;
  }
}
