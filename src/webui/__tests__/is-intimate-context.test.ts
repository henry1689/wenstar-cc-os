/**
 * isIntimateContext 单测 — V16 亲密语境豁免（隐私法）
 * 命中 → 不进入事实回忆/工作模式（避免"奶子美在哪里 玉瑶"被当事实查询 → 禁亲密+秘书口吻）
 */
import { describe, it, expect } from 'vitest';
import { isIntimateContext } from '../chat-utils.js';

describe('isIntimateContext 亲密语境检测', () => {
  it('命中: 用户实测样本"你说说你的奶子美在哪里 玉瑶"', () => {
    expect(isIntimateContext('你说说你的奶子美在哪里 玉瑶')).toBe(true);
  });

  it('命中: 亲密调情表达', () => {
    expect(isIntimateContext('我想亲你，抱抱我')).toBe(true);
    expect(isIntimateContext('宝贝，今晚留下')).toBe(true);
    expect(isIntimateContext('我们一起泡个鸳鸯浴吧')).toBe(true);
    expect(isIntimateContext('你身上有股体香，让我闻闻')).toBe(true);
  });

  it('弱信号不命中是有意设计（避免误伤生活场景）', () => {
    // "洗澡""摸起来好软""香香的"单独出现是日常弱信号，故意不入词表；
    // 且它们本身不触发 isFactualRecallQuery（无问号/事实词），不会进"禁亲密"路径。
    expect(isIntimateContext('诗雨一起洗个澡')).toBe(false);
    expect(isIntimateContext('你摸起来好软，香香的')).toBe(false);
    expect(isIntimateContext('我去洗澡了')).toBe(false);
  });

  it('不命中: 真实事实回忆（"你记得我妈叫什么吗"）', () => {
    expect(isIntimateContext('你记得我妈叫什么吗')).toBe(false);
  });

  it('不命中: 生活日常（无强亲密信号）', () => {
    expect(isIntimateContext('今天天气不错，去散步吧')).toBe(false);
    expect(isIntimateContext('你明天有空吗')).toBe(false);
  });

  it('不命中: 空消息', () => {
    expect(isIntimateContext('')).toBe(false);
  });
});
