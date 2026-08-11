/**
 * DeepSeekStream.test.ts — P1-5 SSE 流式专项测试
 * ==============================================
 * 覆盖：stripThinkingPrefix 纯函数 + generate 流式路径
 * 断言：流式 onToken 拼接 == 返回 text、thinking 不在 onToken、跨 chunk 中文不乱码、stream:true 请求体
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stripThinkingPrefix } from '../DeepSeekLLMProvider.js';

describe('stripThinkingPrefix — P1-5 思维链剥离纯函数', () => {
  it('无思维链前缀 → 原样返回', () => {
    expect(stripThinkingPrefix('好的呀，我在呢。')).toBe('好的呀，我在呢。');
  });
  it('思维链首段（含"让我想想"，双换行边界）→ 剥离', () => {
    const out = stripThinkingPrefix('让我想想接下来怎么回应。\n\n好的呀，我在呢。');
    expect(out).not.toContain('让我想想');
    expect(out).toContain('好的呀');
  });
  it('思维链短段（无双换行，结尾即边界）→ 剥离', () => {
    const out = stripThinkingPrefix('让我想想。好的呀我在呢。');
    expect(out).not.toContain('让我想想');
    expect(out).toContain('好的呀');
  });
  it('空输入 → 空串', () => {
    expect(stripThinkingPrefix('')).toBe('');
  });
  it('非思维链首段不误伤', () => {
    expect(stripThinkingPrefix('今晚月色真美。\n\n我们散步吧。')).toContain('今晚月色真美');
  });
});

describe('DeepSeekLLMProvider — generate 流式路径 (P1-5)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function sseResponse(frames: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const f of frames) c.enqueue(encoder.encode(f));
        c.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  function makeCognition() {
    const snap = {
      pleasure: 0, arousal: 0, intimacy: 0, sexual_attraction: 0, sensory_craving: 0,
      energy_merge: 0, possessiveness: 0, ecstasy: 0, aggression: 0, sincerity: 0, dominance: 0, safety: 0,
    };
    return {
      current: { perception_snapshot: snap, raw_input: '你好呀', calcium: 0, key_entities: [] },
      history: { has_relevant_history: false, summary: '无相关历史记忆' },
      family: { has_family_context: false, relationships: [] },
    };
  }

  function makeParams(extra: Record<string, unknown> = {}) {
    return {
      strategy: { strategy_id: 'test', params: { tone: 'neutral', depth: 'shallow', max_length: 100 } } as any,
      cognition: makeCognition() as any,
      userMessage: '你好呀',
      ...extra,
    } as any;
  }

  it('流式: onToken 拼接 == 返回 text；thinking 不出现在 onToken；请求体带 stream:true', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '让我想想接下来怎么回应。' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '\n\n好的呀，我在呢。' } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(frames));
    (globalThis as any).fetch = fetchMock;

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));

    const joined = tokens.join('');
    expect(result.text).toBe(joined);
    expect(result.text).toContain('好的呀');
    expect(joined).not.toContain('让我想想');   // 思维链被服务端剥离，不推
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.stream).toBe(true);             // 请求体 stream:true
  });

  it('流式: content-only 直推，跨 chunk 中文无乱码', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    // "好的呀" 拆到两个 SSE data 帧（模拟逐 token 推送）
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '好的' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '呀' } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    expect(tokens.join('')).toBe('好的呀');
    expect(result.text).toBe('好的呀');
  });

  it('流式: 中文跨字节包（TextDecoder stream:true 防乱码）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const utf8 = new TextEncoder();
    const full = 'data: ' + JSON.stringify({ choices: [{ delta: { content: '好的呀' } }] }) + '\n\n';
    const bytes = utf8.encode(full);
    const cut = Math.floor(bytes.length / 2);
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); },
    });
    (globalThis as any).fetch = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    expect(tokens.join('')).toBe('好的呀');
    expect(result.text).toBe('好的呀');
    expect(result.text).not.toContain('�'); // 无替换字符
  });

  it('流式: usage 帧被捕获（不阻塞返回 text）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '你好' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 2 } }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));
    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    expect(tokens.join('')).toBe('你好');
    expect(result.text).toBe('你好');
  });

  it('流式: 无 onToken 时走非流式（回归保护）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    // 非流式响应：content 空、reasoning_content 含思维链+答案
    const nonStreamResp = {
      choices: [{ message: { content: '', reasoning_content: '让我想想。\n\n好的呀。' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(nonStreamResp), { status: 200 }));
    (globalThis as any).fetch = fetchMock;
    const provider = new DeepSeekLLMProvider('test-model');
    const result = await provider.generate(makeParams());
    expect(result.text).toContain('好的呀');
    expect(result.text).not.toContain('让我想想');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.stream).toBeUndefined();   // 无 onToken → 非流式请求体
  });
});
