/**
 * PatternCompleter.ts — 模式补全引擎 (海马体 CA3 区功能)
 * =========================================================
 * 生物海马体的 CA3 区负责"模式补全"——从部分线索重建完整记忆。
 * 看到半张脸就能认出一个人，听到前奏就知道是哪首歌。
 *
 * 当用户输入简短线索时:
 *   1. 用线索做初步检索
 *   2. 找到最匹配的"原型记忆"
 *   3. 从原型记忆中提取缺失的上下文维度
 *   4. 生成补全后的增强查询
 *
 * 使用:
 *   const completer = new PatternCompleter();
 *   const enhanced = completer.complete(cue, memories);
 */
import type { DNA } from '../../../m1/types/dna.js';

export interface CompletionResult {
  /** 补全后的查询关键词（用于二次检索） */
  enhancedQuery: string;
  /** 补全的上下文维度 */
  completedDimensions: string[];
  /** 命中的原型记忆ID */
  prototypeId?: string;
}

export class PatternCompleter {
  /**
   * 从片段线索补全完整记忆上下文
   * @param cue - 用户输入的片段（如"咖啡厅"、"上次吵架"）
   * @param candidates - 初步检索到的记忆
   * @returns 补全后的增强信息
   */
  complete(cue: string, candidates: DNA[]): CompletionResult {
    const result: CompletionResult = {
      enhancedQuery: cue,
      completedDimensions: [],
    };

    if (!candidates || candidates.length === 0) return result;

    // 1. 找到最匹配的"原型记忆"（钙化最高 + 内容最丰富）
    const prototype = candidates
      .filter(m => m.raw_input && m.raw_input.length > 10)
      .sort((a, b) => (b.calcium_score || 0.5) - (a.calcium_score || 0.5))[0];

    if (!prototype) return result;

    result.prototypeId = prototype.branch_id || prototype.seq_pos?.toString();

    // 2. 从原型中提取"缺失的上下文维度"
    const completed: string[] = [];

    // 人物补全
    const persons = (prototype.entity_genes || [])
      .filter(e => e.type === 'person' && e.name !== '我')
      .map(e => e.name);
    if (persons.length > 0) completed.push(`人物:${persons.join(',')}`);

    // 场景补全（从 locus_path 提取）
    if (prototype.locus_path) {
      const segments = prototype.locus_path.split('.');
      const domain = segments[1] || '';
      const sceneTags: Record<string, string> = {
        family: '家庭', work: '工作', emotion: '情绪',
        daily: '日常', health: '健康', social: '社交',
      };
      if (sceneTags[domain]) completed.push(`场景:${sceneTags[domain]}`);
    }

    // 时间补全
    if (prototype.created_at) {
      const d = new Date(prototype.created_at);
      const hours = d.getHours();
      const timeTag = hours < 6 ? '凌晨' : hours < 12 ? '上午' : hours < 18 ? '下午' : '晚上';
      completed.push(`时间:${timeTag}`);
    }

    result.completedDimensions = completed;

    // 3. 构建增强查询（追加补全的上下文）
    const additions = [cue, ...completed.map(c => c.split(':')[1] || '')].filter(Boolean);
    result.enhancedQuery = additions.join(' ');

    return result;
  }
}
