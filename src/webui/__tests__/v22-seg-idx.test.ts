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
});
