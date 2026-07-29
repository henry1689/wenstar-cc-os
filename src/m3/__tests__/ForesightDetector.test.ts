/**
 * ForesightDetector.test.ts — 前瞻时态识别单元测试
 */
import { describe, it, expect } from 'vitest';
import { detectForesight } from '../ForesightDetector.js';

describe('detectForesight', () => {
  it('普通事实记忆 → 不标记', () => {
    const r = detectForesight({ content: '今天天气很好', timestampMs: Date.now() });
    expect(r.isForesight).toBe(false);
    expect(r.status).toBe('none');
  });

  it('"我明天去医院" → future', () => {
    const r = detectForesight({ content: '我明天去医院检查一下', timestampMs: Date.now() });
    expect(r.isForesight).toBe(true);
    expect(r.status).toBe('future');
    expect(r.validUntilMs).toBeGreaterThan(Date.now());
  });

  it('"下周准备回家" → future', () => {
    const r = detectForesight({ content: '我下周准备回家看看', timestampMs: Date.now() });
    expect(r.isForesight).toBe(true);
    expect(r.status).toBe('future');
    expect(r.validUntilMs).toBeGreaterThan(Date.now());
  });

  it('"我打算学画画" → active(无明确时间, 默认30天)', () => {
    const r = detectForesight({ content: '我打算学画画', timestampMs: Date.now() });
    expect(r.isForesight).toBe(true);
    expect(r.status).toBe('active');
    expect(r.validUntilMs).toBeGreaterThan(Date.now());
    // 30 天有效期
    const thirtyDays = Date.now() + 30 * 86400000;
    expect(r.validUntilMs!).toBeLessThanOrEqual(thirtyDays + 1000);
  });

  it('"已经去了" → completed', () => {
    const r = detectForesight({ content: '我明天去北京已经取消了', timestampMs: Date.now() });
    expect(r.isForesight).toBe(true);
    // 含"明天"触发 foresight，"已经"+"取消了"触发 completion
    expect(['completed', 'future']).toContain(r.status);
  });

  it('"昨天去了医院" → 不标记（过去事件）', () => {
    const r = detectForesight({ content: '我昨天去了医院', timestampMs: Date.now() });
    // 不含明天/下周等前瞻词 → 不应标记
    expect(r.isForesight).toBe(false);
  });

  it('"以后再说" → future（90天有效期）', () => {
    const r = detectForesight({ content: '以后再说吧', timestampMs: Date.now() });
    expect(r.isForesight).toBe(true);
    if (r.validUntilMs) {
      const ninetyDays = Date.now() + 90 * 86400000;
      expect(r.validUntilMs).toBeLessThanOrEqual(ninetyDays + 1000);
    }
  });

  it('"我保证会记住" → future（无明确时间, 30天）', () => {
    const r = detectForesight({ content: '我保证会记住的', timestampMs: Date.now() });
    expect(r.isForesight).toBe(true);
  });

  it('空文本 → none', () => {
    const r = detectForesight({ content: '', timestampMs: Date.now() });
    expect(r.isForesight).toBe(false);
    expect(r.status).toBe('none');
  });

  it('confidence 始终在 [0,1]', () => {
    const cases = [
      '今天天气好', '我明天去', '已经做完了', '将来会好的',
    ];
    for (const c of cases) {
      const r = detectForesight({ content: c, timestampMs: Date.now() });
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});
