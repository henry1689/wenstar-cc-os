import { describe, it, expect } from 'vitest';
import { M3LogicOrchestrator } from 'D:/tools/wenstar-cc/src/m3/M3LogicOrchestrator.js';
import { fillObjectiveDims, buildFallbackV40 } from 'D:/tools/wenstar-cc/src/m2/YaoguangNormalizer.js';
import { encodePerceptionV40, decodePerceptionV40 } from 'D:/tools/wenstar-cc/src/m2/PerceptionVector40DCodec.js';

// 模拟瑶光 objective（40 维 medical 值，带 standard_range）
function mockYaoguangObjective(): Record<string, any> {
  const obj: Record<string, any> = {};
  const dims: Array<[number, number, number, boolean]> = [
    // [dim, value, range_hi, bipolar]
    [1, 0.9, 1.6, false], [2, 0.3, 2, false], [3, 35, 55, false], [4, 8, 25, false],
    [5, 0, 1, false], [6, 0, 10, false], [7, 1.1, 1.5, false], [8, 40, 60, false],
    [9, 32, 40, false], [10, 5, 20, false], [11, 30, 49, false], [12, 50, 65, false],
    [13, 0.4, 0.6, false], [14, 0.3, 0.5, false], [15, 55, 70, false], [16, 14, 25, false],
    [17, 35, 45, false], [18, 14, 25, false], [19, 2, 8, false], [20, 0.2, 0.4, false],
    [21, 5, 10, false], [22, 80, 95, false], [23, 14, 22, false], [24, 35, 55, false],
    [25, 14, 22, false], [26, 30, 50, false], [27, 0.1, 0.3, false], [28, 5, 20, false],
    [29, 5, 20, false], [30, 10, 25, false], [31, 40, 50, false], [32, 75, 90, false],
    [33, 0.6, 1, false], [34, 0.8, 1, false], [35, 0.7, 1, false],
    [36, 0.2, 1, true], [37, 0.05, 1, true], [38, 0.55, 1, false],
    [39, 0.6, 1, false], [40, 0.5, 1, false],
  ];
  for (const [dim, value, hi, bipolar] of dims) {
    const lo = bipolar ? -1 : (dim <= 5 ? 0 : (dim === 6 ? -10 : (dim === 19 ? 0 : 0)));
    const loMap: Record<number, number> = { 7: 0.8, 9: 22, 12: 25, 13: 0.2, 15: 35, 17: 25, 20: 0, 21: 2, 22: 60, 23: 8, 25: 8, 26: 15, 28: 0, 29: 0, 30: 0, 31: 30, 32: 60 };
    const rangeLo = loMap[dim] ?? 0;
    obj[`d${dim}`] = {
      standard_value: value,
      standard_range: [rangeLo, hi],
      label: `D${dim}`,
      context: { baseline: (rangeLo + hi) / 2 },
    };
  }
  return obj;
}

describe('P5: 集成验证 — M3 产 40D → 瑶光回填 → 检索', () => {
  it('完整链路：M3 decide 产出 40D 语义维', () => {
    const m3 = new M3LogicOrchestrator();
    const dna: any = {
      branch_id: 'evt_001', locus_path: 'user.misc.default',
      taxonomy_version: '1.0', seq_pos: 0, leaf_zone: 'language_semantic_zone',
      ref: 'tmp', entity_genes: [], created_at: new Date().toISOString(),
      raw_input: '想你了亲爱的，今天好累但看到你真好',
    };
    const decision = m3.decide(dna, { current_time: new Date().toISOString(), current_location: '深圳' });
    // M3 直接产出 40D
    expect(decision.enhanced.perceptionV40).toBeDefined();
    expect(Object.keys(decision.enhanced.perceptionV40!).length).toBe(40);
    // 语义维非零（亲密文本）
    expect(decision.enhanced.perceptionV40!.d15_partner_attachment).toBeGreaterThan(0);
  });

  it('瑶光 objective 归一化 → 填充客观维（D1-D8/D21-D32 非零）', () => {
    const m3 = new M3LogicOrchestrator();
    const dna: any = {
      branch_id: 'evt_002', locus_path: 'user.misc.default',
      taxonomy_version: '1.0', seq_pos: 0, leaf_zone: 'language_semantic_zone',
      ref: 'tmp', entity_genes: [], created_at: new Date().toISOString(),
      raw_input: '今天工作很累',
    };
    const decision = m3.decide(dna, {});
    const merged = fillObjectiveDims(decision.enhanced.perceptionV40!, mockYaoguangObjective());
    // 客观维填充（D1 血乳酸、D22 居家氛围 — 瑶光补客观维）
    expect(merged.d01_muscle_load).toBeGreaterThan(0);
    expect(merged.d22_home_environment).toBeGreaterThan(0);
    // 语义维以 M3 为准（瑶光不覆盖 D35/D36）
    expect(merged.d35_sincerity).toBe(decision.enhanced.perceptionV40!.d35_sincerity);
    expect(merged.d36_dominance).toBe(decision.enhanced.perceptionV40!.d36_dominance);
    // 双极 D36 归一化在 [0,1]
    expect(merged.d36_dominance).toBeGreaterThanOrEqual(0);
    expect(merged.d36_dominance).toBeLessThanOrEqual(1);
  });

  it('编码 → 解码往返一致（写库/检索用同一 40D）', () => {
    const m3 = new M3LogicOrchestrator();
    const dna: any = {
      branch_id: 'evt_003', locus_path: 'user.misc.default',
      taxonomy_version: '1.0', seq_pos: 0, leaf_zone: 'language_semantic_zone',
      ref: 'tmp', entity_genes: [], created_at: new Date().toISOString(),
      raw_input: '我爱你',
    };
    const decision = m3.decide(dna, {});
    const merged = fillObjectiveDims(decision.enhanced.perceptionV40!, mockYaoguangObjective());
    const encoded = encodePerceptionV40(merged);
    const decoded = decodePerceptionV40(encoded)!;
    expect(decoded).toEqual(merged);
  });

  it('回退：无 perceptionV40 时 buildFallbackV40 兜底', () => {
    const m3 = new M3LogicOrchestrator();
    const dna: any = {
      branch_id: 'evt_004', locus_path: 'user.misc.default',
      taxonomy_version: '1.0', seq_pos: 0, leaf_zone: 'language_semantic_zone',
      ref: 'tmp', entity_genes: [], created_at: new Date().toISOString(),
      raw_input: '今天天气不错',
    };
    const decision = m3.decide(dna, {});
    // buildFallbackV40 与 M3 产出语义维一致（同源）
    const fallback = buildFallbackV40(decision.enhanced.perception);
    const direct = decision.enhanced.perceptionV40!;
    expect(fallback.d35_sincerity).toBe(direct.d35_sincerity);
    expect(fallback.d12_enjoyment).toBe(direct.d12_enjoyment);
  });
});
