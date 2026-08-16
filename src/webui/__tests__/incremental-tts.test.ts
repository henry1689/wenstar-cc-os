/**
 * IncrementalTTS 单测 — V15 边写边播增量语音
 * feed() 字符级句子累积 / 触发门槛 / flush 残留 / 串行队列 / index 连续性
 */
import { describe, it, expect } from 'vitest';
import { IncrementalTTS } from '../server-chat-routes.js';

function makeIncr(onSegment: (idx: number, url: string) => void = () => {}) {
  return new IncrementalTTS('D:/tmp', onSegment);
}

describe('IncrementalTTS.feed 句子累积', () => {
  it('逐 token 喂碎片（含半标点）正确切句', () => {
    const t = makeIncr();
    // 覆盖 _dispatch 防止消费 _pending（纯测累积）
    (t as any)._dispatch = () => {};
    const pending = (t as any)._pending;
    // 模拟 onToken 任意切分：半字/半标点
    t.feed('诗雨');
    t.feed('来');
    t.feed('了，汤');
    t.feed('也好了。您');
    t.feed('别急。');
    // 完整句应入 _pending，残留部分句在 _buf
    const texts = pending.map((p: any) => p.text);
    expect(texts).toContain('诗雨来了，汤也好了。');
    expect(texts).toContain('您别急。');
    expect((t as any)._buf).toBe('');
  });

  it('跨句 token：句号与下一句分属两个 token', () => {
    const t = makeIncr();
    const pending = (t as any)._pending;
    t.feed('第一句。');
    t.feed('第二句');
    expect(pending.map((p: any) => p.text)).toContain('第一句。');
    expect((t as any)._buf).toBe('第二句');
  });

  it('index 单调连续', () => {
    const t = makeIncr();
    (t as any)._dispatch = () => {}; // 防消费
    const pending = (t as any)._pending;
    t.feed('一句。二句。三句。');
    const idxs = pending.map((p: any) => p.idx);
    expect(idxs).toEqual([0, 1, 2]);
  });
});

describe('IncrementalTTS 触发门槛', () => {
  it('不足 80 字且 <2 句不触发生成', () => {
    let dispatched = 0;
    const t = new IncrementalTTS('D:/tmp', () => {});
    // 覆盖 _dispatch 计数
    (t as any)._dispatch = () => { dispatched++; };
    t.feed('短句。');
    expect(dispatched).toBe(0);
  });

  it('>=120 字且 >=1 完整句触发（V22 门槛 40→120，段粒度对齐）', () => {
    let dispatched = 0;
    const t = new IncrementalTTS('D:/tmp', () => {});
    (t as any)._dispatch = () => { dispatched++; };
    const long = '这是一句比较长的回复内容用来测试触发门槛当累积到一百二十个字左右就会触发一次生成这是一个足够长的句子用来满足字数阈值要求确保不会因为太短而不触发条件这里继续补充一些字数让它超过一百二十个字的阈值门槛这些补充的字符数量已经足够多能够稳定地跨越新的触发门槛确保测试仍然有效。';
    t.feed(long);
    expect(dispatched).toBeGreaterThanOrEqual(1);
  });

  it('>=2 完整句触发', () => {
    let dispatched = 0;
    const t = new IncrementalTTS('D:/tmp', () => {});
    (t as any)._dispatch = () => { dispatched++; };
    t.feed('第一句。第二句。');
    expect(dispatched).toBeGreaterThanOrEqual(1);
  });
});

describe('IncrementalTTS.flush 残留提交', () => {
  it('done 前 flush 提交残留部分句', () => {
    const t = makeIncr();
    (t as any)._dispatch = () => {}; // 防消费
    const pending = (t as any)._pending;
    t.feed('残留部分句没有标点');
    expect(pending.length).toBe(0);
    t.flush();
    expect(pending.map((p: any) => p.text)).toContain('残留部分句没有标点');
  });
});

describe('IncrementalTTS.finalize', () => {
  it('abort 后返回空 audio', async () => {
    const t = makeIncr();
    t.abort();
    const r = await t.finalize('测试');
    expect(r.audio_urls).toEqual([]);
  });

  it('空 reply 返回空 audio', async () => {
    const t = makeIncr();
    const r = await t.finalize('');
    expect(r.audio_urls).toEqual([]);
  });
});
