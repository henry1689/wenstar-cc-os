/**
 * desire-stack — 欲望栈 + 思念系统
 *
 * Ackem 参考实现 + 太虚境定制扩展。
 * 6 槽位：关心/分享/调侃/好奇/邀约/倾诉
 * 每轮按事件类型+关系阶段概率生成
 * urgency 逐轮衰减，达标自动注入提示
 *
 * 思念系统：
 *   思念阈值 = T_avg × 1.5（14天平均间隔）
 *   硬锚定 [8h, 72h]，新用户默认 24h
 *   超阈值后前 24h 每小时 +1，之后 +2，上限 100
 */
import type { RelationState } from '../bus/types.js';

// ── 欲望类别 ──
export type DesireCategory = '关心' | '分享' | '调侃' | '好奇' | '邀约' | '倾诉';

export interface Desire {
  id: string;
  category: DesireCategory;
  topic: string;
  urgency: number;     // 0-10
  status: 'latent' | 'active' | 'expressed' | 'settled';
  createdAt: string;
}

export interface DesireStackState {
  slots: (Desire | null)[];  // 6 槽位
  longings: number;          // 思念值 0-100
}

// ── 参数 ──
const MAX_SLOTS = 6;
const EXPRESS_THRESHOLD = 4;  // urgency ≥ 4 时表达
const DECAY_PER_TURN = 0.5;   // 每轮衰减 0.5
const IDLE_SETTLE_TURNS = 10; // 闲置 10 轮后沉淀

// 生成概率（按事件类型 × 关系阶段）
const GEN_CHANCE: Record<string, number> = {
  'casual_chat':    0.12,
  'knowledge_query': 0.15,
  'rp_trigger':      0.20,
};

const CATEGORIES_BY_INTENT: Record<string, DesireCategory[]> = {
  casual_chat:      ['分享', '调侃', '关心'],
  knowledge_query:  ['好奇', '分享'],
  rp_trigger:       ['邀约', '调侃'],
};

export function defaultDesireStack(): DesireStackState {
  return { slots: [null, null, null, null, null, null], longings: 0 };
}

/**
 * 更新欲望栈
 */
export function updateDesireStack(
  stack: DesireStackState,
  intent: string,
  relationStage: RelationState,
  hoursSinceLastChat: number,
  avgIntervalHours: number,
): { stack: DesireStackState; hints: string[] } {
  const slots = [...stack.slots];

  // 1. 衰减已有欲望
  for (let i = 0; i < MAX_SLOTS; i++) {
    const d = slots[i];
    if (!d || d.status === 'settled' || d.status === 'expressed') continue;
    slots[i] = { ...d, urgency: Math.max(0, d.urgency - DECAY_PER_TURN) };
    // 闲置过久 → 沉淀
    if (d.urgency <= 0) slots[i] = { ...d, status: 'settled', urgency: 0 };
  }

  // 2. 思念值累积
  let longings = stack.longings;
  const threshold = Math.max(8, Math.min(72, avgIntervalHours * 1.5));
  if (hoursSinceLastChat > threshold) {
    const overThreshold = hoursSinceLastChat - threshold;
    if (overThreshold <= 24) {
      longings = Math.min(100, longings + overThreshold);
    } else {
      longings = Math.min(100, longings + 24 + (overThreshold - 24) * 2);
    }
  } else {
    // 未超阈值时缓慢衰减
    longings = Math.max(0, longings - 1);
  }

  // 3. 生成新欲望
  const chance = GEN_CHANCE[intent] ?? 0.05;
  const stageMultiplier = relationStage === 'intimate' ? 1.5 : relationStage === 'familiar' ? 1.2 : 0.7;
  if (Math.random() < chance * stageMultiplier) {
    const cats = CATEGORIES_BY_INTENT[intent] ?? ['分享'];
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const emptyIdx = slots.findIndex(s => !s || s.status === 'settled');
    if (emptyIdx >= 0) {
      slots[emptyIdx] = {
        id: `des_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
        category: cat,
        topic: extractTopic(intent),
        urgency: 3 + Math.floor(Math.random() * 4),  // 3-6
        status: 'active',
        createdAt: new Date().toISOString(),
      };
    }
  }

  // 4. 收集需要表达的欲望
  const hints: string[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const d = slots[i];
    if (!d || d.status !== 'active') continue;
    if (d.urgency >= EXPRESS_THRESHOLD) {
      hints.push(desireToHint(d));
      slots[i] = { ...d, status: 'expressed', urgency: 0 };
    }
  }

  // 5. 思念值高时添加思念 hint
  if (longings > 50) {
    hints.push(longings > 80 ? '想你想得不行' : '开始想你了');
  }

  return { stack: { slots, longings }, hints };
}

function desireToHint(d: Desire): string {
  switch (d.category) {
    case '关心': return `有点担心ta的${d.topic}，想问问`;
    case '分享': return `想和ta分享关于${d.topic}的事`;
    case '调侃': return `想在${d.topic}上小小捉弄ta一下`;
    case '好奇': return `对${d.topic}很好奇，想了解更多`;
    case '邀约': return `想约ta一起${d.topic}`;
    case '倾诉': return `想和ta说说心里话`;
    default: return '';
  }
}

function extractTopic(intent: string): string {
  // 简化：基于 intent 映射固定话题
  const topics: Record<string, string> = {
    casual_chat: '今天',
    knowledge_query: '你说的那个',
    rp_trigger: '一起',
  };
  return topics[intent] ?? '近况';
}
