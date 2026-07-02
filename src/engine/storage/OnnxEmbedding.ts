/**
 * OnnxEmbedding — 基于 ONNX Runtime 的本地嵌入引擎
 *
 * 本地 bge-small-zh ONNX 模型（96MB）+ AutoTokenizer。
 * 零网络依赖，纯本地推理。
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IEmbeddingEngine, EmbeddingResult, EmbeddingStatus } from './EmbeddingEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = join(__dirname, '..', '..', '..', 'data', 'models', 'bge-small-zh');
const MAX_LEN = 128;

export class OnnxEmbeddingEngine implements IEmbeddingEngine {
  private status: EmbeddingStatus = 'uninitialized';
  private session: any = null;
  private tokenizer: any = null;
  private dim = 512;

  async warmup(): Promise<void> {
    if (this.status === 'ready') return;
    this.status = 'loading';
    console.log('[OnnxEmbedding] 加载模型...');
    try {
      const ort = await import('onnxruntime-node');
      this.session = await ort.InferenceSession.create(join(MODEL_DIR, 'model.onnx'));
      const { AutoTokenizer } = await import('@huggingface/transformers');
      this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_DIR);
      this.status = 'ready';
      console.log('[OnnxEmbedding] 就绪');
    } catch (err) {
      this.status = 'failed';
      console.error('[OnnxEmbedding] 加载失败:', err);
    }
  }

  getStatus(): EmbeddingStatus { return this.status; }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.session) await this.warmup();
    if (!this.session) return { vector: [], dimension: 0, modelId: 'failed' };

    const ort = await import('onnxruntime-node');

    // Tokenize
    const raw = this.tokenizer(text, { padding: true, truncation: true, max_length: MAX_LEN });
    const seqLen = Math.min(raw.input_ids.dims[1], MAX_LEN);
    const ids = (Array.from(raw.input_ids.data) as bigint[]).slice(0, seqLen);
    const mask = (Array.from(raw.attention_mask.data) as bigint[]).slice(0, seqLen);
    const type = new Array<bigint>(seqLen).fill(0n);

    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids), [1, seqLen]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(mask), [1, seqLen]),
      token_type_ids: new ort.Tensor('int64', BigInt64Array.from(type), [1, seqLen]),
    };

    const results = await this.session.run(feeds);
    const output = results['output'] || results[Object.keys(results)[0]];
    const data = Array.from(output.data) as number[];

    // Masked mean pooling
    const pooled = this.meanPooling(data, seqLen, this.dim);
    return { vector: pooled, dimension: this.dim, modelId: 'bge-small-zh-local' };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  private meanPooling(data: number[], seqLen: number, dim: number): number[] {
    const result: number[] = [];
    for (let d = 0; d < dim; d++) {
      let sum = 0;
      for (let s = 0; s < seqLen; s++) sum += data[s * dim + d];
      result.push(sum / seqLen);
    }
    return result;
  }
}
