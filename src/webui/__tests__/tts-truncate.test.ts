/**
 * TTS 分段单测 — 语音播报断句截断 + 长文分段滚动播报纯函数
 * _truncateForTTS：短文本直通 / 句级优先 / 逗号兜底 / 近端句级回退 / 硬截断 / 边界 / 句号-逗号优先级
 * segmentForTTS：短文本单段 / 长文多段（几句话一切）/ 超长单句硬切 / 边界 / 空输入
 */
import { describe, it, expect } from 'vitest';
import { _truncateForTTS, segmentForTTS, TTS_MAX_TEXT, TTS_SEGMENT_TARGET_SENTENCES, TTS_SEGMENT_MAX_CHARS } from '../server-chat-routes.js';

describe('_truncateForTTS', () => {
  it('短文本原样返回（不截断）', () => {
    expect(_truncateForTTS('你好，我是玉瑶。')).toBe('你好，我是玉瑶。');
  });

  it('空/纯空白返回空', () => {
    expect(_truncateForTTS('')).toBe('');
    expect(_truncateForTTS('   ')).toBe('');
  });

  it('恰好等于 max 时不截断', () => {
    const s = '字'.repeat(TTS_MAX_TEXT);
    expect(_truncateForTTS(s)).toBe(s);
  });

  it('超长文本按句号断句截断（进入截断分支）', () => {
    // 450 字（>400），每句 9 字，句号密集分布
    const s = '第一句内容在这里。'.repeat(50);
    expect(s.length).toBeGreaterThan(TTS_MAX_TEXT);
    const r = _truncateForTTS(s);
    expect(r.length).toBeLessThanOrEqual(TTS_MAX_TEXT);
    expect(r.endsWith('。')).toBe(true); // 断在句号后
  });

  it('句号在近端未越阈值、逗号越阈值 → 逗号兜底截断', () => {
    // 总 402>400；cutoff 400：句号 index 60(<160)，逗号 index 201(>160) → 逗号兜底
    const s = '字'.repeat(60) + '。' + '字'.repeat(140) + '，' + '字'.repeat(200);
    const r = _truncateForTTS(s);
    expect(r.endsWith('，')).toBe(true);
    expect(r.length).toBe(202); // 60+1+140+1
  });

  it('无任何标点则硬截断在 max', () => {
    const s = '字'.repeat(600);
    const r = _truncateForTTS(s);
    expect(r).toBe('字'.repeat(TTS_MAX_TEXT));
  });

  it('40% 阈值边界：句号恰在阈值处采用断句', () => {
    // 句号在 index 159（<160 不采用），160（>160 采用）
    const at160 = '字'.repeat(160) + '。' + '字'.repeat(300);
    const r160 = _truncateForTTS(at160);
    expect(r160).toBe('字'.repeat(160) + '。'); // 160 > 160*0.4=64 → 采用
  });

  it('P3 边界钉死：句号恰=threshold(160)、逗号越阈值(200) → 逗号胜出（分支1严格>不采用句号）', () => {
    // 句号@160 恰等于 threshold（分支1 `160 > 160` 假 → 跳过），逗号@200 > 160（分支2 采用）
    // 若误改成 `>=`，此用例会失败（会选句号@160）→ 钉死严格 `>` 行为
    const s = '字'.repeat(160) + '。' + '字'.repeat(39) + '，' + '字'.repeat(300);
    const r = _truncateForTTS(s);
    expect(r).toBe('字'.repeat(160) + '。' + '字'.repeat(39) + '，'); // 200 字含逗号
  });

  it('句号与逗号都在近端（均未越阈值）→ 回退最近句号保句子完整', () => {
    // 总 462>400；cutoff 400：句号 index 60(<160)，逗号 index 160（=160，严格大于才采用→不采用）
    // → 回退最近句级断点（60 处句号）→ 输出 61 字完整句
    const s = '字'.repeat(60) + '。' + '字'.repeat(99) + '，' + '字'.repeat(300);
    const r = _truncateForTTS(s);
    expect(r).toBe('字'.repeat(60) + '。');
  });

  it('句号在远端（越阈值）→ 采用句号而非更远的逗号', () => {
    // 句号在 200（>64 越阈值），逗号在 300 更远 → 应截到 200 句号
    const s = '字'.repeat(200) + '。' + '字'.repeat(100) + '，' + '字'.repeat(200);
    const r = _truncateForTTS(s);
    expect(r).toBe('字'.repeat(200) + '。');
  });

  it('自定义 max 生效', () => {
    const s = '字'.repeat(100);
    const r = _truncateForTTS(s, 50);
    expect(r).toBe('字'.repeat(50));
  });
});

