/**
 * V17 草稿迭代型思维链泄漏 —— 用户实测样本"说的仔细一点 玉瑶"
 * 结构: [第一稿] + [评估段"差不多/最终确认/这个尺度合适"] + [第二稿]
 * 评估措辞漂移: "差不多了。稍微修改流畅一点。注意…最终确认。"
 * 期望: extractAnswerFromReasoning 只返回第二稿（最终稿），不含评估段/第一稿独有句。
 */
import { describe, it, expect } from 'vitest';
import { extractAnswerFromReasoning } from '../DeepSeekLLMProvider.js';

// 第一稿独有句
const DRAFT1_ONLY = '都是您惯出来的。';
// 评估段独有句
const EVAL1 = '差不多了。';
const EVAL2 = '稍微修改流畅一点';
const EVAL3 = '最终确认';
const EVAL4 = '这个尺度在亲密关系下是合适的';
const EVAL5 = '保持了诗雨的清纯语言风格';
// 第二稿独有句（最终稿，应保留）
const DRAFT2_ONLY = '可不许笑';
const DRAFT2_TAIL = '诗雨真、真的没了';

const LEAK = `（诗雨呼吸都乱了，半晌没言语，再开口时声音像浸了水汽，断断续续的。）

鸿艺先生……您真要把诗雨问化了呀。那、那诗雨就仔细说，您听着……

诗雨那处生得小，诗雨的手都不算大，拢上去还空出些。颜色是顶干净的淡粉，衬着皮肤，越显得白，像栀子花开到最后那一丁点蕊心。软，是真软，诗雨睡着时侧过去，它也跟着服服帖帖地偎下去，跟没骨头的。温温的，不凉，您手心一贴上来，它就先知道，尖儿那点会悄悄立起来，抵着您掌心，像跟您问好……诗雨不争气，被您轻轻一握，腿先软了，气也碎成一片片，话都拢不成句。您说，这半点不由人的身子，还能怎么美呀……都是您惯出来的。

差不多了。稍微修改流畅一点。注意要"仔细"，所以细节要具体：大小（手拢上去还空出些）、颜色（淡粉）、触感（软、温、贴着伏下去）、反应（尖儿立起来、腿软、气碎）。

这个尺度在亲密关系下是合适的，保持了诗雨的清纯语言风格。最终确认。（诗雨呼吸都乱了，半晌没言语，再开口时声音像浸了水汽，断断续续的。）

鸿艺先生……您真要把诗雨问化了呀。那、那诗雨就仔细说，您听着，可不许笑……

诗雨那处生得小，诗雨的手本就不大，拢上去还空出些。颜色是顶干净的淡粉，衬着这一身白，越发显得嫩，像栀子花快开尽时露出的那一点蕊心。软，是真软——诗雨夜里侧着睡，它也服服帖帖地偎下去，像没长骨头似的。温温的，不凉不烫，您掌心一贴上来，它倒先知道，尖儿那点就悄悄立起来，抵着您手心，像跟您问好……

（她顿了顿，声音更轻，几乎是从齿缝里漏出来的。）

诗雨不争气，被您轻轻一握，腿先软了，气也碎成一片一片，话都拢不成句。您说，这半点由不得人的身子，还能怎么个美法呀……都是被您惯出来的。您再要听更细的，诗雨真、真的没了…`;

describe('V17 草稿迭代型思维链剥离（评估措辞漂移）', () => {
  it('不泄漏评估段（差不多/修改流畅/最终确认/这个尺度合适/保持了风格）', () => {
    const out = extractAnswerFromReasoning(LEAK);
    console.log('V17_OUT_START>>>' + out.slice(0, 80) + '<<<');
    expect(out).not.toContain(EVAL1);
    expect(out).not.toContain(EVAL2);
    expect(out).not.toContain(EVAL3);
    expect(out).not.toContain(EVAL4);
    expect(out).not.toContain(EVAL5);
  });

  it('保留最终稿（第二稿独有句）', () => {
    const out = extractAnswerFromReasoning(LEAK);
    expect(out).toContain(DRAFT2_ONLY);
    expect(out).toContain(DRAFT2_TAIL);
  });

  it('不出现两遍重复（第一稿独有句不应在最终稿重复出现两次）', () => {
    const out = extractAnswerFromReasoning(LEAK);
    // "都是您惯出来的"在第一稿和第二稿都出现；剥离后应只保留第二稿的一次（不含评估段隔开的两遍）
    const cnt = out.split(DRAFT1_ONLY).length - 1;
    expect(cnt).toBeLessThanOrEqual(1);
  });
});

// V17 反例：正常答案含日常用语（"差不多了""保持了…语气"）不得被误判为复盘型思维链清空
describe('V17 词表收紧反例（不误伤正常答案）', () => {
  it('正常答案含"差不多"不被清空', () => {
    const out = extractAnswerFromReasoning('诗雨这边收拾得差不多了，您随时过来呀。');
    console.log('V17_FANLI1>>>' + out + '<<<');
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain('收拾得差不多');
  });

  it('正常答案含"保持…语气"不被清空', () => {
    const out = extractAnswerFromReasoning('诗雨一直保持了温柔的语气，您别担心。');
    console.log('V17_FANLI2>>>' + out + '<<<');
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
