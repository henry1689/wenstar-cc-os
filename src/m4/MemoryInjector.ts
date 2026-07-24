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
  source: 'diamond' | 'vault' | 'sand' | 'knowledge' | 'timeline';
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

  // ── 来源 1: memoryFragments（砂金+黑钻，来自 retrieval-stage） ──
  for (const frag of memoryFragments) {
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
    const _notes: string[] = [];
    _notes.push('🔴 共情指南：');
    _notes.push('1）这些记忆片段记录了鸿艺过去的情绪和经历。如果他现在说的事情与某个记忆中的情绪相似（比如都是疲惫、都是焦虑），用那段记忆来理解他此刻的感受——不要只是"引用"，而是"共鸣"。');
    _notes.push('2）表达公式：你当下感受 + 记忆中类似经历 → "是不是又像上次那样……""我懂这种感觉，你之前……的时候也是这样"');
    _notes.push('3）记忆中没有的细节不要自己编造。');
    parts.push('【相关记忆】\n' + memParts.join('\n') +
      '\n（' + _notes.join(' ') + '）');
  }
  if (kbText) {
    parts.push(kbText);
  }

  const result = parts.join('\n\n');
  if (memParts.length > 0) {
    console.log(`[MemoryInjector] ${deduped.length} items → ${memParts.length} injected (${memChars} chars), KB ${kbText.length} chars`);
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
