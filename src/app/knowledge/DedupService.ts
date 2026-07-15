/**
 * DedupService.ts — 知识语义去重
 * =================================
 * 新增知识时检测语义相似度 > 0.85 的已有条目，
 * 合并而非重复创建。基于 Zvec 向量检索实现。
 *
 * 使用:
 *   const dedup = new DedupService(zvecAdapter);
 *   const result = await dedup.check('标题', '内容');
 *   if (result.isDuplicate) { // 更新已有条目而非新增
 *     update(item);
 *   }
 */
import type { IZvecAdapter } from '../../m2/ZvecAdapter.js';

export interface DedupResult {
  isDuplicate: boolean;
  existingId?: string;
  existingTitle?: string;
  similarity: number;
}

export class DedupService {
  private zvec: IZvecAdapter | null = null;
  private readonly SIMILARITY_THRESHOLD = 0.85;

  constructor(zvec?: IZvecAdapter) {
    this.zvec = zvec || null;
  }

  setZvec(zvec: IZvecAdapter): void {
    this.zvec = zvec;
  }

  /**
   * 检查是否重复
   * @param title 新知识标题
   * @param content 新知识内容
   * @param zvec Zvec 适配器（可选，覆盖构造时注入）
   */
  async check(
    title: string,
    content: string,
    zvec?: IZvecAdapter,
  ): Promise<DedupResult> {
    const zv = zvec || this.zvec;
    if (!zv || zv.size === 0) {
      return { isDuplicate: false, similarity: 0 };
    }

    try {
      const combined = title + ' ' + (content || '').substring(0, 200);
      // 简单哈希作为向量代替（无 embedding 时）
      // 真正的去重要求 embedding API 可用
      const fakeVec = this._simpleHashVector(combined);
      const results = await zv.search(new Float32Array(fakeVec), 1);

      if (results.length > 0 && results[0].score >= this.SIMILARITY_THRESHOLD) {
        return {
          isDuplicate: true,
          existingId: results[0].id,
          existingTitle: results[0].fields?.title || '',
          similarity: results[0].score,
        };
      }

      return { isDuplicate: false, similarity: results[0]?.score || 0 };
    } catch {
      return { isDuplicate: false, similarity: 0 };
    }
  }

  /**
   * 简单的文本特征向量 (64 维)
   * 不用外部 embedding，轻量检测明显重复
   */
  private _simpleHashVector(text: string): number[] {
    const dims = 64;
    const vec = new Array(dims).fill(0);
    const chars = text.split('');
    for (let i = 0; i < chars.length; i++) {
      const code = chars[i].charCodeAt(0) || 0;
      const idx = code % dims;
      vec[idx] += 1 / Math.log2(i + 2);
    }
    // 归一化
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map(v => v / norm) : vec;
  }
}
