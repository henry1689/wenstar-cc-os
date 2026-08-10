/**
 * retrieval-fusion-config — 天枢检索融合权重配置加载器
 * ============================================================
 * 从 config/retrieval-fusion.config.yaml 读取所有权重/预算/阈值，
 * 供 MemoryInjector / RRFFusion / fusion.ts 使用，消除 ts 硬编码魔法数字。
 *
 * 铁律：所有权重数字只在此 yaml 定义，代码通过本模块读取。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'config', 'retrieval-fusion.config.yaml');

/** 注入层权重 */
export interface InjectPriorityConfig {
  archive_tag: number;
  black_diamond: number;
  vault: number;
  memory_normal: number;
}
export interface TimelineWeightConfig {
  base: number;
  scale: number;
  cap: number;
  min_val: number;
}
export interface BudgetConfig {
  mem_ratio_normal: number;
  kb_ratio_normal: number;
  mem_ratio_longtext: number;
  kb_ratio_longtext: number;
  longtext_max_ratio: number;
  work_max_chars: number;
  hard_max_chars: number;
}
export interface FilterConfig {
  min_similarity: number;
  max_fusion_items: number;
}

export interface RetrievalFusionConfig {
  inject_priority: InjectPriorityConfig;
  timeline_weight: TimelineWeightConfig;
  foundation_rrf_domain_weight: Record<string, number>;
  v13_rrf_weights: Record<string, number> & { multi_hit_bonus: number };
  budget: BudgetConfig;
  filter: FilterConfig;
}

// ── 默认值（yaml 缺失时兜底，保持系统可用）──
const DEFAULTS: RetrievalFusionConfig = {
  inject_priority: { archive_tag: 0.95, black_diamond: 0.9, vault: 0.7, memory_normal: 0.6 },
  timeline_weight: { base: 0.3, scale: 0.2, cap: 0.9, min_val: 0.6 },
  foundation_rrf_domain_weight: { black_diamond: 0.25, vault: 0.12, knowledge: 0.15, sand_memory: 0.1 },
  v13_rrf_weights: { spine: 0.35, keyword: 0.3, work: 0.25, entity: 0.2, emotion: 0.1, locus: 0.05, multi_hit_bonus: 1.2 },
  budget: { mem_ratio_normal: 0.6, kb_ratio_normal: 0.4, mem_ratio_longtext: 0.3, kb_ratio_longtext: 0.15, longtext_max_ratio: 0.8, work_max_chars: 4000, hard_max_chars: 8000 },
  filter: { min_similarity: 0.6, max_fusion_items: 16 },
};

let _cache: RetrievalFusionConfig | null = null;

/** 加载配置（带缓存） */
export function getRetrievalFusionConfig(): RetrievalFusionConfig {
  if (_cache) return _cache;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = YAML.parse(raw) as Partial<RetrievalFusionConfig>;
    // 深合并默认值
    _cache = {
      inject_priority: { ...DEFAULTS.inject_priority, ...(parsed.inject_priority || {}) },
      timeline_weight: { ...DEFAULTS.timeline_weight, ...(parsed.timeline_weight || {}) },
      foundation_rrf_domain_weight: { ...DEFAULTS.foundation_rrf_domain_weight, ...(parsed.foundation_rrf_domain_weight || {}) },
      v13_rrf_weights: { ...DEFAULTS.v13_rrf_weights, ...(parsed.v13_rrf_weights || {}) },
      budget: { ...DEFAULTS.budget, ...(parsed.budget || {}) },
      filter: { ...DEFAULTS.filter, ...(parsed.filter || {}) },
    };
  } catch (e) {
    console.warn('[RetrievalFusionConfig] yaml 加载失败，使用默认值:', (e as Error)?.message);
    _cache = DEFAULTS;
  }
  return _cache;
}

/** 重新加载（配置变更后调用） */
export function reloadRetrievalFusionConfig(): RetrievalFusionConfig {
  _cache = null;
  return getRetrievalFusionConfig();
}
