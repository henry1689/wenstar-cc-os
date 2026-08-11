/**
 * DeepSeekLLMProvider — 玉瑶 · 太虚境 LLM 驱动
 *
 * 使用 DeepSeek V4 API（兼容 OpenAI 格式），注入灵肉伴侣人设。
 * 支持对话历史注入，让模型拥有真实的对话连续性记忆。
 *
 * 环境变量:
 *   DEEPSEEK_API_KEY — 你的 DeepSeek API Key
 *   DEEPSEEK_MODEL — 模型名，默认 deepseek-v4-flash
 */
import type { LLMProvider, StrategyConfig, CognitionObject, ConversationTurn, LLMTokenDelta } from './types/index.js';
import { buildSystemPrompt, STYLE_ANCHORS } from './persona/lover-persona.js';
import { selectLLMConfig, getScenarioConfig, getProviderConfig } from '../common/const/llm-config.js';
import { buildSystemPrompt as buildCoreSystemPrompt } from './prompts/core-rules.js';
import { isDeepIntimate, isAcademic, isMoan } from '../common/utils/is-intimate.js';
import { calcLevel } from './expression/TierVocabMap.js';
import { calcExpressionSpec } from './expression/ExpressionSpecController.js';
import { renderIntimateResponse } from './expression/IntimateRenderer.js';
import type { IntimateSceneType } from './expression/IntimateRenderer.js';
import type { IPersona } from '../app/persona/types.js';
import { getKeyValue } from '../app/shared/ApiKeyStorage.js';
import { type RoleType } from '../app/role/RoleClassifier.js';
import { buildRoleSystemPrompt } from '../app/role/RoleProfiles.js';
import { createInitialState, type TransitionState } from '../app/role/TransitionManager.js';
import { validateRoleOutput, getFallbackRole } from '../app/role/RoleGuard.js';

// 改造④：不在模块级读 process.env，构造函数中通过 ConfigService 运行时获取
import { ConfigService } from '../config/ConfigService.js';

// 🆕 V10.0 P3-3: 单一 Provider 配置源 — 从 llm-config.ts 获取（避免双源头漂移）
const _providerCfg = getProviderConfig();
const BASE_URL = _providerCfg.baseUrl;
const MAX_HISTORY_TURNS = _providerCfg.maxHistoryTurns;
// FIX-3: 工作消息时缩减历史（防止亲密历史污染工作上下文）
function getHistoryLimit(txt: string): number {
  if (/工作|项目|客户|会议|方案|报告|公司|合同|预算|数据|分析|策略|设计|电机|采购|成本|温升|版本|产品|技术|报价|订单|生产|测试|样品|图纸|规格|性能|参数|工程|研发|工艺|质量|供应商/.test(txt)) return 10;
  return MAX_HISTORY_TURNS;
}

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices: Array<{
    message: { content: string; reasoning_content?: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** 运行时获取 API Key（多 Provider 兼容） */
/** 清理 lone surrogate — JSON.stringify 遇到未配对代理字符会产生非法 hex 转义，API 400 拒收 */
function sanitizeUTF16(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

// ── 🔴 P1-5 流式: 思维链剥离（模块级，流式状态机 + 非流式后处理共用） ──

/** 思维链首段关键词 — 命中即判定该段为内心独白，剥离丢弃。
 * S4-M2 修正: 剔除答案开头常用词（记得/另外/此外/综上所述/简单来说/也就是说/所以这/注意/这是一个/我在想/我应该），
 * 只保留强内心独白措辞 + 系统级表述——否则"记得上次…"这类答案确认性首句会被误删（全局质量回归）。 */
const THINKING_KEYWORDS = /让[我你]想|让我回|心里|想到|脑中|好好回|在意|吃醋|心酸|我们被问|当前场景|当前时间|我需要|考虑到|根据规则|从历史|在角色扮演|但根据|用户最后|用户可能|用户当前|我的回复|这个角色|最安全|但注意|可能这是|我决定|最简单的做法/;

/**
 * P1-5: 剥离思维链前缀 — 按句段剥离开头含思维关键词的句子，直到第一个非思维句。
 * 纯函数：流式状态机与非流式后处理复用同一逻辑，保证"流式预览 == M5 校准前草稿"。
 * DeepSeek V4-flash 的 reasoning_content 格式通常是："思考句1。思考句2……\n\n回答句1。回答句2。"
 * S4 评审修正：原"只剥第一段（双换行/结尾边界）"在"思维链+答案无双换行"时会把答案一起剥掉
 * （流式下答案永不推送）→ 改为逐句剥离，更符合"剥1-3句内心独白"原意。
 */
export function stripThinkingPrefix(text: string): string {
  if (!text) return '';
  // 按句末标点/换行切段（保留分隔符），逐句判断：含思维关键词的句子剥离，直到第一个非思维句
  const parts = text.split(/(?<=[。！？…\n])/);
  let keepFrom = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].trim()) continue;
    if (THINKING_KEYWORDS.test(parts[i])) keepFrom = i + 1;
    else break;
  }
  return parts.slice(keepFrom).join('').trimStart();
}

