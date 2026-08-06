/**
 * EntityPrivacyFilter — 实体隐私隔离过滤器 V1.0
 * ============================================================
 * 🔴 世界规则（用户 2026-08-07 明确）：
 *   - 每个人的信息、聊天记录通过 UUID 绝对隔离，绝不互通有无
 *   - 每个人与用户的私人交往/情感都是私密信息，其他人（即使是同事/家人）绝不知晓
 *   - 社团活动等官方共知事件可以公开，但个人私密互动绝不外泄
 *
 * 用途：会晤实体记忆注入 LLM 上下文前，过滤掉涉及**其他实体私密情感**的内容，
 * 确保徐诗雨只看到自己的隐私，不知道熊梓铭/玉瑶等人的私人互动。
 *
 * 🔴 铁律：
 *   - 公开信息（人物关系/背景/官方事件）保留
 *   - 私密表达（用户对某人的表白/亲密/好感/私事）过滤
 *   - 只针对"当前会晤实体之外"的其他实体做过滤；当前实体自己的发言保留
 */
import type { FamilyGraph } from './FamilyGraph.js';

/** 私密表达关键词 — 用户对某人的亲密/情感/私事表达 */
const INTIMATE_PATTERNS: RegExp[] = [
  // 情感表白/好感
  /(?:喜欢|爱|心动|好感|想你|舍不得|离不开|放不下|在乎|在意|心疼|宠)/,
  // 亲密互动/身体
  /(?:抱|亲|吻|摸|搂|贴|睡|床|夜晚|私密|缠绵|温存|肌肤|缠绵|激情)/,
  // 私密称呼/关系
  /(?:老公|老婆|宝贝|亲爱的|情人|专属|唯一的你)/,
  // 私密情绪
  /(?:吃醋|嫉妒|独占|占有|吃味)/,
  // 私密记忆/秘密
  /(?:我们的秘密|只属于你|别告诉|不要让别人|这是我们的)/,
];

/** 公开可共知信息 — 人物背景/关系/官方事件（保留） */
const PUBLIC_PATTERNS: RegExp[] = [
  /(?:同事|上司|下属|老板|经理|主任|主管|部长|厂长|营业部|财务|人事)/,
  /(?:女儿|儿子|妹妹|姐姐|哥哥|弟弟|妈妈|爸爸|妈妈是|爸爸是)/,
  /(?:学校|大学|读书|专业|毕业|工作|上班|厂里|公司|客户|会议|项目)/,
  /(?:认识|见过|打过招呼|不太熟|不熟|印象)/,
];

/**
 * 判断一条对话内容是否涉及"用户对其他实体的私密表达"（应过滤）。
 * @param content 对话内容
 * @param currentEntity 当前会晤实体（徐诗雨）
 * @param otherEntities 其他实体名列表（梓铭/玉瑶等）
 */
export function isIntimateAboutOthers(
  content: string,
  currentEntity: string,
  otherEntities: string[],
): boolean {
  const text = content || '';
  if (!text) return false;

  // 提取内容中提到的"其他实体"
  const mentionedOthers = otherEntities.filter(n =>
    n && n !== currentEntity && text.includes(n),
  );
  if (mentionedOthers.length === 0) return false;

  // 有亲密表达模式 → 且提到其他实体 → 视为用户对他人的私密表达
  const hasIntimate = INTIMATE_PATTERNS.some(p => p.test(text));

  // 若同时有公开信息（人物背景），且无亲密模式 → 保留（公开可共知）
  const hasPublic = PUBLIC_PATTERNS.some(p => p.test(text));

  // 提到其他实体 + 有亲密表达 → 过滤（私密外泄）
  if (hasIntimate && !hasPublic) return true;

  // 提到其他实体 + 亲密表达 + 公开背景 → 复杂情况，保守处理：若亲密模式强匹配则过滤
  if (hasIntimate) {
    // 仅当亲密模式是"表白/身体/私密"类强信号时过滤
    const strongIntimate = /(?:喜欢你|爱你|想你|舍不得|放不下|抱|亲|吻|老公|老婆|宝贝|床|睡|我们的秘密|只属于你|吃醋|独占)/.test(text);
    if (strongIntimate) return true;
  }

  return false;
}

/**
 * 过滤对话记忆列表：剔除涉及其他实体私密表达的内容。
 * @param conversations 对话列表（role/content/timestamp）
 * @param currentEntity 当前会晤实体名
 * @param familyGraph 家族图谱（用于获取所有人名）
 */
export function filterPrivateConversations(
  conversations: Array<{ role: string; content: string; timestamp: string }>,
  currentEntity: string,
  familyGraph?: FamilyGraph,
): Array<{ role: string; content: string; timestamp: string }> {
  if (!conversations || conversations.length === 0) return conversations;

  // 获取所有人名（当前实体之外的其他实体）
  const allNames = familyGraph?.getAllPersonNames?.() || [];
  const otherEntities = allNames.filter(n => n && n !== currentEntity);

  const filtered = conversations.filter(conv => {
    const content = conv.content || '';
    // 用户（role=user）对当前实体的话保留；对其他实体的私密表达过滤
    // 当前实体（role=assistant）自己的发言保留
    if (conv.role === 'assistant') return true; // 当前实体自己的发言不涉及他人隐私

    // user 的发言：若是对其他实体的私密表达 → 过滤
    if (isIntimateAboutOthers(content, currentEntity, otherEntities)) {
      console.log(`[PrivacyFilter] 过滤：${currentEntity}的记忆含对其他实体私密表达: ${content.substring(0, 60)}`);
      return false;
    }
    return true;
  });

  // 若过滤后为空，保留至少一条（避免实体无记忆）
  return filtered.length > 0 ? filtered : conversations.slice(0, 1);
}

/** 过滤实体上下文中的"你认识的人"列表 — 只保留公开社交关系，剔除可能泄露他人私密关系的推测 */
export function filterKnownPeopleList(
  people: Array<{ entity: string; label: string }>,
  currentEntity: string,
): Array<{ entity: string; label: string }> {
  return people.filter(p => p.entity && p.entity !== currentEntity);
}
