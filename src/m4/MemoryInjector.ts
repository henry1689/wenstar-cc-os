/**
 * MemoryInjector — 统一记忆注入引擎 (V8.0)
 * ============================================
 * 统管砂金/金库/黑钻/知识库四条管线，按预算分配注入到 LLM 上下文。
 *
 * 设计原则：
 * - 四条管线竞争同一块上下文空间 → 改为统一调度
 * - 日常闲聊不再"零记忆" → 钙化分兜底确保至少 1-2 条记忆
 * - 去重 + 排序 + 截断 → 确保高质量记忆优先注入
 * - 后续所有记忆调参只在此模块一处完成
 */

/** 记忆片段（统一表示） */
export interface MemoryItem {
  text: string;           // 记忆文本
  source: 'diamond' | 'vault' | 'sand' | 'knowledge' | 'timeline' | 'work';
  priority: number;       // 0-1, 越高越重要
}

/** 注入参数 */
export interface InjectOptions {
  /** retrieval-stage 产出的 memoryFragments（黑钻/时间检索/用户曾提到） */
  memoryFragments: string[];
  /** M4 memory_summary.timeline 压缩后的记忆锚点 */
  m4Timeline: Array<{ summary: string; calcium_level?: number }>;
  /** KnowledgeContextBuilder 产出的知识库文本 */
  knowledgeBaseText: string;
  /** 🆕 vault_log 金库检索结果 */
  vaultHits: string[];
  /** 总字符硬上限（默认 8000 = ~4000 tokens） */
  maxChars: number;
  /** 🆕 V10.1: 会晤模式下保留记忆片段的结构标签（【我的档案】【过去的对话记忆】等），不剥离 */
  preserveLabels?: boolean;
  /** V12.1: 当前活跃的实体名列表 — 用于在记忆上下文中标注归属 */
  entityNames?: string[];
}

/**
 * 统一注入：收集 → 去重 → 排序 → 截断 → 输出。
 */