describe('segmentForTTS 长文分段（滚动播报）', () => {
  it('空/纯空白返回空数组', () => {
    expect(segmentForTTS('')).toEqual([]);
    expect(segmentForTTS('   ')).toEqual([]);
  });

  it('短文本单段原样返回', () => {
    const s = '你好，我是玉瑶。';
    expect(segmentForTTS(s)).toEqual([s]);
  });

  it('短文本即使含多句也单段（≤ maxChars 不切）', () => {
    const s = '第一句。第二句。第三句。';
    expect(segmentForTTS(s)).toEqual([s]);
  });

  it('长文按目标句数（默认3句）切段', () => {
    // 9 句、每句 ~33 字 = ~297 字 > 250 → 触发分段；每段 3 句 = 3 段
    const s = Array.from({ length: 9 }, (_, i) => `第${i + 1}句内容这里是一段足够长的中文句子用来验证分段播报逻辑。`).join('');
    expect(s.length).toBeGreaterThan(TTS_SEGMENT_MAX_CHARS);
    const segs = segmentForTTS(s);
    expect(segs.length).toBe(3); // 9句 / 3句每段 = 3段
    expect(segs[0].endsWith('。')).toBe(true);
    expect(segs[2].endsWith('。')).toBe(true);
    // 每段恰好 3 句（每句 1 个句号）
    for (const seg of segs) {
      expect((seg.match(/。/g) || []).length).toBe(3);
    }
  });

  it('句数未达但字数超 maxChars → 立即切段（字数兜底）', () => {
    // 每句 100 字、共 4 句：第 2 句后即 200 字 → 切；第 3 句到 300>250 → 切
    const s = '字'.repeat(100) + '。' + '字'.repeat(100) + '。' + '字'.repeat(100) + '。' + '字'.repeat(100) + '。';
    const segs = segmentForTTS(s);
    // 段1: 前2句 200 字（未达 3 句但 <250 不切，继续累计；第3句到 300>250 硬切）
    // 实际：第3句句号时 buf=300>250 → 切 3 句；第4句后余 100 字 → 段2
    expect(segs.length).toBe(2);
    for (const seg of segs) {
      expect(seg.length).toBeLessThanOrEqual(TTS_SEGMENT_MAX_CHARS);
    }
  });

  it('无任何标点的超长文本硬切成 maxChars 段', () => {
    const s = '字'.repeat(600);
    const segs = segmentForTTS(s);
    expect(segs.length).toBe(Math.ceil(600 / TTS_SEGMENT_MAX_CHARS));
    for (const seg of segs) {
      expect(seg.length).toBeLessThanOrEqual(TTS_SEGMENT_MAX_CHARS);
    }
    expect(segs.join('')).toBe(s); // 内容无损拼接
  });

  it('自定义句数/字长参数生效', () => {
    // 4 句、每句 56 字 = 224 字；maxChars=50 强制每段 ≤50 字 → 硬切（每句自身超 50 → 句内切）
    const s = Array.from({ length: 4 }, (_, i) => `句${i + 1}这里是足够长的句子内容。`).join('');
    expect(s.length).toBeGreaterThan(50);
    const segs = segmentForTTS(s, 2, 50);
    expect(segs.length).toBeGreaterThan(1); // 字数硬上限迫使多段
    for (const seg of segs) {
      expect(seg.length).toBeLessThanOrEqual(50);
    }
    expect(segs.join('')).toBe(s); // 拼接无损
  });

  it('所有段拼接后内容与原文本一致（无损滚动播报）', () => {
    // 12 句、每句 ~33 字 = ~396 字 > 250 → 多段（每段 3 句），且拼接无损
    const s = Array.from({ length: 12 }, (_, i) => `第${i + 1}句内容这里是一段足够长的中文句子用来验证分段播报逻辑。`).join('');
    expect(s.length).toBeGreaterThan(TTS_SEGMENT_MAX_CHARS);
    const segs = segmentForTTS(s);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.join('')).toBe(s);
  });

  it('句数默认值常量合理', () => {
    expect(TTS_SEGMENT_TARGET_SENTENCES).toBeGreaterThan(0);
    expect(TTS_SEGMENT_MAX_CHARS).toBeGreaterThan(0);
    expect(TTS_SEGMENT_MAX_CHARS).toBeLessThan(TTS_MAX_TEXT);
  });
});
