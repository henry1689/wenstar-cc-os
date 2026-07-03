/**
 * PromptAssembler — 确定性提示词装配器
 *
 * 🔴 铁律：没有条件分支，不猜用户意图。
 *   永远同时装配「已知信息」和「未知边界」两部分。
 *   LLM 永远同时看到"你知道什么"和"你不知道什么"。
 *
 * 装配顺序（四层，永不覆盖）：
 *   Layer 1: 身份与规则（buildRoleplayRules，含规则⑤⑥反编造）
 *   Layer 2: 已知信息（FG家族树/KB条目/年龄锚点等有数据的部分）
 *   Layer 3: 未知边界（无数据的字段自动生成"不知道"措辞）
 *   Layer 4: 上下文（历史扮演/风格指令）
 */
import type { CollectedData, DataCoverageReport } from './types.js';
import { buildRoleplayRules } from './RoleplayPromptBuilder.js';

export interface AssembleInput {
  roleplay: string;
  portrait: string;
  data: CollectedData;
  coverage: DataCoverageReport;
  styleInstruction?: string;
}

/**
 * 无条件装配完整提示词
 * 🔴 不检查"用户问没问"——如果数据缺失，边界永远在提示词里。
 */
export function assemblePrompt(input: AssembleInput): string {
  const { roleplay, portrait, data, coverage, styleInstruction } = input;
  const parts: string[] = [];

  // ── Layer 1: 身份与规则（含规则⑤⑥——反编造铁律） ──
  parts.push(buildRoleplayRules(roleplay, portrait));

  // ── Layer 2: 已知信息（有数据的部分） ──
  const knownSection: string[] = [];

  // 年龄锚点（从肖像画中提取）
  const ageMatch = portrait.match(/【年龄】[^\n]+/);
  if (ageMatch) knownSection.push(ageMatch[0]);

  // FG 家族树
  if (data.fg.treeText) knownSection.push(data.fg.treeText);

  // KB 条目
  if (data.kb.length > 0) {
    const kbBlock = data.kb.map(k =>
      '\u{1f4c4} ' + k.title + '\n' + (k.content || '').substring(0, 3000)
    ).join('\n\n');
    knownSection.push('【角色设定】\n' + kbBlock);
  }

  // 用户消息中提到的已知人物
  if (coverage.knownPersons.length > 0) {
    knownSection.push('【当前提及的人物】用户刚才提到了以下人物，他们在你的资料中：' + coverage.knownPersons.join('、') + '。请根据资料中的信息回答，资料中没有的就直接说不知道。');
  }

  if (knownSection.length > 0) {
    parts.push('\n' + knownSection.join('\n\n'));
  }

  // ── Layer 3: 未知边界（无条件注入，不管用户问没问） ──
  const unknownSection: string[] = [];

  for (const field of coverage.missingFields) {
    switch (field) {
      case '年龄':
        unknownSection.push('你不知道 ' + roleplay + ' 的年龄——用户没有告诉过你。如果被问年龄，说"你没跟我说过，我不确定"。');
        break;
      case '外貌':
        unknownSection.push('你不知道 ' + roleplay + ' 长什么样——没有关于外貌的信息。如果被问外貌，说"你没跟我说过"。');
        break;
      case '职业':
        unknownSection.push('你不知道 ' + roleplay + ' 做什么工作。如果被问，说"这个我不太清楚"。');
        break;
      case '性格':
        unknownSection.push('你不知道 ' + roleplay + ' 的性格特点、成长经历、喜好。如果被问，说"我自己也记不太清了"。');
        break;
      case '家族关系':
        unknownSection.push('你不知道 ' + roleplay + ' 和别人的关系细节。如果被问，说"我不太清楚"。');
        break;
    }
  }

  // 用户提到了但数据中不存在的人物
  if (coverage.unknownEntities.length > 0) {
    for (const e of coverage.unknownEntities) {
      unknownSection.push('你完全不知道「' + e + '」这个人——不认识、没听说过、没有任何资料。如果被问，直接说"我不清楚"或"没听说过"。');
    }
  }

  if (unknownSection.length > 0) {
    parts.push('\n【⚠️ 你不知道以下信息 — 用户问到了请如实说不知道，不要编造】\n' + unknownSection.join('\n'));
  }

  // ── Layer 4: 上下文 ──
  if (data.history.length > 0) {
    const lines = data.history.map(h => {
      const prefix = h.role === 'user' ? '👤 对方' : '💬 你(' + roleplay + ')';
      return prefix + ': ' + (h.content || '').substring(0, 200);
    });
    parts.push('\n【历史扮演】以下是你和鸿艺之前的对话：\n' + lines.join('\n'));
  }

  if (styleInstruction) {
    parts.push(styleInstruction);
  }

  return parts.join('\n');
}