export function injectMemories(opts: InjectOptions): string {
  const {
    memoryFragments = [],
    m4Timeline = [],
    knowledgeBaseText = '',
    vaultHits = [],
    maxChars = 8000,
    preserveLabels = false,
  } = opts;

  const items: MemoryItem[] = [];
  // V22 作品: 完整作品文本（最多 1 篇，独立预算，不参与 250 截断）
  let workFullText = '';
  // V23 长文: 对话原文（最多 1 条，独立预算，不参与 250 截断）
  let longText = '';

  // ── 来源 1: memoryFragments（砂金+黑钻+作品+长文，来自 retrieval-stage） ──
  for (const frag of memoryFragments) {
    // 🆕 V22 作品召回: 【作品】开头的 fragment 走独立预算（完整作品进上下文）
    if (frag.startsWith('【作品】')) {
      if (!workFullText) {
        workFullText = frag;  // 最多保留 1 篇完整作品
        console.log(`[MemoryInjector] 作品独立注入: ${frag.substring(0, 40)}… (${frag.length}字符)`);
      }
      continue;
    }
    // 🆕 V23 长文: 【对话原文】开头的 fragment 走独立预算（长文完整返回）
    if (frag.startsWith('【对话原文】')) {
      if (!longText) {
        longText = frag;  // 最多保留 1 条长文
        console.log(`[MemoryInjector] 长文独立注入: ${frag.substring(0, 40)}… (${frag.length}字符)`);
      }
      continue;
    }
    // 🆕 V10.1: 会晤模式下保留结构标签，LLM 可区分档案/记忆/家人
    const labelMatch = preserveLabels ? frag.match(/^(【[^】]+】)/) : null;
    const preservedLabel = labelMatch ? labelMatch[1] : '';
    const clean = frag
      .replace(/【[^】]*】/g, '')        // 去标签
      .replace(/（[^）]*）/g, '')        // 去括号场景
      .replace(/——.*$/, '')              // 去后缀说明
      .trim();
    if (clean.length < 5) continue;
    const isDiamond = frag.includes('珍藏记忆') || frag.includes('💎');
    // V10.1: 保留标签时，以标签文本作为内容前缀
    const displayText = preserveLabels && preservedLabel
      ? preservedLabel + ' ' + clean.substring(0, 300)
      : clean.substring(0, 250);
    items.push({
      text: displayText,
      source: isDiamond ? 'diamond' : 'sand',
      priority: isDiamond ? 0.9 : (preservedLabel.includes('档案') ? 0.95 : preservedLabel.includes('记忆') ? 0.85 : 0.6),
    });
  }

  // ── 来源 2: M4 timeline（钙化分排序的记忆锚点） ──
  for (const t of m4Timeline) {
    const calcium = t.calcium_level ?? 1;
    const clean = (t.summary || '').replace(/（[^）]*）/g, '').trim();
    if (clean.length < 5) continue;
    // 钙化等级越高优先级越高
    const priority = Math.min(0.3 + calcium * 0.2, 0.9);
    items.push({ text: clean.substring(0, 120), source: 'timeline', priority });
  }

  // ── 来源 3: vault_log 金库（用户说过的事实/承诺） ──
  for (const v of vaultHits) {
    const clean = v.trim();
    if (clean.length < 5) continue;
    items.push({
      text: clean.substring(0, 150),
      source: 'vault',
      priority: 0.7,
    });
  }

  // ── 去重：Jaccard 相似度 > 0.4 视为重复，保留优先级更高的 ──
  const deduped = deduplicate(items);

  // ── 按优先级降序 ──
  deduped.sort((a, b) => b.priority - a.priority);

  // ── 预算分配：V10.1 记忆 60% + 知识库 40%（原 50/50）──
  const memBudget = Math.floor(maxChars * 0.6);
  const kbBudget = maxChars - memBudget;

  // ── 截断记忆 ──
  const memParts: string[] = [];
  let memChars = 0;
  for (const item of deduped) {
    // V10.1: 会晤模式保留原始结构标签，非会晤模式用 emoji 前缀
    const hasPreservedLabel = preserveLabels && /^【[^】]+】/.test(item.text);
    const label = hasPreservedLabel ? '' :
                  item.source === 'diamond' ? '💎' :
                  item.source === 'vault' ? '📌' :
                  item.source === 'timeline' ? '🕐' : '💭';
    const line = hasPreservedLabel ? item.text : `${label} ${item.text}`;
    if (memChars + line.length > memBudget) break;
    memParts.push(line);
    memChars += line.length + 1;
  }

  // ── 截断知识库 ──
  let kbText = '';
  if (knowledgeBaseText) {
    kbText = knowledgeBaseText.length > kbBudget
      ? knowledgeBaseText.substring(0, kbBudget) + '\n…(已截断)'
      : knowledgeBaseText;
  }

  // ── 组装 ──
  const parts: string[] = [];
  if (memParts.length > 0) {
    // V12.1: 标注实体归属 — 当有明确实体时，提示 LLM 区分记忆来源
    const _entityPrefix = opts.entityNames && opts.entityNames.length > 0
      ? '【关于 ' + opts.entityNames.join('、') + ' 的记忆】\n'
      : '';
    const _notes: string[] = [];
    _notes.push('🔴 共情指南：');
    _notes.push('1）这些记忆片段记录了鸿艺过去的情绪和经历。如果他现在说的事情与某个记忆中的情绪相似（比如都是疲惫、都是焦虑），用那段记忆来理解他此刻的感受——不要只是"引用"，而是"共鸣"。');
    _notes.push('2）表达公式：你当下感受 + 记忆中类似经历 → "是不是又像上次那样……""我懂这种感觉，你之前……的时候也是这样"');
    _notes.push('3）记忆中没有的细节不要自己编造。');
    parts.push(_entityPrefix + '【相关记忆】\n' + memParts.join('\n') +
      '\n（' + _notes.join(' ') + '）');
  }
  if (kbText) {
    parts.push(kbText);
  }

  // ── V22/V23 作品+长文: 优先保留（放最前，硬截断时不被砍） ──
  // 🔴 S5-评审修复(🟡-4): 原顺序 [记忆,KB,作品,长文]，硬截断从头保留 → 长文最后被整段丢弃。
  // 修复: 长文/作品放最前 + 长文预算提高（detail 4305 字不丢结尾）。
  // 注: 长文与作品同时命中时，长文优先（用户当前明确要看长文）。
  const _priorityParts: string[] = [];
  if (longText) {
    const longBudget = Math.max(4000, Math.floor(maxChars * 0.6));  // 覆盖 detail 全文（4305字）
    _priorityParts.push(longText.length > longBudget
      ? longText.substring(0, longBudget) + '\n…(对话原文超长已截断)'
      : longText);
  }
  if (workFullText && !longText) {  // 长文已占用预算时，作品降级为摘要不完整注入
    const WORK_MAX_CHARS = 4000;
    const workBudget = Math.min(WORK_MAX_CHARS, Math.floor(maxChars * 0.4));
    _priorityParts.push(workFullText.length > workBudget
      ? workFullText.substring(0, workBudget) + '\n…(作品超长已截断)'
      : workFullText);
  }
  parts.unshift(..._priorityParts);

  const result = parts.join('\n\n');
  if (memParts.length > 0) {
    console.log(`[MemoryInjector] ${deduped.length} items → ${memParts.length} injected (${memChars} chars), KB ${kbText.length} chars`);
  }

  // S5-评审: 总输出硬约束 — 记忆+知识库+作品合计不超过 maxChars（优先保记忆，其次作品）
  if (result.length > maxChars) {
    const truncated = result.substring(0, maxChars);
    console.log(`[MemoryInjector] 总输出超预算 ${result.length}→${maxChars} 截断`);
    return truncated + '\n…(上下文超预算已截断)';
  }

  return result;
}

/** 简单去重：两两 Jaccard > 0.4 视为重复 */
function deduplicate(items: MemoryItem[]): MemoryItem[] {
  if (items.length <= 1) return items;

  const result: MemoryItem[] = [];
  for (const item of items) {
    let isDup = false;
    for (const existing of result) {
      if (jaccardSimilarity(item.text, existing.text) > 0.4) {
        // 保留优先级更高的
        if (item.priority > existing.priority) {
          result.splice(result.indexOf(existing), 1, item);
        }
        isDup = true;
        break;
      }
    }
    if (!isDup) result.push(item);
  }
  return result;
}

/** Jaccard 相似度（基于 2-gram 字符级） */
function jaccardSimilarity(a: string, b: string): number {
  const aSet = new Set<string>();
  const bSet = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) aSet.add(a.substring(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bSet.add(b.substring(i, i + 2));
  const intersection = [...aSet].filter(x => bSet.has(x)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export default injectMemories;