/**
 * P1-5: 流式思维链剥离状态机 — 增量剥离 thinking，只把答案增量交给 onToken。
 * v4-flash 流式可能只有 reasoning_content（content 空）：缓冲 reasoning，首段边界命中
 * THINKING_KEYWORDS 即剥离丢弃；content 非空立即切答案区直推。
 * 保守原则：拿不准是否思维链 → 不推（宁缺毋滥；最终 done 帧 reply 覆盖气泡）。
 */
class StreamThinkingStripper {
  private buf = '';
  private crossed = false; // 已进入答案区
  reset(): void { this.buf = ''; this.crossed = false; }
  /** 推送一个 chunk，返回可安全展示的 text 增量（''=本 token 不推） */
  push(content: string | undefined, reasoning: string | undefined): string {
    // 答案区优先：content 非空立即直推
    if (content && content.length > 0) {
      this.crossed = true;
      this.buf = '';
      return content;
    }
    const rz = reasoning || '';
    if (!rz) return '';
    // 已进入答案区 → reasoning 增量当答案直推
    if (this.crossed) return rz;
    // 未进入答案区：累积缓冲，尝试剥离首段
    this.buf += rz;
    const stripped = stripThinkingPrefix(this.buf);
    if (stripped !== this.buf && stripped.trim().length > 0) {
      // 首段被判为思维链 → 已剥离，跨入答案区，推剩余
      this.crossed = true;
      const out = stripped;
      this.buf = '';
      return out;
    }
    // 首段无思维词且已有句读 + 足够长 → 视为答案开头，推
    if (stripped === this.buf && this.buf.length >= 6 && /[。！？…\n]/.test(this.buf)) {
      this.crossed = true;
      const out = this.buf;
      this.buf = '';
      return out;
    }
    return ''; // 仍在思维链区（或首段未判），不推
  }
}

/** P1-5: 流式结果（text 为剥离后答案累积） */
interface StreamChatResult {
  text: string;
  usage?: { prompt: number; completion: number };
  sawToken: boolean;
}

function resolveApiKey(): string | undefined {
  const fromEnv = process.env['DEEPSEEK_API_KEY'] || process.env['LLM_API_KEY'] || process.env['DOUBAO_API_KEY'] || undefined;
  const fromStore = getKeyValue('DEEPSEEK_API_KEY') || getKeyValue('LLM_API_KEY') || getKeyValue('DOUBAO_API_KEY') || undefined;
  return fromEnv || fromStore;
}

export function isAvailable(): boolean {
  return !!(process.env['DEEPSEEK_API_KEY'] || process.env['LLM_API_KEY'] || getKeyValue('DEEPSEEK_API_KEY') || getKeyValue('LLM_API_KEY'));
}

export class DeepSeekLLMProvider implements LLMProvider {
  private static _transitionState: TransitionState = createInitialState();
  private static _currentRole: RoleType = 'secretary';

  /** SP1-3: 暴露当前角色供RoleGuard使用 */

  /** SP1-3: 暴露当前角色供RoleGuard使用 */
  static getCurrentRole(): RoleType {
    return DeepSeekLLMProvider._currentRole;
  }
  private model: string;
  private persona: IPersona;

