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

/** P1-6 探针: 确认生产服务加载含结构识别的最新代码（模块加载时打印） */
// (探针已移除 — 剥离逻辑经生产实测验证)

/** 思维链首段关键词 — 命中即判定该段为内心独白，剥离丢弃。
 * S4-M2 修正: 剔除答案开头常用词（记得/另外/此外/综上所述/简单来说/也就是说/所以这/注意/这是一个/我在想/我应该），
 * 只保留强内心独白措辞 + 系统级表述——否则"记得上次…"这类答案确认性首句会被误删（全局质量回归）。 */
const THINKING_KEYWORDS = /让[我你]想|让我回|心里|想到|脑中|好好回|在意|吃醋|心酸|我们被问|当前场景|当前时间|我需要|考虑到|根据规则|从历史|在角色扮演|但根据|用户最后|用户可能|用户当前|我的回复|这个角色|最安全|但注意|可能这是|我决定|最简单的做法/;

/**
 * P1-5: 剥离思维链前缀 — 按句段剥离开头含思维关键词的句子，直到第一个非思维句。
 * 保留作降级路径（extractAnswerFromReasoning 找不到过渡标记时的兜底）。
 * DeepSeek V4-flash 的 reasoning_content 格式通常是："思考句1。思考句2……\n\n回答句1。回答句2。"
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

// ── 🔴 P1-6 思维链结构提取（S3 实测诊断: V4-flash 思维链有固定模板，关键词逐句剥离完全失效）──
// 实测模板:
//   ① 角色建立: "好的，现在我是玉瑶了，我是鸿艺的私人秘书兼情感伴侣…"
//   ② 复述+分析: "鸿艺先生突然问我是不是玉瑶，这问题有点奇怪…"
//   ③ 自我要求: "不过作为他的秘书，我得先确认自己的身份…"
//   ④ 过渡标记: "好了，那么现在就像这样对鸿艺先生说吧。"  ← 真正答案从这里开始（几乎每条必现）
//   ⑤ 计划句(标记后偶有残留): "我会先承认这个习惯确实奇怪，…语气要自然一点…"

/** 答案起点过渡标记 — V4-flash 思维链结尾转场锚点（取其后为真正答案）。
 * S4-M1 + 生产实测增强: V4-flash 句式漂移多变，枚举精确句式追不上。用非贪婪 + 语义锚点集合
 * （回应/回答/对/和/说）覆盖全部变体，且非贪婪停在第一个锚不误吃答案：
 *   "好了，那么现在就像这样对鸿艺先生说吧。" / "好了，那么现在就这样开始和鸿艺先生对话吧。"
 *   / "好了，我现在就要这样对他说——" / "好了，现在就像这样开始回应他吧。"（实测漂移）
 * 结尾吃可选语气词/破折号防残留 */
const ANSWER_MARK_RE = /(?:好了|好)，[^。]{0,18}?(?:回应|回答|对|和|说)[^。]{0,12}?(?:吧|了|——)[。]?/;
function findAnswerMark(text: string): { index: number; length: number } | null {
  const m = text.match(ANSWER_MARK_RE);
  if (m && typeof m.index === 'number') return { index: m.index, length: m[0].length };
  return null;
}

/**
 * S4-生产实测: V4-flash 过渡标记句式漂移枚举不完（说吧/对话吧/叫醒吧/回应他吧…）。
 * 结构识别答案起点更鲁棒——答案几乎总以三类之一开头：
 *   ① 动作描写 "（…）" / "(…)"
 *   ② 称呼 + 第二人称 + 对话动作（疑问/祈使）: "鸿艺先生，你怎么了？"
 *   ③ 自称 + 具体场景: "梓铭刚洗完澡，正窝在宿舍…"
 * 思维链（我得/我要/作为/最重要的是…）不含以上形态。逐句判断，返回第一个答案句的文本位置。
 */
