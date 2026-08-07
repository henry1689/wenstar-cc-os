import { describe, it, expect } from 'vitest';
import { detectWork } from '../WorkDetector.js';

describe('WorkDetector — 创作意图检测', () => {
  it('含叙事标记 + 长文本(>300) → 高置信度', () => {
    const text = '第一章 星落之城\n' + '城外的风卷着黄沙。\n'.repeat(30);  // >300字
    const r = detectWork(text);
    expect(r.isWork).toBe(true);
    expect(r.confidence).toBe('high');
  });

  it('含"第一章/章节"标记 → novel 类型（S7-实测修复）', () => {
    const text = '第一章 云海客栈\n' + '山脚下有间云海客栈。\n'.repeat(30);  // >300字
    const r = detectWork(text);
    expect(r.isWork).toBe(true);
    expect(r.workType).toBe('novel');  // "第一章" 是小说专属标记
  });

  it('含"故事"标记 → story 类型', () => {
    const text = '这是一个关于重逢的故事\n' + '他站在城墙下等她。\n'.repeat(30);  // >300字
    const r = detectWork(text);
    expect(r.isWork).toBe(true);
    expect(r.workType).toBe('story');
  });

  it('含叙事标记 + 中文本(200-300) → 中置信度', () => {
    const text = '第一章 星落之城\n' + '城外的风卷着黄沙。\n'.repeat(25);  // ~270字
    const r = detectWork(text);
    expect(r.isWork).toBe(true);
    expect(r.confidence).toBe('medium');
  });

  it('短消息（<200字）→ 不识别', () => {
    expect(detectWork('你好，今天过得怎么样？').isWork).toBe(false);
  });

  it('纯指令（帮我写）→ 黑名单排除', () => {
    const r = detectWork('帮我写一篇关于爱情的小说，要求情节曲折感人' + '的。'.repeat(30));
    expect(r.isWork).toBe(false);  // 黑名单排除
  });

  it('800+字 无标记 → 中置信度文章', () => {
    const long = '这段文字是一段长篇记录，'.repeat(120);  // >800字
    const r = detectWork(long);
    expect(r.isWork).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.workType).toBe('article');
  });

  it('《书名号》 → 高置信度小说', () => {
    const r = detectWork('《星落之城》\n' + '这是一个关于星辰的故事。\n'.repeat(30));
    expect(r.isWork).toBe(true);
    expect(r.workType).toBe('novel');
    expect(r.confidence).toBe('high');
    expect(r.title).toContain('星落之城');
  });

  it('500-800字 无标记 → 低置信度候选（不自动建）', () => {
    const text = '一段长篇叙事内容，'.repeat(70);  // ~630字
    const r = detectWork(text);
    expect(r.isWork).toBe(true);
    expect(r.confidence).toBe('low');
  });
});
