// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-08
// M5Orchestrator Core Smoke — module-level verification without running server.
// Uses MockLLMProvider (default) — zero network, zero API keys, zero fetch.
// Complements existing src/m5/__tests__/M5Orchestrator.test.ts (8 tests).
import { describe, it, expect } from 'vitest';

// Import from src/m5 — M5Orchestrator + MockLLMProvider are NOT Sentinel-protected.
// Only DeepSeekLLMProvider.ts is Sentinel-protected (handled via vitest alias).
import { M5Orchestrator } from '../../src/m5/M5Orchestrator.js';
import { MockLLMProvider } from '../../src/m5/MockLLMProvider.js';
import type { M4Context } from '../../src/m4/types/index.js';

/** Minimal M4Context that satisfies orchestrate() without DeepSeek/LLM network */
function minimalM4Context(overrides: Partial<M4Context['decision']['enhanced']> = {}): M4Context {
  return {
    decision: {
      actions: overrides.actions ?? ['memorize'],
      enhanced: {
        branch_id: 'evt_20260802_001',
        locus_path: 'user.test.smoke',
        raw_input: overrides.raw_input ?? '测试消息',
        entity_genes: [
          { name: '测试', type: 'person', allele: '测试', phenotype: 'neutral', knowledge_type: 'test' },
          { name: '我', type: 'self', allele: '我', phenotype: 'neutral', knowledge_type: 'private' },
        ],
        perception: {
          pleasure: overrides.perception?.pleasure ?? 0,
          arousal: 0.3, dominance: 0, aggression: 0,
          sincerity: 0.5, humor: 0,
          factual: 0.5, logical: 0.3, certainty: 0.5, abstract: 0.1,
          temporal_focus: 0, self_ref: 0.3,
          intimacy: 0.2, power_diff: 0, dependency: 0.1,
          moral_judgment: 0, etiquette: 0.2, belonging: 0.2,
          sexual_attraction: 0, sensory_craving: 0, energy_merge: 0,
          possessiveness: 0, ecstasy: 0, safety: 0.5,
          ...overrides.perception,
        },
        calcium_score: overrides.calcium_score ?? 0.1,
        calcium_level: (overrides.calcium_level ?? 0) as 0 | 1 | 2 | 3,
      },
      timestamp: '2026-08-02T12:00:00.000Z',
    },
    memory_summary: {
      timeline: [],
      frequentEntities: [],
      timeSpan: { earliest: '', latest: '' },
    },
    current_time: '2026-08-02T12:00:00.000Z',
    meta: {
      has_history: false,
      has_family_context: false,
      calcium_level: 0,
      dominant_action: 'memorize',
    },
  };
}

describe('[BATCH-08-M5-SMOKE] M5Orchestrator 核心链路', () => {
  // Test 1: Default constructor uses MockLLMProvider
  it('默认构造器可创建 M5Orchestrator（MockLLMProvider fallback）', () => {
    const m5 = new M5Orchestrator();
    expect(m5).toBeInstanceOf(M5Orchestrator);
    expect(typeof m5.orchestrate).toBe('function');
    expect(typeof m5.resetSession).toBe('function');
  });

  // Test 2: Explicit MockLLMProvider injection
  it('注入 MockLLMProvider 可正常调用 orchestrate', async () => {
    const llm = new MockLLMProvider();
    const m5 = new M5Orchestrator(llm);
    const reply = await m5.orchestrate(minimalM4Context());
    expect(reply).toBeTruthy();
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  // Test 3: Normal input returns structured text (not fallback error)
  it('正常输入返回非降级文本（非"抱歉"兜底）', async () => {
    const m5 = new M5Orchestrator();
    const reply = await m5.orchestrate(
      minimalM4Context({ raw_input: '帮我记一下明天的会议', actions: ['memorize'] })
    );
    expect(reply).toBeTruthy();
    // MockLLMProvider 正常生成不会返回兜底文案
    expect(reply).not.toBe('抱歉，网络好像不太稳定，请稍后再试。');
    // 兜底的会晤文案也不该出现
    expect(reply).not.toBe('…（抱歉，我暂时无法回应，请稍后再试。）');
  });

  // Test 4: Empty raw_input does not throw
  it('空输入不抛出未捕获异常', async () => {
    const m5 = new M5Orchestrator();
    let reply: string;
    try {
      reply = await m5.orchestrate(
        minimalM4Context({ raw_input: '', actions: ['memorize'] })
      );
    } catch (e) {
      // 不应到达这里
      expect(e).toBeUndefined();
      return;
    }
    expect(typeof reply).toBe('string');
  });

  // Test 5: Reset session is callable and idempotent
  it('resetSession 可重复调用不抛异常', () => {
    const m5 = new M5Orchestrator();
    expect(() => m5.resetSession()).not.toThrow();
    // 二次调用也安全
    expect(() => m5.resetSession()).not.toThrow();
  });

  // Test 6: No network dependency — MockLLMProvider generate() returns immediately
  it('MockLLMProvider generate() 返回 < 500ms（无网络依赖）', async () => {
    const llm = new MockLLMProvider();
    const start = Date.now();
    const result = await llm.generate({
      strategy: {
        strategy_id: 'com-warm',
        params: { tone: 'warm', max_length: 100, include_entity: [], include_history: false, include_family: false },
        description: 'warm support',
      },
      cognition: {
        current: {
          raw_input: '你好',
          key_entities: [],
          perception_snapshot: {
            pleasure: 0, arousal: 0, dominance: 0, aggression: 0,
            sincerity: 0.5, humor: 0, factual: 0.5, logical: 0.3,
            certainty: 0.5, abstract: 0.1, temporal_focus: 0, self_ref: 0.3,
            intimacy: 0, power_diff: 0, dependency: 0,
            moral_judgment: 0, etiquette: 0.2, belonging: 0,
            sexual_attraction: 0, sensory_craving: 0, energy_merge: 0,
            possessiveness: 0, ecstasy: 0, safety: 0.5,
          },
          affection_map: {},
          profile_snapshot: { 铁三角: [], 'M3Calcium': [], '黑钻记忆': [], family_lore: [], 沙金记忆: [] },
        },
        history: { has_relevant_history: false, last_event_branch_id: null },
        strategy_hint: { tone: 'neutral' as const, depth: 'shallow' as const },
      },
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(result.text).toBeTruthy();
  });
});
