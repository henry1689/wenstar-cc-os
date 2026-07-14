/**
 * PatternSeparator.ts — 模式分离引擎 (海马体 DG 区功能)
 * =========================================================
 * 生物海马体的 DG（齿状回）负责"模式分离"——将相似的经历区分开，
 * 防止"昨天在咖啡厅"和"今天在咖啡厅"混为一谈。
 *
 * 当检索到多条高度相似的记忆时:
 *   1. 按场景指纹聚类（location/locus/entity）
 *   2. 同场景内按钙化+新颖度排序
 *   3. 保留最具区分度的 top-N
 *
 * 使用:
 *   const separator = new PatternSeparator();
 *   const distinct = separator.separate(candidates);
 */
import type { DNA } from '../../m1/types/dna.js';

export interface SeparatedResult {
  /** 分离后的记忆列表（去冗余，保留区分度最高者） */
  distinct: DNA[];
  /** 被合并的冗余数量 */
  deduped: number;
  /** 场景簇统计 */
  clusters: Array<{ label: string; count: number; avgCalcium: number }>;
}

export class PatternSeparator {
  /**
   * 对检索结果执行模式分离
   * 输入相似记忆集合 → 输出区分度最大化的子集
   */
  separate(candidates: DNA[], maxResults = 5): SeparatedResult {
    if (candidates.length <= 1) {
      return { distinct: candidates, deduped: 0, clusters: [] };
    }

    // 1. 按场景指纹聚类
    const clusters = this._clusterByScene(candidates);
    const clusterLabels = Object.keys(clusters);
    const clusterReport = clusterLabels.map(label => {
      const items = clusters[label];
      const avgCa = items.reduce((s, m) => s + (m.calcium_score || 0.5), 0) / items.length;
      return { label, count: items.length, avgCalcium: avgCa };
    });

    // 2. 从每个簇中选取最具区分度的代表
    const selected: DNA[] = [];
    const totalSlots = Math.min(maxResults, candidates.length);

    if (clusterLabels.length >= totalSlots) {
      // 簇数够多 → 每簇选最佳一个
      for (const label of clusterLabels.slice(0, totalSlots)) {
        const best = this._pickBest(clusters[label]);
        if (best) selected.push(best);
      }
    } else {
      // 簇数不够 → 大簇多选
      for (const label of clusterLabels) {
        const items = clusters[label];
        const slotsForCluster = Math.max(1, Math.floor(totalSlots / clusterLabels.length));
        const picked = items
          .sort((a, b) => (b.calcium_score || 0.5) - (a.calcium_score || 0.5))
          .slice(0, slotsForCluster);
        selected.push(...picked);
      }
    }

    const totalIn = candidates.length;
    const totalOut = selected.length;
    return {
      distinct: selected.slice(0, maxResults),
      deduped: totalIn - totalOut,
      clusters: clusterReport,
    };
  }

  /**
   * 按场景指纹聚类记忆
   * 指纹 = locus_path(主域) + entity_genes(人物) + 时间衰减
   */
  private _clusterByScene(memories: DNA[]): Record<string, DNA[]> {
    const clusters: Record<string, DNA[]> = {};

    for (const mem of memories) {
      // 提取场景指纹
      const locus = mem.locus_path?.split('.').slice(0, 2).join('.') || 'misc';
      const entities = (mem.entity_genes || [])
        .filter(e => e.type === 'person' && e.name !== '我')
        .map(e => e.name)
        .sort()
        .slice(0, 2)
        .join(',');

      // 场景标签 = 主域_关键人物
      const sceneKey = entities ? `${locus}_${entities}` : locus;

      if (!clusters[sceneKey]) clusters[sceneKey] = [];
      clusters[sceneKey].push(mem);
    }

    return clusters;
  }

  /**
   * 从一簇相似记忆中挑选"最佳代表"
   * 策略: 钙化高 + 时间新 → 更有价值
   */
  private _pickBest(cluster: DNA[]): DNA | null {
    if (cluster.length === 0) return null;
    if (cluster.length === 1) return cluster[0];

    return cluster.reduce((best, current) => {
      const bestScore = (best.calcium_score || 0.5) * 0.7 + this._recency(best.created_at) * 0.3;
      const curScore = (current.calcium_score || 0.5) * 0.7 + this._recency(current.created_at) * 0.3;
      return curScore > bestScore ? current : best;
    });
  }

  private _recency(createdAt?: string): number {
    if (!createdAt) return 0.5;
    const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
    return Math.max(0, Math.min(1, 1 - hours / 720)); // 30天内线性衰减
  }
}
