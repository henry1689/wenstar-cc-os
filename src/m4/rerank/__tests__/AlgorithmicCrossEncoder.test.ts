import { describe, it, expect } from 'vitest';
import { computeQueryRelevance } from '../AlgorithmicCrossEncoder.js';

// S4-B2 阈值敏感性: 默认阈值 0.15，相关记忆(实测 0.17-0.51)必须高于阈值，无关(0.00)必须低于
describe('computeQueryRelevance — P0-1 二次精筛打分', () => {
  const THRESHOLD = 0.15;

  it('高度相关记忆分数高（近重复 ≥0.4）', () => {
    // query 几乎完全在记忆中出现
    const s = computeQueryRelevance('周末我们去公园散步', '周末我们去公园散步，你穿了件蓝色外套');
    expect(s).toBeGreaterThan(0.4);
  });
  it('语义相关但措辞不同 → 高于阈值（保相关）', () => {
    // 实测 0.17-0.21，必须 >0.15
    const cases = [
      ['记得上次说的旅行吗', '你上次说想去云南看雪山'],
      ['帮我查一下王总的电话', '王总电话是13800138000'],
      ['你记得我们以前去海边玩的时候吗', '去年我们一起去海边看了日落'],
      ['你上次说好要陪我过生日的', '答应过陪你过生日'],
    ];
    for (const [q, m] of cases) {
      const s = computeQueryRelevance(q, m);
      expect(s, `相关样本 "${q}" 应高于阈值`).toBeGreaterThanOrEqual(THRESHOLD);
    }
  });
  it('无关记忆分数远低于阈值（除无关）', () => {
    const s = computeQueryRelevance('今天天气怎么样', '上次修电脑花了三百块钱');
    expect(s).toBeLessThan(THRESHOLD);
  });
  it('归一化边界 [0,1]', () => {
    expect(computeQueryRelevance('', '任意')).toBe(0);
    expect(computeQueryRelevance('abc', '')).toBe(0);
    const s = computeQueryRelevance('完全一致内容', '完全一致内容');
    expect(s).toBeLessThanOrEqual(1.0);
  });
  it('长文档含关键词不稀释', () => {
    // 长文档包含 query 关键词 → keywordDensity 保证不因长文本稀释
    const s = computeQueryRelevance('公园散步', '我们周末去公园散步，' + '沿途风景很好'.repeat(30));
    expect(s).toBeGreaterThan(0.15);
  });
});
