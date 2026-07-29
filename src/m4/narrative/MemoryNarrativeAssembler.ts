/**
 * MemoryNarrativeAssembler — DAG 子图叙事组装器 (V13.0)
 * =====================================================
 * 将闭包子图转换为 LLM 可读的结构化叙事。
 * 输入: MemoryClosureResult + 记忆文本
 * 输出: MemoryNarrative (时间线 + 关系 + 情绪弧线 + compactText)
 */

import type { MemoryClosureResult, MemoryAssociation, MemoryEdgeType } from '../graph/MemoryAssociationTypes.js';

export interface NarrativeTimelineItem {
  globalUid: string;
  timestampMs: number;
  content: string;
  isSeed: boolean;
  isKeyEvent: boolean;
  calciumScore?: number;
  emotionSummary?: string;
  foresightStatus?: string;
}

export interface NarrativeRelation {
  sourceGlobalUid: string;
  targetGlobalUid: string;
  edgeType: MemoryEdgeType;
  confidence: number;
  explanation: string;
}

export interface MemoryNarrative {
  title?: string;
  seedGlobalUids: string[];
  timeline: NarrativeTimelineItem[];
  relations: NarrativeRelation[];
  emotionArc?: { summary: string };
  compactText: string;
  warnings: string[];
}

/** 边类型 → 中文解释 */
function explainEdge(edgeType: MemoryEdgeType): string {
  switch (edgeType) {
    case 'causal': return '因果承接';
    case 'entity': return '同主体/同实体';
    case 'semantic': return '语义相似';
    case 'emotion': return '情绪共振';
    default: return '未知关联';
  }
}

export class MemoryNarrativeAssembler {
  /**
   * 组装叙事
   * @param closure BFS 闭包子图
   * @param textMap global_uid → 文本内容
   * @param maxTokens compactText 最大字符数
   * @param emotionMap global_uid → 情绪标签（可选）
   */
  assemble(
    closure: MemoryClosureResult,
    textMap: Map<string, { rawInput: string; calciumScore?: number; emotion?: string; createdAt?: string; foresightStatus?: string }>,
    maxTokens: number = 800,
  ): MemoryNarrative {
    const seedSet = new Set(closure.seedGlobalUids);

    // 时间线：按节点 ID 在 edges 中出现的位置推断时间序
    const timeline: NarrativeTimelineItem[] = closure.nodes.map(n => {
      const meta = textMap.get(n.globalUid);
      const isKeyEvent = n.isSeed || (meta?.calciumScore ?? 0) >= 2.0;
      return {
        globalUid: n.globalUid,
        timestampMs: meta?.createdAt ? new Date(meta.createdAt).getTime() : 0,
        content: meta?.rawInput ?? '(无文本)',
        isSeed: n.isSeed,
        isKeyEvent,
        calciumScore: meta?.calciumScore,
        emotionSummary: meta?.emotion,
        foresightStatus: meta?.foresightStatus,
      };
    }).sort((a: NarrativeTimelineItem, b: NarrativeTimelineItem) => a.timestampMs - b.timestampMs);

    // 关系解释
    const relations: NarrativeRelation[] = closure.edges.map(e => ({
      sourceGlobalUid: e.sourceGlobalUid,
      targetGlobalUid: e.targetGlobalUid,
      edgeType: e.edgeType,
      confidence: e.confidence,
      explanation: `${explainEdge(e.edgeType)} (confidence=${e.confidence.toFixed(2)})`,
    }));

    // 情绪弧线
    const emotions = timeline
      .filter((t: NarrativeTimelineItem) => t.emotionSummary)
      .map((t: NarrativeTimelineItem) => t.emotionSummary!);
    const emotionArc = emotions.length >= 2
      ? { summary: emotions.join(' → ') }
      : emotions.length === 1
        ? { summary: emotions[0] }
        : undefined;

    // 警告
    const warnings: string[] = [];
    for (const t of timeline) {
      if (t.foresightStatus && t.foresightStatus !== 'none') {
        warnings.push(`⚠️ ${t.globalUid}: Foresight(status=${t.foresightStatus})`);
      }
    }

    // compactText
    const lines: string[] = [];
    if (closure.edges.length > 0) {
      const title = timeline.filter(t => t.isSeed).map(t => t.content.substring(0, 30)).join(' / ');
      lines.push(`【记忆链：${title}】`);
    }
    lines.push('时间线：');
    for (let i = 0; i < timeline.length; i++) {
      const t = timeline[i];
      const tag = t.isSeed ? '★' : ' ';
      const content = t.content.length > 80 ? t.content.substring(0, 80) + '...' : t.content;
      lines.push(`${i + 1}. ${tag} ${content}${t.emotionSummary ? ` [${t.emotionSummary}]` : ''}`);
    }

    if (relations.length > 0) {
      lines.push('\n关系：');
      for (const r of relations) {
        const sIdx = timeline.findIndex(t => t.globalUid === r.sourceGlobalUid) + 1;
        const tIdx = timeline.findIndex(t => t.globalUid === r.targetGlobalUid) + 1;
        lines.push(`- ${sIdx}→${tIdx}：${r.explanation}`);
      }
    }

    if (emotionArc) {
      lines.push(`\n情绪演变：${emotionArc.summary}`);
    }

    let compactText = lines.join('\n');
    if (compactText.length > maxTokens) {
      compactText = compactText.substring(0, maxTokens - 3) + '...';
    }

    return {
      seedGlobalUids: closure.seedGlobalUids,
      timeline,
      relations,
      emotionArc,
      compactText,
      warnings,
    };
  }
}
