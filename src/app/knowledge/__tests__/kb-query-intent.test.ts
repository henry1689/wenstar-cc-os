/**
 * kb-query-intent.test.ts — S2-A1/A2 知识查询意图分级 + 查询词构造
 * ==============================================================
 * 场景：用户问"熊梓铭的个人简介是什么"，知识库必须被深度检索。
 *
 * 旧实现缺陷：
 *   A1 — _explicitQuery 正则漏"简介/档案/是谁/是什么" → 归 Level 3 日常 → 阈值丢弃
 *   A2 — 查询词用整句（"熊梓铭的个人简介是什么"），19 个 ngram 里只有 5 个命中实体，
 *        textScore≈0.26 边缘；改用实体名"熊梓铭"后 ngram 全命中。
 */
import { describe, it, expect } from 'vitest';
import { isExplicitKBQuery, buildKBQuery } from '../KnowledgeContextBuilder.js';

describe('isExplicitKBQuery — 知识查询意图检测（S2-A1）', () => {
  it('明确知识查询词 → true', () => {
    expect(isExplicitKBQuery('查一下熊梓铭的资料')).toBe(true);
    expect(isExplicitKBQuery('你听说过徐诗雨吗')).toBe(true);
  });
  it('补词后：简介/档案/是谁/是什么 → true（旧正则漏判）', () => {
    expect(isExplicitKBQuery('熊梓铭的个人简介是什么')).toBe(true);
    expect(isExplicitKBQuery('熊梓铭是谁')).toBe(true);
    expect(isExplicitKBQuery('介绍下熊梓铭')).toBe(true);
    expect(isExplicitKBQuery('熊梓铭的人物档案')).toBe(true);
  });
  it('日常闲聊不含知识意图 → false', () => {
    expect(isExplicitKBQuery('今天天气真不错')).toBe(false);
    expect(isExplicitKBQuery('嗯嗯好的知道了')).toBe(false);
  });
});

describe('buildKBQuery — 查询词构造（S2-A2）', () => {
  const dnaWithPerson = { entity_genes: [{ name: '熊梓铭', type: 'person' }, { name: '我', type: 'self' }] };
  const dnaEmpty = { entity_genes: [] };

  it('消息含 person 实体名 → 直接用实体名搜（整句稀释根因修复）', () => {
    expect(buildKBQuery('熊梓铭的个人简介是什么', dnaWithPerson, true)).toBe('熊梓铭');
  });
  it('无实体名 → 走原降噪逻辑（kbf=true）', () => {
    expect(buildKBQuery('今天天气真不错', dnaEmpty, true)).toBe('今天天气真不错');
  });
  it('无实体名 + 非 kbf → 返回原文', () => {
    expect(buildKBQuery('随便聊聊', dnaEmpty, false)).toBe('随便聊聊');
  });
  it('实体名不在消息中 → 不走实体名替换', () => {
    expect(buildKBQuery('今天去哪儿玩', dnaWithPerson, true)).toBe('今天去哪儿玩');
  });
});