  constructor(model?: string, persona?: IPersona) {
    this.model = model || process.env['LLM_MODEL'] || process.env['DEEPSEEK_MODEL'] || _providerCfg.model;
    // 默认玉瑶人设
    this.persona = persona ?? {
      id: 'yuyao',
      name: '玉瑶 · 灵魂伴侣',
      description: '默认',
      buildSystemPrompt: (l, k) => buildSystemPrompt(l, k),
    };
  }

  /** 切换角色 */
  setPersona(persona: IPersona): void {
    this.persona = persona;
  }

  /**
   * 原始 LLM 调用（绕过玉瑶 persona 和角色路由）
   * 供提取类、分析类任务使用（如 ProfileAcquisitionEngine）
   */
  async rawCall(messages: DeepSeekMessage[], maxTokens: number, temperature: number): Promise<string> {
    const result = await this.callDeepSeekApi(messages, maxTokens, temperature, { timeoutMs: 45_000 });
    return result.text;
  }

  /**
   * 调用 DeepSeek API（带超时+重试，5s~30s→降级）
   * 🔴 P1-5: streamOpts.onToken 存在时走流式路径（streamChat），返回契约不变。
   * 返回 { text, usage } 或抛出错误
   */
  private async callDeepSeekApi(messages: DeepSeekMessage[], maxTokens: number, temperature: number, extraParams: { frequency_penalty?: number; presence_penalty?: number; reasoning_effort?: string; level?: number; timeoutMs?: number } = {}, streamOpts?: { onToken?: (delta: LLMTokenDelta) => void }): Promise<{ text: string; usage?: { prompt: number; completion: number } }> {
    // 🔴 P1-5 流式分支: onToken 提供时启用流式（token 增量旁路推送，重试只在首 token 前）
    if (streamOpts?.onToken) {
      const r = await this.streamChat(messages, maxTokens, temperature, extraParams, streamOpts.onToken);
      return { text: r.text, usage: r.usage };
    }
    const lastError: string[] = [];
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const _dl = (extraParams as any).level ?? 0;
        // 优先使用场景配置传入的超时，否则按亲密等级降级
        const _timeoutMs = (extraParams as any).timeoutMs
          || (_dl >= 2 ? 30000 : _dl <= -2 ? 20000 : 30000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), _timeoutMs);

