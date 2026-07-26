/**
 * knowledge-induction — 对话→知识归纳服务
 *
 * 职责：从用户消息中匹配事实模式（地址/工作/家人等），异步写入知识库。
 * 与 persistence-stage 解耦：持久化模块只负责写数据，知识归纳由本服务独立承担。
 *
 * 🔧 V10.1 P1-2: 从 persistence-stage.ts 迁出，符合 chat.ts 薄调度层架构原则。
 */

import type { DNA } from '../../m1/types/dna.js';

/** 知识归纳模式：正则 + 分类标签 */
const INDUCT_PATTERNS: Array<{ re: RegExp; cat: string }> = [
  { re: /我(?:在|住在|家[住在])[^\s，。？！]{2,20}(?:[^\s，。？！]{0,5})?/, cat: '地址' },
  { re: /我(?:公?司|在)[^\s，。？！]{2,30}(?:公司|上班|工作|科技|工厂|企业)/, cat: '工作' },
  { re: /我(?:儿子|女儿|孩子|小孩|宝宝)[^\s，。？！叫]{0,10}(?:叫|是|名字)[^\s，。？！]{2,10}/, cat: '家人' },
  { re: /我(?:老婆|老公|妻子|丈夫|对象|男朋友|女朋友)[^\s，。？！叫]{0,10}(?:叫|是|在)[^\s，。？！]{2,20}/, cat: '家人' },
  { re: /我(?:爸|妈|父亲|母亲|爸爸|妈妈)[^\s，。？！叫]{0,10}(?:叫|是|名字)[^\s，。？！]{2,10}/, cat: '家人' },
];

export interface InductionInput {
  /** 用户原始消息 */
  message: string;
  /** DNA 结构（含 entity_genes，用于提取用户名） */
  dna: DNA;
  /** 知识库实例（需支持 kb.add() 方法） */
  knowledgeBase?: any;
}

/**
 * 从用户消息中匹配事实模式并写入知识库。
 * 一条消息只提取最优先匹配的一个事实，不阻塞主流程。
 */
export function inductKnowledge(input: InductionInput): void {
  const { message, dna, knowledgeBase } = input;
  if (!knowledgeBase || typeof knowledgeBase.add !== 'function') return;

  // 从 entity_genes 提取用户名字（self 类型实体）
  const selfEnt = dna.entity_genes?.find((g: any) => g.type === 'self');
  const userName = selfEnt?.name || '用户';

  for (const { re, cat } of INDUCT_PATTERNS) {
    const match = message.match(re);
    if (!match) continue;

    const fact = match[0].trim();
    if (fact.length < 4) continue;

    // 异步添加到知识库，不阻塞对话
    knowledgeBase.add({
      title: `[对话归纳] ${fact}`,
      content: `${userName}曾说过：${message}`,
      source_type: 'research',
      tags: ['auto_inducted', 'conversation', cat],
      interaction_type: 'other',
    }).then(() => {
      console.log('[KB·Induct] ' + cat + ' → "' + fact.substring(0, 30) + '"');
    }).catch((e: any) => {
      // 隐私守卫拦截或 source_type 不合法 → 静默跳过
    });

    return; // 一条消息只提取最优先的
  }
}
