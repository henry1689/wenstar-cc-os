/**
 * format.ts — 检索命中统一格式化（Foundation V1.0）
 * ==================================================
 * 把 SearchHit 格式化为 memoryFragments 文本（带现有前缀），
 * 并映射到 MemoryInjector.source。
 *
 * 前缀复刻（逐字符对齐 retrieval-stage 现有输出，保证 MemoryInjector 分流逻辑不变）：
 *   - knowledge      → `📖 title: content`
 *   - black_diamond  → `💎 content`（MemoryInjector isDiamond 检测：含 💎）
 *   - vault          → `【金库记忆】content`
 *   - work           → `【作品】《title》(type)\n full_text`（MemoryInjector 独立预算分流）
 *   - memory(钙≥3)   → `【💎重要记忆】`
 *   - memory(钙≥2)   → `【📌重要记忆】`
 *   - conversation   → `💭 content`
 *   - note           → `💭 content`
 *   - family_graph   → `👤 content`
 */

import type { SearchHit } from './types.js';

/** 格式化选项 */
export interface FormatHitOptions {
  /** 会晤模式：作品保留完整标签（MemoryInjector preserveLabels 兼容） */
  preserveLabels?: boolean;
  /** 作品 full_text 最大注入长度（默认 4000，对齐 retrieval-stage 强指称） */
  workMaxChars?: number;
}

/**
 * 单条命中 → memoryFragments 文本（带前缀）。
 */
export function formatHit(hit: SearchHit, opts: FormatHitOptions = {}): string {
  switch (hit.domain) {
    case 'knowledge':
      // S4-评审修复: KnowledgeAdapter.text 已含 "title: content"，直接复用（对齐旧 L593 格式）
      return `📖 ${hit.text}`.trim();
    case 'black_diamond':
      return `💎 ${hit.text}`;
    case 'vault':
      return `【金库记忆】${hit.text}`;
    case 'work': {
      const payload = hit.payload as { title?: string; work_type?: string; full_text?: string } | undefined;
      const title = payload?.title ?? hit.text;
      const workType = payload?.work_type ?? '';
      const full = payload?.full_text || hit.text;
      const maxChars = opts.workMaxChars ?? 4000;
      const body = full.length > maxChars ? full.substring(0, maxChars) : full;
      return `【作品】《${title}》(${workType})\n${body}`;
    }
    case 'memory': {
      const level = hit.calciumLevel ?? 0;
      if (level >= 3) return `【💎重要记忆】${hit.text}`;
      if (level >= 2) return `【📌重要记忆】${hit.text}`;
      return `💭 ${hit.text}`;
    }
    case 'family_graph':
      return `👤 ${hit.text}`;
    case 'conversation':
    case 'note':
    default:
      return `💭 ${hit.text}`;
  }
}

/**
 * 命中 → MemoryInjector.source 映射。
 */
export function hitToMemorySource(hit: SearchHit): 'diamond' | 'vault' | 'sand' | 'knowledge' | 'timeline' | 'work' {
  switch (hit.domain) {
    case 'black_diamond': return 'diamond';
    case 'vault':         return 'vault';
    case 'knowledge':     return 'knowledge';
    case 'work':          return 'work';
    case 'memory':
    case 'conversation':
    case 'note':
    case 'family_graph':
    default:              return 'sand';
  }
}
