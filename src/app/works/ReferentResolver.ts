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

/** 指称词模式：那篇/这篇/我们/上次 + 小说/故事/文章/作品/连载... */
const REFERENT_RE = /(?:那|这|我们|上次|之前|刚才|昨天)?\s*(?:篇|本|部|首)?\s*(小说|故事|文章|作品|短文|长文|连载|同人|番外|设定|开头|结尾|那篇)/;

/** 续写动作：继续写/接着写/再写/续写 */
const CONTINUE_RE = /(?:继续|接着|再|又)(?:写|更|讲|来)|续写|接着上次/;

/** 标题指称：消息含 2-10 字名词（可能命中作品标题） */
const TITLE_CANDIDATE_RE = /[一-龥]{2,10}/g;

export interface ResolveResult {
  work: WorkRecord | null;
  /** 是否命中指称词 */
  matched: boolean;
  /** 解析作用域（会晤实体 or 户主钥匙） */
  scope: string;
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
  if (msg.length < 2) return { work: null, matched: false, scope: activeEntityUuids.length > 0 ? 'meeting' : 'master' };

  // ① 明确指称词（那篇小说/我们写的故事/这篇作品）
  const refMatch = msg.match(REFERENT_RE);
  if (refMatch) {
    const workType = _mapType(refMatch[1]);
    // 会晤/实体作用域优先
    if (activeEntityUuids.length > 0) {
      // 找该实体最新作品
      const work = repo.findLatestWork(activeEntityUuids[0], workType);
      if (work) return { work, matched: true, scope: 'meeting' };
    }
    // 户主钥匙：全库最新（时间衰减）
    const work = repo.findLatestWork(undefined, workType);
    if (work) return { work, matched: true, scope: 'master' };
    // 解析失败 → 回落
    return { work: null, matched: true, scope: activeEntityUuids.length > 0 ? 'meeting' : 'master' };
  }

  // ② 续写动作（继续写/接着写/续写）
  if (CONTINUE_RE.test(msg)) {
    if (activeEntityUuids.length > 0) {
      const work = repo.findLatestWork(activeEntityUuids[0]);
      if (work) return { work, matched: true, scope: 'meeting' };
    }
    const work = repo.findLatestWork();
    if (work) return { work, matched: true, scope: 'master' };
  }

  // ③ 标题指称：消息含名词，尝试标题模糊匹配
  const candidates = msg.match(TITLE_CANDIDATE_RE) || [];
  for (const kw of candidates) {
    if (kw.length < 2) continue;
    if (activeEntityUuids.length > 0) {
      const work = repo.findWorkByTitleFuzzy(kw, activeEntityUuids[0]);
      if (work) return { work, matched: true, scope: 'meeting' };
    }
    const work = repo.findWorkByTitleFuzzy(kw);
    if (work) return { work, matched: true, scope: 'master' };
  }

  return { work: null, matched: false, scope: activeEntityUuids.length > 0 ? 'meeting' : 'master' };
}

/** 指称词 → work_type 映射 */
function _mapType(word: string): 'novel' | 'story' | 'article' | undefined {
  if (word === '小说' || word === '连载' || word === '同人' || word === '番外') return 'novel';
  if (word === '故事') return 'story';
  if (word === '文章' || word === '短文' || word === '长文') return 'article';
  return undefined;
}
