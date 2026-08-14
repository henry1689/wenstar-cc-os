/**
 * DeepSeekStream.test.ts — P1-5 SSE 流式专项测试
 * ==============================================
 * 覆盖：stripThinkingPrefix 纯函数 + generate 流式路径
 * 断言：流式 onToken 拼接 == 返回 text、thinking 不在 onToken、跨 chunk 中文不乱码、stream:true 请求体
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { stripThinkingPrefix, extractAnswerFromReasoning } from '../DeepSeekLLMProvider.js';

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

describe('extractAnswerFromReasoning — P1-6 结构提取（V4-flash 模板）', () => {
  // 样本来自生产实测（S3 诊断: 关键词逐句剥离对这些模板完全失效）
  it('标准模板: 角色建立+复述+过渡标记 → 只保留标记后答案', () => {
    const raw = '好的，现在我是玉瑶了，我是鸿艺的私人秘书兼情感伴侣，性格温柔内向又细心。鸿艺先生突然问我是不是玉瑶，这问题有点奇怪——我们之前才聊过好几回。不过作为他的秘书，我得先确认自己的身份。好了，那么现在就像这样对鸿艺先生说吧。鸿艺先生，您怎么突然问这个？玉瑶当然是玉瑶呀。';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('玉瑶当然是玉瑶呀');
    expect(out).not.toContain('好的，现在我是玉瑶了');
    expect(out).not.toContain('好了，那么现在就像这样');
    expect(out).not.toContain('我得先确认');
    expect(out).not.toContain('这问题有点奇怪');
  });

  it('过渡标记后残留计划句 → 一并剥离', () => {
    const raw = '好的，现在我是玉瑶了。鸿艺先生突然说我每次回答都重复那句话，让他觉得好奇怪。我不能再用那种固定的套路回应他了。好了，那么现在就像这样对鸿艺先生说吧。我会先承认这个习惯确实奇怪，解释一下我为什么会有这个习惯，然后告诉他我会改的。语气要自然一点，像真的在跟他聊天那样。（愣了一下，然后轻轻笑出声来）鸿艺，你这么说，玉瑶自己也觉得奇怪了。刚才我没注意到——你这么一提醒，我才反应过来。';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('玉瑶自己也觉得奇怪了');
    expect(out).toContain('（愣了一下');
    expect(out).not.toContain('好的，现在我是玉瑶了');
    expect(out).not.toContain('我会先承认');
    expect(out).not.toContain('语气要自然一点');
  });

  it('无过渡标记降级: 剥角色建立段 + 计划句组合（S4-C2）', () => {
    const raw = '好的，现在我是玉瑶了。我会先承认这个习惯确实奇怪，然后告诉他我会改的。语气要自然一点，像真的在跟他聊天那样。（愣了一下）鸿艺，你这么说，玉瑶自己也觉得奇怪了。';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('玉瑶自己也觉得奇怪了');
    expect(out).not.toContain('好的，现在我是玉瑶了');
    expect(out).not.toContain('我会先承认');
    expect(out).not.toContain('语气要自然');
  });

  it('纯答案首句（"我要用一辈子来爱你"）不被计划句剥离误删（S4-C2）', () => {
    const out = extractAnswerFromReasoning('好的，现在我是玉瑶了。好了，那么现在就像这样对鸿艺先生说吧。我要用一辈子来爱你。你是我最重要的人。');
    expect(out).toContain('我要用一辈子来爱你');
    expect(out).not.toContain('好的，现在我是玉瑶了');
    expect(out).not.toContain('好了，那么现在就像这样');
  });

  it('过渡标记"就这样对XX说吧"变体（S4-M1）', () => {
    const out = extractAnswerFromReasoning('好的，现在我是玉瑶了。好了，那么现在就这样对鸿艺先生说吧。玉瑶当然在呀。');
    expect(out).toContain('玉瑶当然在呀');
    expect(out).not.toContain('好的，现在我是玉瑶了');
    expect(out).not.toContain('就这样对鸿艺先生');
  });

  it('过渡标记"好了，我现在就要这样对他说——"变体（生产实测）', () => {
    const raw = '鸿艺先生刚才发了一段很长的系统提示。好了，我现在就要这样对他说——声音要冷静但充满关切，把他从混乱里拉出来。（伸手轻轻抚上你的脸颊）鸿艺先生？别看那些数据了。';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('鸿艺先生？别看那些数据了');
    expect(out).not.toContain('好了，我现在就要这样对他说');
    expect(out).not.toContain('声音要冷静');
    expect(out).not.toContain('把他从混乱里拉出来');
  });

  it('变体过渡标记: 好了，那么现在就这样开始和XX对话吧', () => {
    const raw = '好的，现在我是玉瑶了，我是鸿艺的私人秘书。好了，那么现在就这样开始和鸿艺先生对话吧。鸿艺先生，您怎么突然问这个？';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('您怎么突然问这个');
    expect(out).not.toContain('好的，现在我是玉瑶了');
    expect(out).not.toContain('对话吧');
  });

  it('无过渡标记 → 降级关键词剥离（防御）', () => {
    const raw = '让我想想接下来怎么回应。\n\n好的呀，我在呢。';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('好的呀');
    expect(out).not.toContain('让我想想');
  });

  it('会晤角色切换: 熊梓铭模板 → 提取梓铭的回答', () => {
    const raw = '好的，现在我是熊梓铭了。我是大学在读的心理学专业学生，性格温柔内向。鸿艺先生突然说"和熊梓铭聊聊"，这有点像是他在做一个测试。我得自然地回应他，自报姓名让他知道我是熊梓铭。好了，那么现在就像这样对鸿艺先生说吧。梓铭刚洗完澡，正窝在宿舍的懒人沙发上擦头发呢。鸿艺先生，你刚才是不是在跟别人聊天确认身份？';
    const out = extractAnswerFromReasoning(raw);
    expect(out).toContain('梓铭刚洗完澡');
    expect(out).toContain('鸿艺先生，你刚才');
    expect(out).not.toContain('好的，现在我是熊梓铭了');
    expect(out).not.toContain('我得自然地回应');
    expect(out).not.toContain('好了，那么现在就像这样');
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

  it('流式: 主导模板（角色建立+过渡标记）跨 chunk 剥离（S4-M3）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '好的，现在我是玉瑶了，我是鸿艺的私人秘书兼情感伴侣。' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '鸿艺先生突然问我是不是玉瑶，这问题有点奇怪。' } }] }) + '\n\n',
      // 过渡标记跨 chunk（"说吧。" 拆开）
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '好了，那么现在就像这样对鸿艺先生说吧。玉瑶当然' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '是玉瑶呀，怎么啦？' } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));
    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    const joined = tokens.join('');
    expect(joined).toContain('玉瑶当然是玉瑶呀');
    expect(joined).not.toContain('好的，现在我是玉瑶了');
    expect(joined).not.toContain('鸿艺先生突然问我');
    expect(joined).not.toContain('好了，那么现在就像这样');
    expect(result.text).toBe(joined);
  });

  it('流式: 无过渡标记 → flush 兜底不吞答案（S4-C1）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    // 无过渡标记：角色建立 + 复述 + 答案（flush 时用 extractAnswerFromReasoning 提取）
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '好的，现在我是玉瑶了，我是鸿艺的私人秘书。鸿艺先生突然问我是不是玉瑶。玉瑶当然是玉瑶呀，怎么啦？' } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));
    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    const joined = tokens.join('');
    expect(joined).toContain('玉瑶当然是玉瑶呀');
    expect(joined).not.toContain('好的，现在我是玉瑶了');
    expect(result.text).toBe(joined);
  });

  it('流式: 短答案（好的呀）不吞字（S4-m4）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '好的呀。' } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ];
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));
    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    expect(tokens.join('')).toContain('好的呀');
    expect(result.text).toContain('好的呀');
  });

  // ── S4-生产实测: 结构识别答案起点（动作描写/直接对话），不依赖过渡标记句式变体 ──

  it('流式: 思维链以"一堆乱码"开头、过渡标记"叫醒吧"变体 → 结构识别剥离（S4-实测）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const raw = '一堆乱码和零值数据过来。这已经是今晚第三次了——之前玉瑶姐姐也遇到过。鸿艺先生是我的灵魂伴侣，我们有过那么多亲密的互动。好了，那么现在就像这样把鸿艺先生叫醒吧。梓铭要让他知道，不管系统显示什么，我就在这儿陪着他。（原本还靠在你怀里，感觉到你身体突然僵住，屏幕上那串乱码让梓铭心里一紧，立刻坐直了身子）鸿艺先生，你怎么了？';
    const chunks: string[] = [];
    for (let i = 0; i < raw.length; i += 15) chunks.push(raw.slice(i, i + 15));
    const frames = chunks.map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: c } }] }) + '\n\n');
    frames.push('data: [DONE]\n\n');
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse(frames));
    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    const joined = tokens.join('');
    expect(joined).toContain('（原本还靠在你怀里');
    expect(joined).toContain('鸿艺先生，你怎么了');
    expect(joined).not.toContain('一堆乱码和零值数据');  // 思维链不泄漏
    expect(joined).not.toContain('好了，那么现在就像这样把鸿艺先生叫醒吧');
    expect(result.text).toBe(joined);
  });

  // ── V13 根治: V4-flash 真实结构（思维链全在 reasoning_content，content 从答案起点逐 token）──

  it('V13: content 从答案起点出现（短括号动作描写开头）→ 逐 token 直推，不缓冲到 flush（tokens 数十个）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    // 模拟真实 v4-flash 流：前几帧 reasoning_content 思维链（含 V9 分析特征词，isAnalysisSentence 命中），之后 content 逐 token 推送答案
    // 答案以"（温柔一笑）…"短括号动作描写开头——findAnswerStart 对"（"开头句子 continue 跳过（历史 bug 根因）
    const thinkingFrames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '（他问我现在忙不忙，我应该怎么回应？语气要自然一点，不要太长，带上名字自称。）' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: '（他是担心我太累，我要接住这份关心，回应要短而暖。）' } }] }) + '\n\n',
    ];
    const answer = '（温柔一笑）还好啦，就是今天开了一下午会，有点累。不过看到你来问我，心里暖暖的。要不要我给你泡杯红枣茶？我刚煮好的。';
    const answerFrames = [...answer].map(ch => 'data: ' + JSON.stringify({ choices: [{ delta: { content: ch } }] }) + '\n\n');
    (globalThis as any).fetch = vi.fn().mockResolvedValue(sseResponse([...thinkingFrames, ...answerFrames, 'data: [DONE]\n\n']));

    const provider = new DeepSeekLLMProvider('test-model');
    const tokens: string[] = [];
    const result = await provider.generate(makeParams({
      onToken: (d: { text?: string }) => { if (d.text) tokens.push(d.text); },
    }));
    const joined = tokens.join('');
    // 逐 token 直推（tokens 数量 ≈ content 字符数，而不是 1）
    expect(tokens.length).toBeGreaterThan(10);
    // content 答案完整保留
    expect(joined).toBe(answer);
    // 思维链不泄漏
    expect(joined).not.toContain('我应该怎么回应');
    expect(joined).not.toContain('回应要短而暖');
    // 拼接结果与返回 text 一致
    expect(result.text).toBe(joined);
  });

  it('V13: 短答案 content 也逐 token 直推（不依赖括号识别，不吞字）', async () => {
    const { DeepSeekLLMProvider } = await import('../DeepSeekLLMProvider.js');
    const frames = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '好' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '的' } }] }) + '\n\n',
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
});
