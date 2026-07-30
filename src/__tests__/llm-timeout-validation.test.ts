/**
 * S5 测试 — LLM 超时配置改动验证
 * 改动：llm-config.ts 场景超时提升 3-6x，DeepSeekLLMProvider 读场景配置
 */
import { describe, it, expect } from 'vitest';
import { getScenarioConfig, selectLLMConfig, SCENARIO_CONFIGS } from '../common/const/llm-config.js';

describe('llm-config 场景超时改动', () => {
  it('所有场景超时 ≥ 30s', () => {
    for (const [name, cfg] of Object.entries(SCENARIO_CONFIGS)) {
      expect(cfg.timeoutMs, `${name} timeout 太短`).toBeGreaterThanOrEqual(30_000);
    }
  });

  it('日常对话 ≥ 45s', () => {
    const cfg = getScenarioConfig('daily');
    expect(cfg.timeoutMs).toBeGreaterThanOrEqual(45_000);
  });

  it('亲密场景 ≥ 60s', () => {
    const cfg = getScenarioConfig('intimate');
    expect(cfg.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('角色扮演/会晤 ≥ 60s', () => {
    const cfg = getScenarioConfig('roleplay');
    expect(cfg.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('简短模式 ≥ 30s', () => {
    const cfg = getScenarioConfig('short_mode');
    expect(cfg.timeoutMs).toBeGreaterThanOrEqual(30_000);
  });

  it('回忆 ≥ 45s', () => {
    const cfg = getScenarioConfig('recall');
    expect(cfg.timeoutMs).toBeGreaterThanOrEqual(45_000);
  });

  it('运行时路由：日常返回 45s 超时', () => {
    const cfg = selectLLMConfig(0, '今天天气不错', 'secretary');
    expect(cfg.timeoutMs).toBe(45_000);
  });

  it('运行时路由：亲密返回 60s 超时', () => {
    const cfg = selectLLMConfig(2, '我想要你', 'lover');
    expect(cfg.timeoutMs).toBe(60_000);
  });

  it('运行时路由：会晤返回 60s 超时', () => {
    const cfg = selectLLMConfig(0, '你好', 'recaller');
    expect(cfg.timeoutMs).toBe(60_000);
  });

  it('场景数量不变（5个场景，无增删）', () => {
    expect(Object.keys(SCENARIO_CONFIGS).length).toBe(5);
  });
});