function isAnswerSentence(s: string): boolean {
  if (/^[（(]/.test(s)) return true;
  // 称呼 + 第二人称 + 对话动作（"鸿艺先生，你怎么了？"）。
  //   S4-生产实测: 词表去"来"——"鸿艺先生又发来乱码了"的"来"是补语，误判思维链为答案
  if (/(?:鸿艺先生|鸿艺|梓铭|玉瑶)[^。]{0,25}(?:你|您)/.test(s) && /[？?！!]|怎么|别|看|听|摸摸|叫|散会/.test(s)) return true;
  if (/(?:梓铭|玉瑶)刚/.test(s)) return true;
  // S4-生产实测: 自称+语气词结尾的答案（"玉瑶当然是玉瑶呀"）。
  //   注意: 不能只靠"？/！"结尾判定（思维链"那时候我做了什么？"也以？结尾），必须自称+语气词
  if (/(?:玉瑶|梓铭).{0,20}[呀嘛呢吧啊诶]/.test(s) && !/^(?:我得|我要|我需要|我先|我想|我记得|我可以|我决定|作为|最重要的是|那时候|然后|对，|现在)/.test(s)) return true;
  return false;
}
function findAnswerStart(text: string): number | null {
  const sentences = text.split(/(?<=[。！？…\n])/);
  let pos = 0;
  for (const s of sentences) {
    if (!s.trim()) { pos += s.length; continue; }
    if (isAnswerSentence(s.trim())) return pos;
    pos += s.length;
  }
  return null;
}

/**
 * 计划句剥离 — 过渡标记后残留的"面向回答的抽象自我指令"。
 * S4-C2 修正: "我会先/我得/我需要/我要用"可能被真实答案首句使用（"我要用一辈子来爱你"），
 *   不能直接剥。组合判定: 仅当 "我会先…" 句后紧接 "语气要/回答要" 等其他计划句时才剥（用户实测
 *   "我会先承认…。语气要自然一点…" 组合）；纯答案句（后无计划句）保留。
 */
function stripPlanningPrefix(text: string): string {
  let t = text;
  for (let i = 0; i < 5; i++) {
    // ① 明确指令计划句（语气要/回答要/声音要… — 描述"如何回应"的自我指令，几乎必是计划句，非答案本体）
    const m = t.match(/^(?:语气要|回答要|声音要|态度要|眼神要|表情要)[^。]{2,}。?/);
    if (m) { t = t.slice(m[0].length).trimStart(); continue; }
    // ② "我会先/我得/我需要/我要用/我要保持"开头 + 后续还有计划句 → 整段计划
    if (/^(?:我会先|我得|我需要|我要用|我要保持|然后我要|接着我要)/.test(t)) {
      const firstSentence = t.match(/^[^。]+。?/);
      const rest = firstSentence ? t.slice(firstSentence[0].length).trimStart() : '';
      if (rest && /^(?:语气要|回答要)/.test(rest)) { t = rest; continue; }
    }
    break;
  }
  return t;
}

/**
 * P1-6: 从 reasoning_content 提取真正答案（结构提取，替代关键词逐句）。
 * ① 找过渡标记取其后（最可靠锚点）→ ② 剥计划句 → ③ 无标记降级 stripThinkingPrefix → ④ 保底原文。
 * 非流式最终 reply 的唯一出口；流式状态机共用 findAnswerMark。
 */
/** 角色建立段（无过渡标记时的降级防御）: "好的，现在我是{角色}了，我是{描述}…" */
const ROLE_SETUP_RE = /^好的，现在我是[^。]{1,20}了(?:，[^。]{1,80})?。?/;
function stripRoleEstablishment(text: string): string {
  const m = text.match(ROLE_SETUP_RE);
  if (m) return cleanTail(text.slice(m[0].length));
  return text;
}

/** 清理 tail 前导空白/孤立标点（切答案起点后可能残留 "。(" 之类） */
function cleanTail(s: string): string {
  return s.replace(/^[\s。！？…,.，、]+/, '');
}

export function extractAnswerFromReasoning(text: string): string {
  if (!text) return '';
  // ① 过渡标记（最精确，命中即切其后）
  const m = findAnswerMark(text);
  if (m) {
    const tail = cleanTail(text.slice(m.index + m.length));
    const clean = stripPlanningPrefix(tail);
    // S4-C2: 剥空 → 返回未剥离 tail（防落降级路径泄漏过渡标记）；tail 也空 → 落降级防 Empty
    if (clean) return clean;
    if (tail) return tail;
  }
  // ② 结构识别答案起点（S4-生产实测: 过渡标记句式漂移枚举不完，动作描写/直接对话更鲁棒）
  const as = findAnswerStart(text);
  if (as !== null) {
    const tail = cleanTail(text.slice(as));
    const clean = stripPlanningPrefix(tail);
    if (clean) return clean;
    if (tail) return tail;
  }
  // 降级（无过渡标记/无答案起点）: 剥角色建立段 → 再找答案起点。
  // S4-生产实测修正: 角色建立段("好的，现在我是XX了")后还有大量思维链(角色描述/复述/计划)，
  //   剥第一句就返回会泄漏后续思维链——必须继续 findAnswerStart，找不到则返回原文（让外层缓冲等答案起点）。
  let t = stripRoleEstablishment(text);
  if (t !== text) {
    const as2 = findAnswerStart(t);
    if (as2 !== null) {
      const tail = cleanTail(t.slice(as2));
      const clean = stripPlanningPrefix(tail);
      if (clean) return clean;
      if (tail) return tail;
    }
    // 剥了角色建立段但后面仍无答案起点 → 返回原文（不剥），防思维链当答案
    return text;
  }
  return stripThinkingPrefix(text);
}

/**
 * P1-5: 流式思维链剥离状态机 — 增量剥离 thinking，只把答案增量交给 onToken。
 * S3 诊断修正: 关键词逐句剥离对 V4-flash 结构模板（角色建立→复述→过渡标记）失效，
 *   只认过渡标记切答案区；思维链特征开头(角色建立段)缓冲不推；无标记时降级关键词逻辑。
 * content 非空立即切答案区直推。保守原则：拿不准 → 不推（done 帧 reply 覆盖气泡）。
 */
class StreamThinkingStripper {
  private buf = '';
  private crossed = false; // 已进入答案区
  reset(): void { this.buf = ''; this.crossed = false; }
  /** 推送一个 chunk，返回可安全展示的 text 增量（''=本 token 不推） */
  push(content: string | undefined, reasoning: string | undefined): string {
    const c = content || '';
    const r = reasoning || '';
    if (!c && !r) return '';
    // 已进入答案区 → content 优先（答案在 content），reasoning 兜底
    if (this.crossed) return c || r;
    // 合并进 buf（S4-生产实测: 思维链可能出现在 reasoning 或 content 字段，统一累积后结构识别）
    this.buf += r + c;
    // ① 过渡标记 → 切答案区，推标记后（剥计划句）
    const m = findAnswerMark(this.buf);
    if (m) {
      this.crossed = true;
      const tail = stripPlanningPrefix(cleanTail(this.buf.slice(m.index + m.length)));
      this.buf = '';
      return tail;
    }
    // ② 结构识别答案起点（S4-生产实测: 动作描写/直接对话，比过渡标记更鲁棒）
    const as = findAnswerStart(this.buf);
    if (as !== null) {
      this.crossed = true;
      const tail = stripPlanningPrefix(cleanTail(this.buf.slice(as)));
      this.buf = '';
      return tail;
    }
    // ③ 角色建立段开头（"好的，现在我是…"）→ 缓冲等标记。
    //    S4-C1: 加 200 字上限防"无标记流式吞整条"——超长仍未标记则落④降级
    if (/^好的，现在/.test(this.buf) && this.buf.length < 200) return '';
    // ④ 无标记/无答案起点：非流式提取兜底（剥角色建立/关键词/计划句 — S4-M2 与主路径对齐）
    const extracted = extractAnswerFromReasoning(this.buf);
    if (extracted && extracted !== this.buf && extracted.trim().length > 0) {
      this.crossed = true;
      this.buf = '';
      return extracted;
    }
    // ⑤ 提取=原文（无思维链可剥）→ 不推，等答案起点/标记/flush（宁可用"思考中"换干净输出，done 帧覆盖气泡）
    return '';
  }
  /** 流结束兜底：残留 buf 用非流式提取（S4-C1/m4 防无标记/短答案吞字） */
  flush(): string {
    if (this.crossed || !this.buf) return '';
    const extracted = extractAnswerFromReasoning(this.buf);
    this.crossed = true;
    this.buf = '';
    return extracted;
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
        // 🔴 P1-6: 从 reasoning_content 结构提取真正答案（过渡标记 + 计划句 + 降级）
        //   S3 实测诊断: 关键词逐句剥离对 V4-flash 模板失效，整个思考过程被当答案返回
        text = extractAnswerFromReasoning(text);

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
            // S4-生产实测: 真实 v4-flash 流式思维链在 delta.reasoning 字段（非 reasoning_content）！
            //   content 承载答案（从答案起点"（"开始非空），reasoning 承载思维链（逐 token）。
            const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning
              : (typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '');
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
      // S4-C1/m4: 流结束 flush 残留思维链缓冲（防无标记/短答案整条被吞）
      const flushed = stripper.flush();
      if (flushed) { sawToken = true; text += flushed; onToken({ text: flushed }); }
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
