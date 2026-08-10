/**
 * VectorReranker — 自有32D语义向量精排引擎 (V11.0)
 * ==================================================
 * 对n-gram初筛后的候选记忆集合，用自有32维仿生心智向量做精细化重排。
 *
 * 核心能力：
 *   - 24维全维度余弦相似度（复用 memories.perception_json）
 *   - 情绪维度优先加权（00~05维外源情绪频谱）
 *   - 记忆衰减系数距离修正（新鲜高确信记忆前置）
 *   - 三档检索力度开关（内敛/均衡/全开）
 *
 * 设计原则（蓝皮书级硬约束）：
 *   - 零外部API，全量本地计算
 *   - n-gram不参与最终排序，排序权完全交给自有32D向量
 *   - 加权规则可配置
 */

import type { Perception24D } from '../m3/types/perception.js';
import type { PerceptionV40 } from '../m3/types/perception-40d.js';
import { PERCEPTION_40D_KEYS } from '../m3/types/perception-40d.js';
import { decodePerceptionV40, cosineSimilarity40D, arrayToPerceptionV40 } from '../m2/PerceptionVector40DCodec.js';
import { isPerception40DEnabled } from '../config/perception-40d-config.js';

// ── 可配置加权参数 ──
export interface RerankerConfig {
  /** 情绪频谱权重 (00-05维) */
  emotionWeight: number;
  /** 全维度语义权重 */
  fullDimWeight: number;
  /** 钙化分权重 */
  calciumWeight: number;
  /** 衰减惩罚系数 λ */
  decayLambda: number;
  /** 置信度增益系数 β */
  confidenceBeta: number;
  /** 检索力度: 内敛(20) | 均衡(50) | 全开(100) */
  ef: number;
  /** 钙化分最低门槛 */
  minCalciumLevel: number;
}

export type SearchMode = 'introvert' | 'balanced' | 'full';

const MODE_CONFIGS: Record<SearchMode, RerankerConfig> = {
  introvert: {
    emotionWeight: 0.40, fullDimWeight: 0.20, calciumWeight: 0.25,
    decayLambda: 0.03, confidenceBeta: 0.10,
    ef: 20, minCalciumLevel: 1,
  },
  balanced: {
    emotionWeight: 0.35, fullDimWeight: 0.25, calciumWeight: 0.20,
    decayLambda: 0.02, confidenceBeta: 0.10,
    ef: 50, minCalciumLevel: 0,
  },
  full: {
    emotionWeight: 0.30, fullDimWeight: 0.30, calciumWeight: 0.15,
    decayLambda: 0.01, confidenceBeta: 0.15,
    ef: 100, minCalciumLevel: 0,
  },
};

/** 候选记忆条目（统一接口） */
export interface MemoryCandidate {
  id: string;
  text: string;                               // 记忆文本
  source: 'conversation' | 'memory' | 'black_diamond' | 'knowledge_base';
  perceptionJson?: string | null;             // JSON: Perception24D
  perception40d?: string | null;              // V20: JSON: PerceptionV40（40D 数组，混合检索优先用）
  calciumScore?: number;
  calciumLevel?: number;
  confidenceScore?: number;
  effectiveStrength?: number;
  createdAt?: string;
  entityUuid?: string | null;
}

/** 排序后的记忆条目 */
export interface RankedMemory {
  item: MemoryCandidate;
  score: number;          // 综合得分 0~1
  emotionSim: number;     // 情绪维度相似度
  fullSim: number;        // 全维度相似度
  decay: number;          // 衰减系数
}

/**
 * 余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 将 Perception24D 转为数值数组（保持固定24维顺序）
 */
export function perceptionToArray(p: Perception24D): number[] {
  return [
    p.pleasure, p.arousal, p.dominance, p.aggression,
    p.sincerity, p.humor, p.factual, p.logical,
    p.certainty, p.abstract, p.temporal_focus, p.self_ref,
    p.intimacy, p.power_diff, p.dependency, p.moral_judgment,
    p.etiquette, p.belonging, p.sexual_attraction, p.sensory_craving,
    p.energy_merge, p.possessiveness, p.ecstasy, p.safety,
  ];
}

/** V12.4 阶段B 根除24D: 40D → 24D 反解映射（dim40 1-indexed → 24D 数组索引）。
 *  🔴 仅 14 维可反解（与 SQLiteAdapter.rowToRecord 同源），无槽位 10 维填中性 0.5。
 *  `perceptionJson` 字段现已承载 perception_40d v2 JSON，24D 回退路径需正确解码避免 NaN。 */
const REVERSE_40_TO_24: ReadonlyArray<[number, number]> = [
  [12, 0],  // D12 pleasure → 24D[0]
  [36, 2],  // D36 dominance → 24D[2]
  [35, 4],  // D35 sincerity → 24D[4]
  [38, 5],  // D38 humor → 24D[5]
  [9, 11],  // D09 self_ref → 24D[11]
  [15, 12], // D15 intimacy → 24D[12]
  [39, 14], // D39 dependency → 24D[14]
  [37, 15], // D37 moral_judgment → 24D[15]
  [19, 16], // D19 etiquette → 24D[16]
  [17, 17], // D17 belonging → 24D[17]
  [33, 18], // D33 sexual_attraction → 24D[18]
  [34, 20], // D34 energy_merge → 24D[20]
  [40, 21], // D40 possessiveness → 24D[21]
  [14, 23], // D14 safety → 24D[23]
];
function perceptionV40ArrayTo24DArray(dims40: number[]): number[] {
  const out = new Array(24).fill(0.5); // 无槽位 10 维中性
  for (const [dim40, idx24] of REVERSE_40_TO_24) {
    const v = Number(dims40[dim40 - 1]);
    if (isFinite(v)) out[idx24] = v;
  }
  return out;
}

