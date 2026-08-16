/**
 * V21 字段边界优先 — 思维链流式泄漏根治（架构级）
 * ======================================================
 * 根因: 此前 StreamThinkingStripper 把 delta.reasoning（思维链: 分析/规划/草稿/评估段）
 *   混入答案识别并 return 出去，导致草稿/评估段逐 token 泄漏前台、语音先播草稿后被覆盖突变断播。
 * V21 方案: 信任 DeepSeek V4-flash 的流式协议字段边界——
 *   - delta.reasoning = 思维链（分析/规划/第一稿/评估段），绝不流式展示，只累积到 reasoningBuf 兜底。
 *   - delta.content   = 最终稿（从答案起点"（"逐 token），流式直推。
 * 期望: onToken 只推 content 的最终稿，reasoning 里一个字符都不泄；result.text 也干净。
 */
import { describe, it, expect, vi } from 'vitest';

// reasoning 字段的思维链（草稿迭代型：第一稿 + 评估段 + "润色一下"）
const REASONING_CHAIN =
  '（诗雨呼吸急促，一手捂着脸，声音细得像从牙缝里漏出来。）鸿艺先生……您又来了。' +
  '这样写：- 有名字自称 ✓ - 清纯的比喻风格 ✓ - 娇嗔害羞 ✓ 字数大概400左右，合适。稍微润色一下。';
// content 字段的最终稿（干净，无草稿无评估）
const CONTENT_FINAL =
  '（诗雨呼吸急促，一手捂着脸，另一手攥着手机，声音细得像从牙缝里漏出来，好半晌才断断续续地开口。）' +
  '鸿艺先生……您、您又来了。这……这让诗雨怎么说呀。';

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const f of frames) c.enqueue(encoder.encode(f)); c.close(); },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function makeParams(extra: Record<string, unknown> = {}) {
  const snap = { pleasure: 0, arousal: 0, intimacy: 0, sexual_attraction: 0, sensory_craving: 0, energy_merge: 0, possessiveness: 0, ecstasy: 0, aggression: 0, sincerity: 0, dominance: 0, safety: 0 };
  return {
    strategy: { strategy_id: 'test', params: { tone: 'neutral', depth: 'shallow', max_length: 100 } } as any,
    cognition: { current: { perception_snapshot: snap, raw_input: '你好呀', calcium: 0, key_entities: [] }, history: { has_relevant_history: false, summary: '' }, family: { has_family_context: false, relationships: [] } } as any,
    userMessage: '你好呀',
    ...extra,
  } as any;
}

describe('V21 字段边界优先（reasoning 永不流式展示）', () => {
  it('reasoning 的草稿/评估段绝不流式展示，content 最终稿直推', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      // reasoning 先来（思维链: 草稿 + 评估段 + "润色一下"）
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning: REASONING_CHAIN.slice(0, 30) } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning: REASONING_CHAIN.slice(30) } }] }) + '\n\n',
      // content 后到（最终稿，逐 token）
      ...[...CONTENT_FINAL].map(ch => 'data: ' + JSON.stringify({ choices: [{ delta: { content: ch } }] }) + '\n\n'),
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    const joined = tokens.join('');

    // content 最终稿完整保留
    expect(joined).toContain('鸿艺先生……您、您又来了');
    // reasoning 草稿/评估段一个字符都不泄
    expect(joined).not.toContain('这样写');
    expect(joined).not.toContain('有名字自称');
    expect(joined).not.toContain('稍微润色一下');
    expect(joined).not.toContain('字数大概400');
    expect(result.text).toBe(joined);
  });

  it('reasoning 评估段出现在 content 之后（尾部评估）也不泄', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: CONTENT_FINAL.slice(0, 40) } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning: '这样写：- 有名字自称 ✓ - 字数合适。润色一下。' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: CONTENT_FINAL.slice(40) } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    const joined = tokens.join('');
    expect(joined).toContain('鸿艺先生……您、您又来了');
    expect(joined).not.toContain('这样写');
    expect(joined).not.toContain('润色一下');
    expect(result.text).toBe(joined);
  });

  it('降级模式: content 全空，答案在 reasoning → 流结束用 reasoningBuf 全量剥离兜底', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    // 降级模式: reasoning 承载思维链 + 答案（无 content 字段）
    const reasoningWithAnswer = '让我想想怎么回应。\n\n好的呀，我在呢。';
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning: reasoningWithAnswer } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    expect(result.text).toContain('好的呀');
    expect(result.text).not.toContain('让我想想');
  });
});
