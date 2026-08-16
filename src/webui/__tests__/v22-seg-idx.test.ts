/**
 * V23 段 idx 连续性回归测试 —— 根治「语音只播一小部分」
 * 根因: _dispatch 合并 2~3 句成段时用「首句 idx」作「段 idx」→ 段 idx 稀疏(0,2,4,6)
 * 前端 _ttsIncr.urls 稀疏，播完 urls[0] 后 cur=1 卡空位 → 只播第 1 段。
 * V23: 段 idx 用独立 _segGen 连续计数器(0,1,2,3..)，前端 urls 连续，流式期间连续播。
 */
import { describe, it, vi, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// mock edge-tts：解析 --write-media 路径，写假文件（>0 字节），让 generateTTSAudio 立即成功
vi.mock('node:child_process', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    execFile: (cmd: string, args: string[], opts: any, cb: (e: any, out?: string) => void) => {
      const wi = args.indexOf('--write-media');
      const fp = args[wi + 1];
      try { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, 'fake-mp3-bytes'); } catch (_) {}
      cb(null, '');
    },
  };
});

import { IncrementalTTS } from '../server-chat-routes.js';

describe('V23 段 idx 连续性', () => {
  it('6 句合并成段后，段 idx 连续（0,1,2）而非稀疏', async () => {
    const idxs: number[] = [];
    const t = new IncrementalTTS('D:/tmp/v23-audio', (idx) => idxs.push(idx));
    t.feed('第一句是测试。第二句也是测试。第三句还是测试。第四句继续测试。第五句接着测试。第六句最后测试。');
    t.flush();
    await (t as any)._chain; // 等串行链清空
    // 段 idx 必须连续，否则前端 urls 稀疏卡空位
    expect(idxs.length).toBeGreaterThan(0);
    for (let i = 1; i < idxs.length; i++) expect(idxs[i]).toBe(idxs[i - 1] + 1);
  });

  it('flush 后尾部单句（<2句）也被消费，不丢尾', async () => {
    const idxs: number[] = [];
    const t = new IncrementalTTS('D:/tmp/v23-audio', (idx) => idxs.push(idx));
    t.feed('第一句。第二句。');
    t.flush(); // 尾部残留单句应强制消费
    await (t as any)._chain;
    // 至少 1 段生成
    expect(idxs.length).toBeGreaterThan(0);
  });

  it('finalize 返回的 audio_urls 按连续 idx 保序（含空位）', async () => {
    const t = new IncrementalTTS('D:/tmp/v23-audio', () => {});
    t.feed('第一句。第二句。第三句。第四句。');
    const r = await t.finalize('第一句。第二句。第三句。第四句。');
    // 段 idx 连续 → audio_urls 稀疏空位只在「失败段」出现，正常时前几段连续非空
    const urls = r.audio_urls as string[];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toBeTruthy();
  });

  // ── V24 根治「长文只播前几段」 + 「首段响应慢」 ──
  it('V24: 长文(20句) finalize 返回全部段，不丢尾（drain 修复）', async () => {
    const t = new IncrementalTTS('D:/tmp/v24-audio', () => {});
    // 20 句，每句约 20 字，总 ~400 字 → 约 7 段（每段 2~3 句 / 120 字）
    let long = '';
    for (let i = 1; i <= 20; i++) long += `这是第${i}句测试内容用来验证长文分段不丢失。`;
    t.feed(long);
    t.flush();
    const r = await t.finalize(long);
    const nonNull = (r.audio_urls as (string | null)[]).filter(u => !!u);
    // 修复前 finalize 提前返回（_inFlight 上限挡住剩余句，只含前 2~3 段）；
    // 修复后 drain 等 _pending 清空 + _inFlight 归零，返回全部段。
    expect(nonNull.length).toBeGreaterThanOrEqual(5);
    // 段 idx 连续：第 0 段非空
    expect((r.audio_urls as (string | null)[])[0]).toBeTruthy();
  });

  it('V24: 首段 60 字即触发（修复前需 120 字）', async () => {
    const idxs: number[] = [];
    const t = new IncrementalTTS('D:/tmp/v24-audio', (idx) => idxs.push(idx));
    // 单个 80 字句子（有句末标点）→ 修复前 <120 且 <2 句不触发，修复后 >=60 触发首段
    const s = '首段快速触发测试内容'.repeat(8) + '。'; // 10字 × 8 = 80 字，落在 60~120 区间
    t.feed(s);
    await (t as any)._chain;
    expect(idxs.length).toBe(1);
  });
});
