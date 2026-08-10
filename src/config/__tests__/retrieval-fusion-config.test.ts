import { describe, it, expect } from 'vitest';
import { getRetrievalFusionConfig } from '../retrieval-fusion-config.js';
describe('retrieval-fusion-config', () => {
  it('加载 yaml 配置', () => {
    const cfg = getRetrievalFusionConfig();
    expect(cfg.inject_priority.vault).toBe(0.7);
    expect(cfg.inject_priority.black_diamond).toBe(0.9);
    expect(cfg.timeline_weight.min_val).toBe(0.6);
    expect(cfg.budget.hard_max_chars).toBe(8000);
    expect(cfg.budget.mem_ratio_normal).toBe(0.6);
  });
});
