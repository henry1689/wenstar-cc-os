import { describe, it, expect } from 'vitest';
import { PerceptionAnalyzer } from '../m3/PerceptionAnalyzer.js';
import { createEmptyPerceptionV40 } from '../m3/types/perception-40d.js';
import { normalizeStandardValue, fillObjectiveDims } from '../m2/YaoguangNormalizer.js';

describe('P2: M3 直接产出 40D 语义维', () => {
  it('buildPerceptionV40 结构完整（40 维）', () => {
    const analyzer = new PerceptionAnalyzer();
    const enhanced = analyzer.analyzeText('想你了亲爱的');
    const p40 = analyzer.buildPerceptionV40(enhanced.perception);
    expect(Object.keys(p40).length).toBe(40);
  });

  it('buildPerceptionV40 产出非零伴侣纹理维（同源）', () => {
    const analyzer = new PerceptionAnalyzer();
    const enhanced = analyzer.analyzeText('想你了亲爱的');
    const p40 = analyzer.buildPerceptionV40(enhanced.perception);
    expect(p40.d15_partner_attachment).toBeGreaterThan(0);   // intimacy > 0
    expect(p40.d33_sexual_attraction).toBeGreaterThan(0);    // sexual_attraction > 0
  });

  it('buildPerceptionV40 与 24D 同源（投影一致）', () => {
    const analyzer = new PerceptionAnalyzer();
    const text = '今天工作很累，但回家看到你真的很开心，我爱你';
    const enhanced = analyzer.analyzeText(text);
    const p40 = analyzer.buildPerceptionV40(enhanced.perception);
    expect(p40.d35_sincerity).toBe(enhanced.perception.sincerity);
    expect(p40.d36_dominance).toBe(enhanced.perception.dominance);
  });

  it('normalizeStandardValue 瑶光 medical → [0,1]', () => {
    expect(normalizeStandardValue(50, [25, 65])).toBeCloseTo(0.625, 3);
    expect(normalizeStandardValue(0.9, [0.5, 1.6])).toBeCloseTo(0.364, 3);
    expect(normalizeStandardValue(0.2, [-1, 1], true)).toBeCloseTo(0.6, 3);
    expect(Number.isNaN(normalizeStandardValue(undefined, [0, 1]))).toBe(true);
  });

  it('fillObjectiveDims 填充瑶光客观维 + 语义维以 M3 为准', () => {
    const base = createEmptyPerceptionV40();
    base.d35_sincerity = 0.8; // M3 语义维
    base.d12_enjoyment = 0.3; // M3 语义维（D12）
    const objective = {
      d1: { standard_value: 0.9, standard_range: [0.5, 1.6] as [number, number] },
      d10: { standard_value: 5, standard_range: [0, 20] as [number, number] },
      d12: { standard_value: 50, standard_range: [25, 65] as [number, number] }, // 语义维，应跳过
      d36: { standard_value: 0.2, standard_range: [-1, 1] as [number, number] }, // 语义维，应跳过
    };
    const merged = fillObjectiveDims(base, objective);
    // 瑶光客观维填充（D1 血乳酸、D10 欲望）
    expect(merged.d01_muscle_load).toBeCloseTo(0.364, 3);
    expect(merged.d10_desire_drive).toBeCloseTo(0.25, 3);
    // 语义维以 M3 为准（瑶光不覆盖 D12/D36，保持 base 值）
    expect(merged.d12_enjoyment).toBe(0.3);
    expect(merged.d36_dominance).toBe(0);
    expect(merged.d35_sincerity).toBe(0.8);
  });
});
