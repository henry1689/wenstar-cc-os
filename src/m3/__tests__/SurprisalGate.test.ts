/**
 * SurprisalGate.test.ts — 惊奇值门控单元测试
 */
import { describe, it, expect } from 'vitest';
import { SurprisalGate } from '../SurprisalGate.js';

describe('SurprisalGate', () => {
  const makeInput = (content: string, calcium: number) => ({
    namespace: 'default',
    belongEntityUuid: 'test-uuid',
    content,
    calciumScore: calcium,
    timestampMs: Date.now(),
  });

  it('默认关闭 → 始终放行', () => {
    const gate = new SurprisalGate();
    const r = gate.evaluate(makeInput('任何内容', 0.5), []);
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('gate_disabled');
  });

  it('首条记忆 → 始终放行', () => {
    const gate = new SurprisalGate({ enabled: true, dryRun: false });
    const r = gate.evaluate(makeInput('第一条', 0.5), []);
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('first_memory');
  });

  it('高新奇内容 → 放行', () => {
    const gate = new SurprisalGate({ enabled: true, dryRun: false });
    const recent = ['今天天气真好', '昨天去了公园', '妈妈身体不太好'];
    const r = gate.evaluate(makeInput('我决定辞职去环游世界', 0.5), recent);
    expect(r.shouldWrite).toBe(true);
    expect(r.noveltyScore).toBeGreaterThan(0.3);
  });

  it('高钙化记忆 → 白名单放行(即使内容重复)', () => {
    const gate = new SurprisalGate({ enabled: true, dryRun: false });
    const recent = ['妈妈身体不好我很担心', '妈妈身体不好我很担心', '妈妈身体不好我很担心'];
    const r = gate.evaluate(makeInput('妈妈身体不好我很担心', 2.5), recent);
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('high_calcium_whitelist');
  });

  it('低新奇+低钙化 → 拦截(非dryRun)', () => {
    const gate = new SurprisalGate({ enabled: true, dryRun: false });
    const recent = ['今天天气真好', '今天天气太好了', '今天天气真的很好'];
    const r = gate.evaluate(makeInput('今天天气真好', 0.3), recent);
    // 高重复内容 → 低新奇
    expect(r.noveltyScore).toBeLessThan(0.3);
    // calcium < 2.0 → 拦截
    expect(r.shouldWrite).toBe(false);
  });

  it('dryRun 模式 → 低新奇也不真拦截', () => {
    const gate = new SurprisalGate({ enabled: true, dryRun: true });
    const recent = ['今天天气真好', '今天天气太好了', '今天天气真的很好'];
    const r = gate.evaluate(makeInput('今天天气真好', 0.3), recent);
    // dryRun 放行但有标记
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('would_block_dryrun');
  });

  it('noveltyScore 值域 [0,1]', () => {
    const gate = new SurprisalGate({ enabled: true, dryRun: false });
    const r1 = gate.evaluate(makeInput('完全不同的内容XYZ', 1.0), ['日常对话1', '日常对话2']);
    expect(r1.noveltyScore).toBeGreaterThanOrEqual(0);
    expect(r1.noveltyScore).toBeLessThanOrEqual(1);

    const r2 = gate.evaluate(makeInput('日常对话1', 1.0), ['日常对话1']);
    expect(r2.noveltyScore).toBeGreaterThanOrEqual(0);
    expect(r2.noveltyScore).toBeLessThanOrEqual(1);
  });
});
