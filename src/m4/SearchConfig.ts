/**
 * SearchConfig — 七层仿生检索管线全局配置 (V13.0)
 * ================================================
 * Sprint 1-3 所有模块的 feature flag 和参数集中管理。
 * 每个模块可独立关闭，失败时自动降级。
 */

import type { RRFConfig } from './RRFFusion.js';
import type { MMRConfig } from './MMRDiversifier.js';

export interface FullSearchPipelineConfig {
  // ── L3 RRF 融合 ──
  enableRRF: boolean;
  rrfTopK: number;
  rrfConfig: RRFConfig;

  // ── L4 DAG 闭包 ──
  enableDAGClosure: boolean;
  closureMaxDepth: number;
  closureMaxNodes: number;
  skeletonMaxNodes: number;
  skeletonMaxEdges: number;

  // ── L5 Cross-Encoder ──
  enableCrossEncoder: boolean;
  crossEncoderTopK: number;
  crossEncoderBatchSize: number;
  crossEncoderTimeoutMs: number;

  // ── L6 Foresight 时效过滤 ──
  enableForesightFilter: boolean;
  foresightIncludeExpired: boolean;

  // ── L6 MMR 多样性 ──
  enableMMR: boolean;
  mmrConfig: MMRConfig;

  // ── L7 叙事组装 ──
  enableNarrativeAssembler: boolean;
  narrativeMaxTokens: number;

  // ── 全局 ──
  maxTotalLatencyMs: number;
}

/** 默认：Phase3 新模块全部开启，所有失败自动降级 */
export const DEFAULT_FULL_PIPELINE_CONFIG: FullSearchPipelineConfig = {
  enableRRF: true,
  rrfTopK: 50,
  rrfConfig: { k: 60, weights: { spine: 0.35, keyword: 0.30, entity: 0.20, emotion: 0.10, locus: 0.05 }, multiHitBonus: 1.2 },

  enableDAGClosure: false,   // Sprint 2: 默认关闭，手动开启
  closureMaxDepth: 2,
  closureMaxNodes: 80,
  skeletonMaxNodes: 30,
  skeletonMaxEdges: 50,

  enableCrossEncoder: false,  // Sprint 3: 默认关闭，等 ONNX 模型就绪
  crossEncoderTopK: 20,
  crossEncoderBatchSize: 4,
  crossEncoderTimeoutMs: 1500,

  enableForesightFilter: true,
  foresightIncludeExpired: false,

  enableMMR: true,
  mmrConfig: { lambda: 0.7, topK: 10 },

  enableNarrativeAssembler: false,  // Sprint 3: 默认关闭，手动开启
  narrativeMaxTokens: 800,

  maxTotalLatencyMs: 2000,
};

/** 降级策略：逐模块失败回退 */
export const DEGRADATION_RULES: Record<string, string> = {
  RRF:           'fallback_old_search_sort',
  DAGClosure:    'return_seed_only',
  Skeleton:      'return_unpruned_topk',
  CrossEncoder:  'fallback_noop',
  Foresight:     'skip_filter_add_warning',
  MMR:           'simple_topk',
  Narrative:     'return_plain_searchresult',
};
