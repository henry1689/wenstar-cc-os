/**
 * fts-sliding-window.test.ts — S2-B1 FtsSearch 滑动窗口分词回归
 * ===========================================================
 * 场景：用户问"熊梓铭的个人简介是什么"，FTS 必须能命中 content 含"熊梓铭"的文档。
 *
 * 旧实现（贪婪 2-4 字分组 /[一-龥]{2,4}/g）：
 *   查询分词 = ["熊梓铭的","个人简介","是什么"]，索引 term = ["熊梓铭","又叫梓铭",...]
 *   查询 term 与索引 term 永远不匹配 → BM25 0 命中 → LIKE 降级 %熊梓铭的% 也失配。
 *
 * 新实现（滑动窗口 2-3 gram）：
 *   查询分词含"熊梓铭"/"梓铭"/"熊梓"，索引 term 同样含 → 必然命中。
 */
import { describe, it, expect } from 'vitest';
import { FtsSearch } from '../FtsSearch.js';

/** 最小 SQLiteAdapter mock（FtsSearch 仅用 queryAll） */
function makeMockSqlite(rows: any[]) {
  return {
    queryAll: () => rows,
  } as any;
}

describe('FtsSearch 滑动窗口分词（S2-B1）', () => {
  it('查询"熊梓铭的个人简介是什么"能命中 content 含"熊梓铭"的文档（旧贪婪分词 miss）', async () => {
    const fts = new FtsSearch(makeMockSqlite([
      { id: 'kb1', title: '梓铭简介：', content: '熊梓铭，又叫梓铭，又叫小明。自身风华气度绝不逊色。', classification: '人物参考' },
      { id: 'kb2', title: '天气', content: '今天天气晴朗，适合散步。', classification: null },
    ]), { k1: 1.5, b: 0.75 });
    await fts.init();

    const r = fts.search('熊梓铭的个人简介是什么', 5);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].id).toBe('kb1');
  });

  it('查询词是索引词子串时命中（滑窗保证任意 2/3 字子串成 term）', async () => {
    const fts = new FtsSearch(makeMockSqlite([
      { id: 'k', title: '玉瑶', content: '玉瑶喜欢喝咖啡，每天早上一杯。', classification: null },
    ]), { k1: 1.5, b: 0.75 });
    await fts.init();

    // "喝咖啡" 必须作为连续子串被索引（滑窗 2-gram "喝咖"/"咖啡"，3-gram "喝咖啡"）
    const r = fts.search('喝咖啡', 5);
    expect(r.length).toBe(1);
  });

  it('停用词不产生 term（过滤噪声）', async () => {
    const fts = new FtsSearch(makeMockSqlite([
      { id: 'k', title: '测试', content: '我有一个苹果和一杯水。', classification: null },
    ]), { k1: 1.5, b: 0.75 });
    await fts.init();

    // "一个"/"和" 若在 STOP_WORDS 中则不被索引
    const r1 = fts.search('一个', 5);
    const r2 = fts.search('苹果', 5);
    // "苹果" 是有效内容词，应命中；"一个" 是停用词，不应因它命中
    expect(r2.length).toBe(1);
  });

  it('空查询返回空结果（不崩溃）', async () => {
    const fts = new FtsSearch(makeMockSqlite([]), { k1: 1.5, b: 0.75 });
    await fts.init();
    expect(fts.search('', 5).length).toBe(0);
  });
});