/** V12.4 阶段B 根除24D: PerceptionV40 对象 → 24D 数值数组（供 record.perceptionV40 反解，Offline 图等复用） */
export function perceptionV40ObjectTo24DArray(p40: PerceptionV40): number[] {
  const dims40 = PERCEPTION_40D_KEYS.map(k => p40[k] ?? 0);
  return perceptionV40ArrayTo24DArray(dims40);
}

/**
 * 解析存储的 JSON 向量为数值数组（24D）
 * 兼容：24元素数组 / 24D 命名对象 / 40D v2对象({__v:2,dims}) / 40D v1纯数组(40元素)
 */
export function parseStoredVector(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length === 24 && parsed.every((v: unknown) => typeof v === 'number')) {
      return parsed;
    }
    if (Array.isArray(parsed) && parsed.length === 40 && parsed.every((v: unknown) => typeof v === 'number')) {
      return perceptionV40ArrayTo24DArray(parsed);
    }
    // 对象格式 → 40D v2（{__v:2,dims}）→ 反解；否则按 24D 命名对象转数组
    if (parsed && typeof parsed === 'object') {
      const dims = (parsed as { dims?: unknown }).dims;
      if (Array.isArray(dims) && dims.length === 40 && dims.every((v: unknown) => typeof v === 'number')) {
        return perceptionV40ArrayTo24DArray(dims as number[]);
      }
      return perceptionToArray(parsed as Perception24D);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 对候选记忆集合做32D向量精排
 *
 * @param candidates  n-gram初筛后的候选集
 * @param queryVec    查询向量（24维数组，来自当前感知/外源情绪）
 * @param mode        检索力度模式
 * @returns 按综合得分降序排列的排序结果
 */
export function rankByVector(
  candidates: MemoryCandidate[],
  queryVec: number[],
  mode: SearchMode = 'balanced',
  queryVec40D?: number[] | null,
): RankedMemory[] {
  if (candidates.length === 0) return [];

  const cfg = MODE_CONFIGS[mode];
  const results: RankedMemory[] = [];

  for (const item of candidates) {
    // 1. 钙化门槛过滤
    if ((item.calciumLevel ?? 1) < cfg.minCalciumLevel) continue;

    // V20: 混合检索 — 开关开启且有 40D 感知向量则走 40D 扇区加权余弦，无则回退 24D
    const p40 = isPerception40DEnabled() ? decodePerceptionV40(item.perception40d) : null;
    const q40 = p40 && queryVec40D && queryVec40D.length === 40 ? arrayToPerceptionV40(queryVec40D) : null;
    if (p40 && q40) {
      const sim40 = cosineSimilarity40D(q40, p40);
      const decay = item.createdAt
        ? Math.exp(-cfg.decayLambda * ((Date.now() - new Date(item.createdAt).getTime()) / 86_400_000))
        : 1;
      const confidence = 1 + ((item.confidenceScore ?? 0.5) - 0.5) * cfg.confidenceBeta;
      const calcium = (item.calciumScore ?? 1) / 10;
      let score = cfg.emotionWeight * sim40
                + cfg.fullDimWeight * sim40
                + cfg.calciumWeight * calcium
                + cfg.confidenceBeta * confidence
                + 0.10 * decay;
      if ((item.effectiveStrength ?? 1) < 0.3) score *= 0.7;
      results.push({ item, score: Math.min(score, 1), emotionSim: sim40, fullSim: sim40, decay });
      continue;
    }

    // 2b. 无 40D → 回退 24D 路径
    const storedVec = parseStoredVector(item.perceptionJson);
    if (!storedVec) {
      // 无向量信息 → 只能用钙化分做基础得分
      const score = (item.calciumScore ?? 0.5) / 10 * cfg.calciumWeight;
      results.push({
        item, score: Math.min(score, 1),
        emotionSim: 0, fullSim: 0, decay: 1,
      });
      continue;
    }

    // 3. 情绪维度相似度（00-05维: pleasure/arousal/dominance/aggression/sincerity/humor）
    const emotionSim = cosineSimilarity(
      queryVec.slice(0, 6),
      storedVec.slice(0, 6),
    );

    // 4. 全维度相似度
    const fullSim = cosineSimilarity(queryVec, storedVec);

    // 5. 衰减惩罚
    const daysSinceCreation = item.createdAt
      ? (Date.now() - new Date(item.createdAt).getTime()) / 86_400_000
      : 1;
    const decay = Math.exp(-cfg.decayLambda * daysSinceCreation);

    // 6. 置信度增益
    const confidence = 1 + ((item.confidenceScore ?? 0.5) - 0.5) * cfg.confidenceBeta;

    // 7. 钙化归一化
    const calcium = (item.calciumScore ?? 1) / 10;

    // 8. 综合得分
    let score = cfg.emotionWeight * emotionSim
              + cfg.fullDimWeight * fullSim
              + cfg.calciumWeight * calcium
              + cfg.confidenceBeta * confidence  // confidence 系数重映射
              + 0.10 * decay;

    // 有效强度修正
    if ((item.effectiveStrength ?? 1) < 0.3) score *= 0.7;

    results.push({
      item,
      score: Math.min(score, 1),
      emotionSim,
      fullSim,
      decay,
    });
  }

  // 排序
  results.sort((a, b) => b.score - a.score);

  // ef 截断
  const capped = results.slice(0, cfg.ef);
  return capped;
}

export function getModeConfig(mode: SearchMode): RerankerConfig {
  return MODE_CONFIGS[mode];
}

export default { cosineSimilarity, perceptionToArray, parseStoredVector, rankByVector, getModeConfig };
