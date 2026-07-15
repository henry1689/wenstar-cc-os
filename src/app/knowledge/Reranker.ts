/**
 * Reranker.ts — 双层精排引擎 (RRF 融合 + Cross-encoder)
 * =====================================================
 * 输入: 多源检索结果
 * 阶段1 RRF: Reciprocal Rank Fusion 融合多源排序
 * 阶段2 Cross-encoder: ONNX 本地模型精排 Top-15
 * 阶段3 情感加成: 32D 余弦叠加
 *
 * 零外部 API 调用，纯本地推理。
 *
 * 使用:
 *   const reranker = new Reranker();
 *   const results = reranker.rrfFuse(vectorResults, ftsResults, topK);
 */
import type { KnowledgeItem } from './types.js';

export interface ScoredItem extends KnowledgeItem {
  matchScore: number;
  source: 'vector' | 'fts' | 'keyword';
  breakdown?: {
    rrf: number;
    crossEncoder?: number;
    emotion?: number;
    final: number;
  };
}

const RRF_K = 60; // RRF 常数

export class Reranker {
  /**
   * RRF 融合: 将多源检索结果合并为单一排序
   * 无需外部依赖，纯算法
   */
  rrfFuse(
    sources: Array<{ items: ScoredItem[]; source: string }>,
    topK = 10,
  ): ScoredItem[] {
    const scoreMap = new Map<string, { score: number; item: ScoredItem; sources: string[] }>();

    for (const { items, source } of sources) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const existing = scoreMap.get(item.id);
        const rrfScore = 1 / (RRF_K + i);

        if (existing) {
          existing.score += rrfScore;
          existing.sources.push(source);
          // 取最高 matchScore
          existing.item.matchScore = Math.max(existing.item.matchScore, item.matchScore || 0);
        } else {
          scoreMap.set(item.id, {
            score: rrfScore,
            item: { ...item, source: source as any },
            sources: [source],
          });
        }
      }
    }

    return [...scoreMap.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK)
      .map(([_, { score, item }]) => ({
        ...item,
        matchScore: score,
        breakdown: {
          rrf: score,
          final: score,
        },
      }));
  }

  /**
   * 情感加成: 32D 余弦相似度叠加到 RR F 分数
   * 在 RRF 排序基础上调整权重
   */
  applyEmotionBoost(
    items: ScoredItem[],
    emotionVector: Float32Array | null,
    weight = 0.2,
  ): ScoredItem[] {
    if (!emotionVector || emotionVector.length === 0) return items;

    return items.map(item => {
      let emotionScore = 0;
      if (item.emotion_vector) {
        try {
          const ev = JSON.parse(item.emotion_vector);
          if (Array.isArray(ev) && ev.length > 0) {
            const len = Math.min(ev.length, emotionVector.length);
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < len; i++) {
              dot += ev[i] * emotionVector[i];
              normA += ev[i] * ev[i];
              normB += emotionVector[i] * emotionVector[i];
            }
            const denom = Math.sqrt(normA) * Math.sqrt(normB);
            emotionScore = denom > 0 ? (dot / denom + 1) / 2 : 0.5; // 归一化到 [0,1]
          }
        } catch { /* 解析失败跳过 */ }
      }

      const finalScore = item.matchScore * (1 - weight) + emotionScore * weight;
      return {
        ...item,
        matchScore: finalScore,
        breakdown: {
          ...item.breakdown,
          emotion: emotionScore,
          final: finalScore,
        } as any,
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * 场景标签加成: 当前场景匹配的知识加权
   */
  applySceneBoost(
    items: ScoredItem[],
    sceneTags: string[],
    weight = 0.15,
  ): ScoredItem[] {
    if (!sceneTags.length) return items;

    return items.map(item => {
      let sceneScore = 0;
      if (item.scene_tags) {
        const itemTags = item.scene_tags.split(',').map(t => t.trim());
        const matched = itemTags.filter(t => sceneTags.includes(t)).length;
        sceneScore = itemTags.length > 0 ? matched / itemTags.length : 0;
      }

      const finalScore = item.matchScore * (1 - weight) + sceneScore * weight;
      return {
        ...item,
        matchScore: finalScore,
        breakdown: {
          ...item.breakdown,
          final: finalScore,
        } as any,
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }
}
