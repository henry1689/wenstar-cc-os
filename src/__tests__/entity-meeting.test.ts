/**
 * V10.0 P1-3: 会晤触发测试（纯函数，不依赖服务器）
 * 测试 5 种触发模式
 */
import { describe, it, expect } from 'vitest';
import { EntityMeeting } from '../m4/household/EntityMeeting.js';

const NAMES = ['徐诗雨', '徐诗韵', '熊梓铭', '阿珍', '张小龙', '罗权斌'];

describe('EntityMeeting.detectUserIntent — 会晤触发', () => {
  it('模式1: @name 格式', () => {
    const r = EntityMeeting.detectUserIntent('@徐诗雨 你好', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

  it('模式2: name: 格式', () => {
    const r = EntityMeeting.detectUserIntent('徐诗雨：你在吗', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

  it('模式3: 纯名字（最短匹配）', () => {
    const r = EntityMeeting.detectUserIntent('诗雨', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

  it('模式4: 间接呼唤（通过玉瑶）', () => {
    const r = EntityMeeting.detectUserIntent('瑶瑶，叫徐诗雨过来一下', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

  it('模式5: 自然口语 — 我想找XX聊聊', () => {
    const r = EntityMeeting.detectUserIntent('我想找阿珍聊聊', NAMES);
    expect(r).toEqual(['阿珍']);
  });

  it('自然口语 — 我叫XX过来', () => {
    const r = EntityMeeting.detectUserIntent('叫张小龙来', NAMES);
    expect(r).toEqual(['张小龙']);
  });

  it('不触发: 日常聊天不含人名', () => {
    const r = EntityMeeting.detectUserIntent('今天天气不错', NAMES);
    expect(r).toBeNull();
  });

  it('不触发: 高频泛称词（V10.0 P1-5）', () => {
    // V10.0 P1-5: 泛称词从 sorted 中排除，整个匹配流程不应匹配
    const namesWithGeneric = [...NAMES, '老婆', '妹妹'];
    const r = EntityMeeting.detectUserIntent('老婆今天生日我们去哪吃饭', namesWithGeneric);
    expect(r).toBeNull();
  });

  it('全名匹配: 消息包含全名', () => {
    const r = EntityMeeting.detectUserIntent('徐诗雨', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

  it('模式6: 你是XX吗 — 身份确认', () => {
    const r = EntityMeeting.detectUserIntent('你是徐诗雨吗', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

  it('模式7: 你是XX — 无问号', () => {
    const r = EntityMeeting.detectUserIntent('你是阿珍', NAMES);
    expect(r).toEqual(['阿珍']);
  });

  it('模式8: 短名 — "诗雨"匹配"徐诗雨"', () => {
    const r = EntityMeeting.detectUserIntent('你是诗雨吗', NAMES);
    expect(r).toEqual(['徐诗雨']);
  });

});

describe('EntityMeeting.detectSwitchIntent — 会中切换', () => {
  it('换人来', () => {
    const r = EntityMeeting.detectSwitchIntent('换熊梓铭来', NAMES);
    expect(r).toBe('熊梓铭');
  });

  it('让XX也来', () => {
    const r = EntityMeeting.detectSwitchIntent('让阿珍也来', NAMES);
    expect(r).toBe('阿珍');
  });

  it('我想和XX聊聊', () => {
    const r = EntityMeeting.detectSwitchIntent('我想和罗权斌聊聊', NAMES);
    expect(r).toBe('罗权斌');
  });

  it('XX在吗', () => {
    const r = EntityMeeting.detectSwitchIntent('徐诗韵在吗', NAMES);
    expect(r).toBe('徐诗韵');
  });

  it('退出信号不触发切换', () => {
    const r = EntityMeeting.detectSwitchIntent('散会', NAMES);
    expect(r).toBeNull();
  });
});
