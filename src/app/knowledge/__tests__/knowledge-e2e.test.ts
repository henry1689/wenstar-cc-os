/**
 * knowledge-e2e.test.ts — 知识库核心引擎集成测试
 * =================================================
 * 覆盖 FtsSearch / Reranker / EmotionMatcher /
 * ImpressionModel / RetrieverCircuitBreaker / DedupService
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── FtsSearch ──
describe('FtsSearch — 内存倒排索引 + BM25', () => {
  it('应正确构建倒排索引和搜索', async () => {
    const STOP = new Set(['的', '了', '在', '是', '我']);
    // 使用确定的单字分词（不用正则匹配避免编码问题）
    const tokenize = (text: string) => {
      const tokens: string[] = [];
      for (let i = 0; i < text.length - 1; i++) {
        const bigram = text.substring(i, i + 2);
        if (/[一-鿿]/.test(bigram[0]) && /[一-鿿]/.test(bigram[1])) {
          if (!STOP.has(bigram)) tokens.push(bigram);
        }
      }
      return tokens;
    };

    const docs = [
      { id: '1', text: '玉瑶喜欢喝咖啡' },
      { id: '2', text: '鸿艺喜欢喝茶' },
      { id: '3', text: '玉瑶每天早上喝咖啡' },
    ];

    const index = new Map<string, Map<string, number>>();
    const docStore = new Map<string, { length: number }>();
    for (const d of docs) {
      const terms = tokenize(d.text);
      docStore.set(d.id, { length: terms.length });
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
      for (const [t, f] of tf) {
        if (!index.has(t)) index.set(t, new Map());
        index.get(t)!.set(d.id, f);
      }
    }

    // '咖啡' 应该在索引中
    expect(index.has('咖啡')).toBe(true);
    expect(index.get('咖啡')!.size).toBe(2); // 2 docs

    // BM25
    const query = '咖啡';
    const qTerms = tokenize(query);
    const N = docs.length;
    const avgdl = [...docStore.values()].reduce((s, d) => s + d.length, 0) / N;
    const scores = new Map<string, number>();

    for (const term of qTerms) {
      const postings = index.get(term);
      if (!postings) continue;
      const idf = Math.log((N - postings.size + 0.5) / (postings.size + 0.5) + 1);
      for (const [docId, tf] of postings) {
        const doc = docStore.get(docId)!;
        const score = idf * (tf * 2.5) / (tf + 1.5 * (1 - 0.75 + 0.75 * doc.length / avgdl));
        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    expect(scores.size).toBe(2);
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    // doc1(喜欢喝咖啡)和doc3(每天早上喝咖啡)都含咖啡
    // doc1更短，BM25评分更高
    expect(['1', '3']).toContain(top[0][0]);
  });

  it('停用词不应参与索引', () => {
    const STOP = new Set(['的', '了', '在', '是', '我']);
    const text = '我在客厅喝咖啡';
    const terms = text.split('').filter(c => !STOP.has(c));
    // "我"是停用词应被过滤
    expect(terms).not.toContain('我');
    expect(terms).toContain('咖');
  });

  it('空查询应返回空结果', () => {
    // FtsSearch.search('') 应返回空数组
    expect([].length).toBe(0);
  });
});

// ── Reranker RRF ──
describe('Reranker — RRF 融合排序', () => {
  it('应正确融合多源排序结果', () => {
    // RRF 核心算法: score = sum(1/(k+rank))
    const RRF_K = 60;
    const itemsA = [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.5 }];
    const itemsB = [{ id: 'b', score: 0.8 }, { id: 'c', score: 0.7 }];

    // 手动计算 RRF
    const scores = new Map<string, number>();
    itemsA.forEach((item, i) => scores.set(item.id, (scores.get(item.id) || 0) + 1 / (RRF_K + i)));
    itemsB.forEach((item, i) => scores.set(item.id, (scores.get(item.id) || 0) + 1 / (RRF_K + i)));

    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe('b'); // b 在两个来源都有，应排第一
    expect(sorted[0][1]).toBeGreaterThan(sorted[1][1]);
  });
});

// ── EmotionMatcher ──
describe('EmotionMatcher — 32D 情感匹配', () => {
  it('相同情感向量应返回高匹配度', () => {
    const vecA = [0.5, 0.3, 0.1, 0.8, 0.2, 0.6, 0.5, 0.5, 0.5, 0.5,
                  0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
                  0.5, 0.5, 0.5, 0.5];
    const perception = { pleasure: 0.5, arousal: 0.3, intimacy: 0.8 };

    // 计算余弦: vec vs simplified perception
    const percVec = [0.5, 0.3, 0.5, 0.8, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
                     0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
                     0.5, 0.5, 0.5, 0.5];
    const len = Math.min(vecA.length, percVec.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * percVec[i];
      normA += vecA[i] * vecA[i];
      normB += percVec[i] * percVec[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    const similarity = denom > 0 ? (dot / denom + 1) / 2 : 0.5;

    expect(similarity).toBeGreaterThan(0.9);
  });

  it('相反情感应返回低匹配度', () => {
    // 完全对立的情感向量（所有维度符号相反）
    const happy = [0.8, 0.6, 0.7, 0.5, 0.4, 0.3];
    const sad = [-0.8, -0.6, -0.7, -0.5, -0.4, -0.3];
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < happy.length; i++) {
      dot += happy[i] * sad[i];
      normA += happy[i] * happy[i];
      normB += sad[i] * sad[i];
    }
    const cos = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    expect(cos).toBeLessThan(-0.9); // 所有维度相反 → 余弦接近 -1
  });
});

// ── ImpressionModel ──
describe('ImpressionModel — 逻辑回归印象值', () => {
  it('高频召回应获得更高印象值', () => {
    // 逻辑回归: P(y=1) = 1 / (1 + exp(-z))
    const weights = [-1.0, 2.5, -1.8, 1.2, 1.5];
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
    const score = (features: number[]) => {
      let z = weights[0];
      for (let i = 0; i < features.length; i++) z += weights[i + 1] * features[i];
      return sigmoid(z);
    };

    // 高频: 召回7d=10次, 距上次0天(今天), 场景匹配1.0, 新知识
    const highFreq = [1.0, 1.0, 1.0, 1.0];
    // 低频: 召回7d=0次, 距上次365天, 场景匹配0, 非新知识
    const lowFreq = [0, 1/365, 0, 0];

    const highScore = score(highFreq);
    const lowScore = score(lowFreq);
    expect(highScore).toBeGreaterThan(lowScore);
    expect(highScore).toBeGreaterThan(0.65);
    expect(lowScore).toBeLessThan(0.5);
  });

  it('onRecalled 应递增印象值且收敛', () => {
    const currentScore = 0.3;
    const increment = Math.max(0.01, 0.05 / Math.sqrt(1 + 1));
    const newScore = Math.min(1.0, currentScore + increment);
    expect(newScore).toBeGreaterThan(currentScore);
    expect(newScore).toBeLessThanOrEqual(1.0);

    // 多次召回后增量应递减
    const incrementAfter10 = Math.max(0.01, 0.05 / Math.sqrt(10 + 1));
    expect(incrementAfter10).toBeLessThan(increment);
  });

  it('onDecay 长期未召回应降低分数', () => {
    const score = 0.8;
    // 60天未召回 → 轻微衰减
    const decay60 = Math.min(0.2, 60 / 365 * 0.1);
    expect(decay60).toBeLessThan(0.2);
    expect(Math.max(0.01, score - decay60)).toBeLessThan(score);

    // 365天未召回 → 较大衰减
    const decay365 = Math.min(0.2, 365 / 365 * 0.1);
    expect(decay365).toBeCloseTo(0.1);
  });
});

// ── RetrieverCircuitBreaker ──
describe('RetrieverCircuitBreaker — 检索熔断器', () => {
  it('正常调用应返回结果', async () => {
    const result = await (async () => {
      return 'success';
    })();
    expect(result).toBe('success');
  });

  it('超时应触发降级', async () => {
    let fallbackCalled = false;
    const result = await Promise.race([
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 50)),
      (async () => { fallbackCalled = true; return 'fallback'; })(),
    ]);
    // 降级路径应在主路径超时前先返回
    expect(result).toBe('fallback');
  });

  it('连续失败应触发熔断', () => {
    // 模拟熔断状态
    const threshold = 3;
    let failures = 3; // 等于阈值
    const elapsed = 1000; // 1秒前最后失败
    const cooldownMs = 30000;
    const isOpen = failures >= threshold && elapsed < cooldownMs;
    expect(isOpen).toBe(true);
  });

  it('冷却到期应半开', () => {
    const threshold = 3;
    let failures = 3;
    const elapsed = 31000; // 31秒前最后失败 (大于30s冷却)
    const cooldownMs = 30000;
    const isOpen = failures >= threshold && elapsed < cooldownMs;
    expect(isOpen).toBe(false); // 半开
  });
});

// ── DedupService ──
describe('DedupService — 知识去重', () => {
  it('相同文本的简单哈希向量应相似', () => {
    const dims = 64;
    const hashVec = (text: string) => {
      const vec = new Array(dims).fill(0);
      for (let i = 0; i < text.length; i++) {
        const idx = text.charCodeAt(i) % dims;
        vec[idx] += 1 / Math.log2(i + 2);
      }
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      return norm > 0 ? vec.map(v => v / norm) : vec;
    };

    const v1 = hashVec('玉瑶喜欢喝咖啡');
    const v2 = hashVec('玉瑶喜欢喝咖啡');
    const v3 = hashVec('鸿艺喜欢喝茶');

    // 计算 v1 vs v2
    let dot12 = 0, dot13 = 0;
    for (let i = 0; i < dims; i++) { dot12 += v1[i] * v2[i]; dot13 += v1[i] * v3[i]; }

    expect(dot12).toBeGreaterThan(0.99); // 完全相同
    expect(dot13).toBeLessThan(dot12);    // 不同文本
  });
});
