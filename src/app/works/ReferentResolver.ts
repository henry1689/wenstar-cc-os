/**
 * ReferentResolver — 指称词解析器
 * ============================================================
 * 把"那篇小说/继续写/标题"这类指称词解析成作品主键（work_id），
 * 走主键直达查询，绕过模糊匹配——这是"长文召回"的元数据桥。
 *
 * 评审修订（V2）：
 *   - 时间衰减权重：优先当前会话最近作品
 *   - 跨会话指称策略
 *   - 降级回落：解析失败返回 null（调用方平滑回落 5 路召回）
 */
import type { WorkRecord, WorkRepository } from './WorkRepository.js';

/**
 * 指称词模式（S5-评审收紧，消除日常对话误触发）：
 * 必须出现"指称结构"——那/这/我们/上次 等指称前缀 + 量词，或"那篇"整体。
 * 去掉 设定/开头/结尾 等日常高频词（"开头写得不错"不触发）。
 * 且要求 指称前缀+量词 至少出现一个（拒绝"这篇文章你看了吗"里"文章"裸词单独命中）。
 */
/**
 * 指称词模式（S5-评审收紧，全部非捕获组）：
 * 要求"指称结构"前缀（那/这/我们/上次/之前/刚才/昨天 + 量词），
 * 拒绝"设定/开头/结尾"等日常高频词。
 * 仅匹配创作类名词：小说/故事/文章/作品/短文/长文/连载/同人/番外。
 */
const REFERENT_RE = /(?:那|这|我们|上次|之前|刚才|昨天)(?:篇|本|部|首)?\s*(?:小说|故事|文章|作品|短文|长文|连载|同人|番外|那篇)/;

/**
 * 讨论/评价句检测（弱指称）：
 * "这篇文章你看了吗/开头写得不错/那篇小说我不同意" — 有评价动词 → 弱指称（仅摘要）。
 */
const DISCUSSION_RE = /(?:看了吗|看过吗|怎么样|如何|写得|写得?不错|好不好|觉得|认为|同意|不同意|喜欢|讨厌|结尾|开头|情节|设定|评论|评价|分析|觉得)/;

/**
 * 续写动作（S5-评审收紧）：要求明确的创作续写语义。
 * 拒绝"再来一个""又来打扰"——"来/讲"需与创作名词共现。
 */
const CONTINUE_RE = /(?:继续|接着|再|又)(?:写|更)(?:小说|故事|文章|作品|这个|这部|那篇)?|续写|接着上次|接着写(?:小说|故事|文章)?/;

/** 标题指称：消息含 2-10 字名词（可能命中作品标题） */
const TITLE_CANDIDATE_RE = /[一-龥]{2,10}/g;

export interface ResolveResult {
  work: WorkRecord | null;
  /** 是否命中指称词 */
  matched: boolean;
  /** 解析作用域（会晤实体 or 户主钥匙） */
  scope: string;
  /**
   * S5-评审: 强指称标记。
   * true = 明确的"取回/续写"意图（全文注入）；
   * false = 讨论/评价句（"这篇文章你看了吗"），仅注入标题+摘要，避免上下文污染。
   */
  isStrong: boolean;
}

/**
 * 解析指称词 → 作品主键。
 * @param message 用户消息
 * @param repo WorkRepository
 * @param activeEntityUuids 会晤/活跃实体 UUID（空 = 户主钥匙）
 * @returns 解析结果（work 可能为 null，调用方回落）
 */
export function resolveReferent(
  message: string,
  repo: WorkRepository,
  activeEntityUuids: string[],
): ResolveResult {
  const msg = (message || '').trim();
  if (msg.length < 2) return { work: null, matched: false, scope: activeEntityUuids.length > 0 ? 'meeting' : 'master', isStrong: false };

  // ① 明确指称词（那篇小说/我们写的故事/这篇作品）
  const refMatch = msg.match(REFERENT_RE);
  if (refMatch) {
    // S5-评审: 讨论/评价句（看了吗/写得怎么样/我不同意）→ 弱指称，仅摘要注入
    const isStrong = !DISCUSSION_RE.test(msg);
    // workType 从消息中出现的创作名词推断（REFERENT_RE 全非捕获组，不能取 refMatch[1]）
    const workType = _mapTypeFromMsg(msg);
    // 会晤/实体作用域优先
    if (activeEntityUuids.length > 0) {
      // 找该实体最新作品
      const work = repo.findLatestWork(activeEntityUuids[0], workType);
      if (work) return { work, matched: true, scope: 'meeting', isStrong };
    }
    // 户主钥匙：全库最新（时间衰减）
    const work = repo.findLatestWork(undefined, workType);
    if (work) return { work, matched: true, scope: 'master', isStrong };
    // 解析失败 → 回落
    return { work: null, matched: true, scope: activeEntityUuids.length > 0 ? 'meeting' : 'master', isStrong };
  }

  // ② 续写动作（继续写/接着写/续写）— 明确的续写意图 → 强指称全文
  if (CONTINUE_RE.test(msg)) {
    if (activeEntityUuids.length > 0) {
      const work = repo.findLatestWork(activeEntityUuids[0]);
      if (work) return { work, matched: true, scope: 'meeting', isStrong: true };
    }
    const work = repo.findLatestWork();
    if (work) return { work, matched: true, scope: 'master', isStrong: true };
  }

  // ③ 标题指称：消息含名词，尝试标题模糊匹配 — 弱指称（仅摘要）
  const candidates = msg.match(TITLE_CANDIDATE_RE) || [];
  for (const kw of candidates) {
    if (kw.length < 2) continue;
    if (activeEntityUuids.length > 0) {
      const work = repo.findWorkByTitleFuzzy(kw, activeEntityUuids[0]);
      if (work) return { work, matched: true, scope: 'meeting', isStrong: false };
    }
    const work = repo.findWorkByTitleFuzzy(kw);
    if (work) return { work, matched: true, scope: 'master', isStrong: false };
  }

  return { work: null, matched: false, scope: activeEntityUuids.length > 0 ? 'meeting' : 'master', isStrong: false };
}

/** 从消息中推断 work_type（REFERENT_RE 全非捕获组，从原文找创作名词） */
function _mapTypeFromMsg(msg: string): 'novel' | 'story' | 'article' | undefined {
  if (/(?:小说|连载|同人|番外)/.test(msg)) return 'novel';
  if (/故事/.test(msg)) return 'story';
  if (/(?:文章|短文|长文|作品)/.test(msg)) return 'article';
  return undefined;
}