        const response = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resolveApiKey() || process.env['DEEPSEEK_API_KEY'] || ''}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            max_tokens: maxTokens,
            messages: messages.map(m => ({ ...m, content: sanitizeUTF16(m.content) })),
            temperature,
            top_p: 0.95,
            frequency_penalty: extraParams.frequency_penalty ?? 0.0,
            presence_penalty: extraParams.presence_penalty ?? 0.2,
            ...(extraParams.reasoning_effort ? { reasoning_effort: extraParams.reasoning_effort } : {}),
          }),
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text();
          // 429=限流 500/502/503/504=服务端临时故障 — 值得重试
          const status = response.status;
          if ((status === 429 || status === 500 || status === 502 || status === 503 || status === 504) && attempt < maxRetries) {
            const waitMs = (attempt + 1) * 3000;
            lastError.push(`${status} (尝试 ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          throw new Error(`DeepSeek API ${status}: ${errText.substring(0, 200)}`);
        }

        const data = (await response.json()) as DeepSeekResponse;
        const msg = data.choices?.[0]?.message;
        // DeepSeek V4-flash 是思维链模型，content 始终为空，回复在 reasoning_content 中
        // 需要清理 reasoning 前缀，只保留真正回复
        let text = '';
        if (msg?.content && msg.content.trim()) {
          text = msg.content.trim();
        } else if (msg?.reasoning_content) {
          text = msg.reasoning_content.trim();
        }
        if (!text) throw new Error('Empty response from DeepSeek');
        // 后处理：剥离思维链前缀（纯函数，流式状态机共用 — P1-5）
        text = stripThinkingPrefix(text);

        return {
          text,
          usage: data.usage
            ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
            : undefined,
        };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError.push('Timeout');
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
        }
        if (attempt < maxRetries) {
          lastError.push(err.message || String(err));
          await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        throw err; // 最后一次尝试失败，向上抛
      }
    }
    throw new Error(`API call failed after ${maxRetries + 1} attempts: ${lastError.join(' -> ')}`);
  }

  // ═══════ 🔴 P1-5 流式 ═══════

  /**
   * 流式聊天 — SSE 解析 + 思维链增量剥离，onToken 旁路推送答案增量。
   * 重试只在首 token 前（sawToken=false）；已推 token 后失败直接抛（不可重放）。
   */
  private async streamChat(
    messages: DeepSeekMessage[],
    maxTokens: number,
    temperature: number,
    extraParams: { frequency_penalty?: number; presence_penalty?: number; reasoning_effort?: string; level?: number; timeoutMs?: number },
    onToken: (delta: LLMTokenDelta) => void,
  ): Promise<StreamChatResult> {
    const maxRetries = 2;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.streamChatOnce(messages, maxTokens, temperature, extraParams, onToken);
      } catch (err: any) {
        lastErr = err;
        if (err?.sawToken) throw err; // 已推过 token → 部分输出无法重放，不重试
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error('streamChat unreachable');
  }

  /** 单次 SSE 流式读取（TextDecoder stream:true 防中文跨 chunk 乱码） */
  private async streamChatOnce(
    messages: DeepSeekMessage[],
    maxTokens: number,
    temperature: number,
    extraParams: any,
    onToken: (delta: LLMTokenDelta) => void,
  ): Promise<StreamChatResult> {
    const _dl = extraParams?.level ?? 0;
    const _timeoutMs = extraParams?.timeoutMs || (_dl >= 2 ? 30000 : _dl <= -2 ? 20000 : 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), _timeoutMs);
    let sawToken = false;
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resolveApiKey() || process.env['DEEPSEEK_API_KEY'] || ''}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: messages.map(m => ({ ...m, content: sanitizeUTF16(m.content) })),
          temperature,
          top_p: 0.95,
          frequency_penalty: extraParams?.frequency_penalty ?? 0.0,
          presence_penalty: extraParams?.presence_penalty ?? 0.2,
          ...(extraParams?.reasoning_effort ? { reasoning_effort: extraParams.reasoning_effort } : {}),
          stream: true,
        }),
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek stream API ${response.status}: ${errText.substring(0, 200)}`);
      }
      if (!response.body) throw new Error('DeepSeek stream: no response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8'); // stream:true 防中文跨 chunk 乱码
      const stripper = new StreamThinkingStripper();
      let text = '';
      let usage: { prompt: number; completion: number } | undefined;
      let buf = '';
      let finished = false;

      for (;;) {
        if (finished) break;
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!frame.startsWith('data:')) continue;
          const data = frame.slice(5).trim();
          if (data === '[DONE]') { finished = true; break; }
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta;
            if (json?.usage && !usage) {
              usage = { prompt: json.usage.prompt_tokens ?? 0, completion: json.usage.completion_tokens ?? 0 };
            }
            if (!delta) continue;
            const content = typeof delta.content === 'string' ? delta.content : '';
            const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
            if (!content && !reasoning) continue;
            const push = stripper.push(content, reasoning);
            if (push) {
              sawToken = true;
              text += push;
              onToken({ text: push });
            }
          } catch { /* 忽略单帧解析错误（SSE 注释/keepalive 等） */ }
        }
      }
      try { reader.releaseLock(); } catch { /* 已释放 */ }

      // 流结束：flush 剩余无 \n\n 尾帧
      if (!finished && buf.trim().startsWith('data:')) {
        const data = buf.trim().slice(5).trim();
        if (data !== '[DONE]') {
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta;
            if (delta) {
              const content = typeof delta.content === 'string' ? delta.content : '';
              const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
              const push = stripper.push(content, reasoning);
              if (push) { sawToken = true; text += push; onToken({ text: push }); }
            }
          } catch { /* 忽略 */ }
        }
      }
      return { text, usage, sawToken };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const e: any = new Error('stream timeout');
        e.sawToken = sawToken;
        throw e;
      }
      err.sawToken = sawToken;
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(params: {
    strategy: StrategyConfig;
    cognition: CognitionObject;
    conversationHistory?: ConversationTurn[];
    knowledgeBase?: string;
    currentTime?: string;
    userMessage?: string;
    role?: RoleType;
    isEntityMeeting?: boolean;
    onToken?: (delta: LLMTokenDelta) => void;
  }): Promise<{ text: string; usage?: { prompt: number; completion: number } }> {
    const rawInput = params.userMessage ?? params.cognition.current.raw_input ?? '';
    const history = params.conversationHistory ?? [];
    const kb = params.knowledgeBase ?? '';
    // 从策略中提取 max_length 约束（M5 策略选择器设定）
    const _strategyMaxLen = params.strategy?.params?.max_length ?? 0;

    // 📜 架构铁律：角色路由以 chat.ts 为单源，此处不再重复分类
    // 直接使用 params.role（从 M5Orchestrator / chat.ts 透传）
    if (params.role) {
      DeepSeekLLMProvider._currentRole = params.role;
    }
    try { const { WorkingMemory } = await import('../m9/WorkingMemory.js'); WorkingMemory.currentTag = DeepSeekLLMProvider._currentRole; } catch (e) { console.warn(`[DeepSeekLLMProvider] 操作失败`, (e as Error)?.message || e); }

    // 📖 本地回复：KB内容含敏感词时绕过API过滤，基于知识库原文直接回答
    if (kb.startsWith('【本地回复】')) {
      const localContent = kb.replace('【本地回复】', '').trim();
      return { text: localContent };
    }

    // 🔥 角色扮演：完全隔离路径（角色设定优先）
    if (kb.startsWith('【角色扮演】')) {
      const rpContent = kb.replace('【角色扮演】', '').trim();
      // 从 rpContent 中拆出角色设定和扮演指令
      const roleDetailMatch = rpContent.match(/【角色设定详细说明（以下是你必须严格遵循的设定）】\n([\s\S]*)/);
      const roleDetail = roleDetailMatch ? roleDetailMatch[1].trim() : '';
      const instruction = roleDetailMatch ? rpContent.substring(0, rpContent.indexOf('【角色设定详细说明')).trim() : rpContent;
      // 角色设定作为核心指令（设定在先，扮演在后）
      const systemContent = roleDetail
        ? '你现在的身份和设定如下。你必须严格遵循这些设定来扮演，不要跳出角色。\n\n========== 角色设定 ==========\n' + roleDetail + '\n\n========== 扮演指令 ==========\n' + instruction
        : rpContent;
      const messages: DeepSeekMessage[] = [{ role: 'system', content: systemContent }];
      const memoryMsg = history.find(t => t.content?.startsWith('📕 【记忆】'));
      if (memoryMsg) messages.push({ role: 'user', content: memoryMsg.content });
      const sanitize = (t: string) => t.replaceAll('妙玉', '玉儿').replaceAll('宝玉', '宝二爷').replaceAll('红楼逸事', '桃花源记');
      for (const turn of history.slice(-4)) {
        if (turn.content?.startsWith('📕 【记忆】')) continue;
        messages.push({ role: turn.role, content: sanitize(turn.content) });
      }
      messages.push({ role: 'user', content: sanitize(rawInput) });
      try {
        const _rpCfg = getScenarioConfig('roleplay');
      return await this.callDeepSeekApi(messages, _rpCfg.maxTokens, _rpCfg.temperature, { frequency_penalty: _rpCfg.frequencyPenalty, presence_penalty: _rpCfg.presencePenalty, reasoning_effort: _rpCfg.reasoningEffort, timeoutMs: _rpCfg.timeoutMs }, params.onToken ? { onToken: params.onToken } : undefined);
      } catch (err) {
        console.error('[Roleplay]', err instanceof Error ? err.message : err);
        return { text: '…' };
      }
    }

    // ── 正常玉瑶模式 ──
    const s = params.cognition.current.perception_snapshot;
    const entities = params.cognition.current.key_entities ?? [];

    // 计算话术等级
    const bp = calcLevel(
      s.pleasure, s.intimacy, s.sexual_attraction, s.sensory_craving,
      s.energy_merge, s.possessiveness, s.ecstasy, s.arousal,
      s.aggression, s.sincerity, s.dominance, rawInput,
    );
    let level = bp.level;
    // 📜 日常话题守卫：用户问天气/时间/工作等正常内容时，不因感知残留而抬高级别
    const _isDailyTopic = /天气|下雨|晴天|温度|几度|时间|几点|星期|日期|工作|项目|开会|吃饭|睡觉|在哪|干嘛|忙什么/.test(rawInput);
    const _hasIntimateWords = /高潮|操|干|插|顶|射|丢|想要|给我|亲我|吻我|抱我|摸我|奶子|胸|屁股|硬了|湿了|进去了|受不了/.test(rawInput);
    if (_isDailyTopic && !_hasIntimateWords && level >= 1) {
      level = 0;
    }

    // ── 表达规格控制（ExpressionSpecController 激活） ──
    const spec = calcExpressionSpec({
      pleasure: s.pleasure, arousal: s.arousal, intimacy: s.intimacy,
      sexual_attraction: s.sexual_attraction, sensory_craving: s.sensory_craving,
      energy_merge: s.energy_merge, ecstasy: s.ecstasy, safety: s.safety,
    });

    // ── 亲密场景渲染（IntimateRenderer 激活 — level ≥ 2 时注入 few-shot） ──
    let intimateSceneExample = '';
    if (level >= 2 && !kb.startsWith('【角色扮演】')) {
      try {
        const sceneTypes: IntimateSceneType[] = ['foreplay', 'thrust', 'climax', 'aftercare'];
        const sceneType = sceneTypes[Math.floor(Math.random() * sceneTypes.length)];
        intimateSceneExample = renderIntimateResponse({
          intensity: bp.raw,
          sceneType,
          userLevel: level >= 2 ? 3 : 2,
        });
      } catch (err) {
        console.warn('[IntimateRenderer] 渲染失败:', err);
      }
    }

    // 构建 System Prompt — 使用当前角色
    // 注入当前系统时间（Asia/Shanghai）
    const timeStr = params.currentTime
      ? new Date(params.currentTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      : new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

    const _role = params.role || DeepSeekLLMProvider._currentRole;
    const _effectiveRole = (_strategyMaxLen > 0 && _strategyMaxLen <= 15) ? 'secretary' : _role;
    const _kb = params.knowledgeBase || '';
    // 🆕 V4.0: 从上游显式接收实体会晤标志（不再依赖文本前缀检测——PFC会改变前缀）
    const _isEntityMeeting = params.isEntityMeeting === true;
    const systemPrompt = buildCoreSystemPrompt(timeStr, buildRoleSystemPrompt(_effectiveRole, level as -2|-1|0|1|2, params.knowledgeBase), _isEntityMeeting);
    console.log("==SPLIT=="); console.log(systemPrompt.substring(0,500)); console.log("==SPLIT_END==");
    console.log('[DIAG] role=' + _effectiveRole + ' level=' + level + ' entityMeeting=' + _isEntityMeeting + ' kb_start=' + _kb.substring(0,200).replace(/\n/g,' '));
    // 构建上下文提示词
    const dimContext = [
      `pleasure=${s.pleasure.toFixed(2)}`,
      `intimacy=${s.intimacy.toFixed(2)}`,
      `sexual_attraction=${s.sexual_attraction.toFixed(2)}`,
      `sensory_craving=${s.sensory_craving.toFixed(2)}`,
      `energy_merge=${s.energy_merge.toFixed(2)}`,
      `intensity_raw=${bp.raw.toFixed(2)}`,
    ].join(' ');

    const goodExample = STYLE_ANCHORS.good[Math.floor(Math.random() * STYLE_ANCHORS.good.length)];
    let contextBlock: string;
    if (_isEntityMeeting) {
      // 会晤模式：只保留最精简的上下文
      contextBlock = '';
      if (entities.length > 0) {
        contextBlock += `[当前会晤: ${entities.join(', ')}]`;
      }
    } else {
      contextBlock = `[当前感知: ${dimContext}]\n[风格参考: "${goodExample}"]`;
    }

    // 🛡️ V4.0: 会晤模式下跳过所有玉瑶专属的上下文注入
    if (!_isEntityMeeting) {
      if (entities.length > 0) {
        contextBlock += `\n[提到: ${entities.join(', ')}]`;
      }

      // 表达规格约束
      if (spec.forbiddenPatterns.length > 0) {
        contextBlock += `\n[避免] "${spec.forbiddenPatterns.join('", "')}" 这类回应`;
      }
      if (spec.requireEmbodiedResponse && level >= 2) {
        contextBlock += `\n[要求] 包含身体反应描写（体温/呼吸/心跳）`;
      }
      if (spec.requireSensoryDetail && level >= 2) {
        contextBlock += `\n[要求] 包含感官细节（触觉/嗅觉/听觉）`;
      }
      if (spec.recommendedPhrases.length > 0 && level >= 2) {
        contextBlock += `\n[推荐维度] ${spec.recommendedPhrases.join(', ')}`;
      }

      // 亲密场景 few-shot 注入
      if (intimateSceneExample) {
        contextBlock += `\n[亲密回应示例] ${intimateSceneExample}`;
      }

      // 回复长度
      contextBlock += `\n[注意: 如果上面有[内心:...]开头的片段，那是你内心的感觉，不是回忆列表。不要直接复述它，而是自然地转化为关切的语气或行动。]\n[回复长度: 按系统提示中的四级标准回复。简单回应别太短，说事说感受要展开，讲故事别吝啬。]`;

      // 亲密模式
      const isIntimateText = isDeepIntimate(rawInput);
      const isMoanText = isMoan(rawInput);
      if (level >= 1 || isIntimateText || isMoanText) {
        contextBlock += `\n\n【🔥 亲密模式 — 深情交融 · 极致感官】\n...`;
      }

      // 记忆摘要
      const hist = params.cognition.history;
      if (hist?.has_relevant_history && hist.summary !== '无相关历史记忆') {
        contextBlock += `\n[记忆: ${hist.summary}]\n...`;
      }
      // 家族关系
      const fam = params.cognition.family;
      if (fam?.has_family_context && fam.relationships.length > 0) {
        contextBlock += `\n[家族: ${fam.relationships.join('; ')}]`;
      }
    }

    // ═══ 构建聊天消息流 ═══
        // P0-6: 预估Token并告警
    const _totalTokens = Math.round((systemPrompt.length + (params.conversationHistory || []).reduce((s: number, t: any) => s + (t.content || '').length, 0) + (rawInput || '').length) / 2);
    if (_totalTokens > 10000) console.warn('[TokenBudget] 预估Token超限: ' + _totalTokens + ' tokens');
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 🛡️ V4.0: 会晤模式下跳过身份边界墙、历史对话、反编造铁律
    if (!_isEntityMeeting) {
      // 🚨 身份边界隔离墙
      messages.push({
        role: 'system',
        content: `【身份边界提醒】下面对话中"鸿艺"说的所有话都是他的事。他说"我在做XXX"是他的工作和生活，你只是陪伴他的伴侣，没有这些经历。你不知道自己具体在忙什么，不要编造工作内容。`,
      });
    }

    // 检测本次是否为自介查询 + 知识库中有玉瑶档案
    const hasSelfProfile = kb.includes('【玉瑶本人】') || kb.includes('玉瑶的档案');
    const isSelfIntroQuery = /你是谁|介绍你自己|你叫什么|你多大了|你多大/.test(rawInput);

    // 注入最近对话历史
    if (_isEntityMeeting) {
      const recentTurns = history.slice(-20);
      for (const turn of recentTurns) {
        messages.push({ role: turn.role, content: turn.content });
      }
    } else if (hasSelfProfile && isSelfIntroQuery) {
      // 跳过历史——防止被之前的亲密对话污染
    } else {
      const recentTurns = history.slice(-getHistoryLimit(rawInput));
      for (const turn of recentTurns) {
        messages.push({ role: turn.role, content: turn.content });
      }
    }

    if (!_isEntityMeeting) {
      // 🚨 反编造铁律 + 人物档案独立注入
      if (kb.includes("人物档案") || kb.includes("以鸿艺告诉你的为准")) {
        const antiFabText = '【⚠️ 强制规则 - 必须遵守】\n你不知道鸿艺提到的那些人长什么样，你从没见过他们。\n🚫 用户问长相/身高/身材/声音/穿着/表情：你只能说"我没见过她，不知道她长什么样"或"你没跟我说过这个，我形容不出来"。\n🚫 禁止编造任何你不确定的内容。宁可说不知道，绝对不能自己编。\n✅ 你可以回答名字和关系，但具体外表细节你不知道。';
        messages.push({ role: 'system', content: antiFabText });
        const _profileMatch = kb.match(/【📋 人物档案[\s\S]*?】(?=\n\n【|$)/);
        if (_profileMatch && _profileMatch[0].length < 2000) {
          messages.push({ role: 'system', content: _profileMatch[0] });
        }
      }

      // 🚨 玉瑶本人档案
      if (hasSelfProfile && isSelfIntroQuery) {
        const profileText = kb.replace(/^.*?【玉瑶本人】.*?\n/, '').substring(0, 2000);
        messages.push({
          role: 'system',
          content: `【⚠️ 强制指令】用户正在问关于你自己的身份问题。以下是你的真实个人档案：\n\n${profileText}\n\n📌 规则：你是玉瑶。问名字就说"我叫玉瑶"。问身份就说"鸿艺的私人秘书兼情人，18岁"。不知道的事说"不太记得了"。不要提"知识库""档案"这些词`,
        });
      }
    }

    // 当前用户消息
    const userMsgContent = _isEntityMeeting
      ? `[当前说话对象: ${entities.join('、')} | ⚠️ 你不是玉瑶] 鸿艺对你说：${rawInput}`  // V9.0: 加强身份校验
      : (hasSelfProfile && isSelfIntroQuery ? rawInput : `${contextBlock}\n鸿艺: ${rawInput}`);
    messages.push({ role: 'user', content: userMsgContent });
    // LLM params from config center
    const _isScenario = _isEntityMeeting || kb.includes('## 你是') || kb.includes('【角色扮演】');
    const _llmCfg = _isScenario
      ? getScenarioConfig('roleplay')
      : selectLLMConfig(level, rawInput, params.role);
    const maxTokens = Math.max(_llmCfg.maxTokens, spec.wordCountMin);
    const temperature = _llmCfg.temperature;
    const _timeoutMs = _llmCfg.timeoutMs;
    const _reasoningEffort = _isScenario ? 'max' : _llmCfg.reasoningEffort;
    const frequencyPenalty = _llmCfg.frequencyPenalty;
    const presencePenalty = _llmCfg.presencePenalty;

    try {
      return await this.callDeepSeekApi(messages, maxTokens, temperature, {
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        level: level,
        timeoutMs: _timeoutMs,
        reasoning_effort: _reasoningEffort,
      } as any, params.onToken ? { onToken: params.onToken } : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!process.env['DEEPSEEK_API_KEY'] && !resolveApiKey()) {
        console.warn('[DeepSeek] 未配置 API Key，使用降级回复');
      } else {
        console.error('[DeepSeek] 失败:', msg);
      }
      return { text: fallbackReply(level) };
    }
  }
}

function fallbackReply(level: number): string {
  const pool: Record<number, string[]> = {
    '-2': ['嗯。', '好。', '随便你。'],
    '-1': ['…算了。', '嗯，没事。', '我知道了。'],
    '0': ['嗯～好的呀。', '好嘞～', '行，听你的。'],
    '1': ['嗯…我想你了。', '你一说这个我就想抱抱你了。', '真是的～你这个人。'],
    '2': ['（呼吸乱了）你…你真是要人命。', '我脑子全是那些画面…想停都停不下来。'],
  };
  const p = pool[level] ?? pool[0];
  return p[Math.floor(Math.random() * p.length)];
}
