/**
 * GoalStack.ts — 仿生前额叶目标栈 (V3.2 / BIONIC-002 Phase C)
 * ==============================================================
 * 模仿前额叶皮层对目标的层级组织：长期（跨会话）→ 短期（会话级）→ 即时（当前轮次）。
 *
 * 三层目标结构:
 *   Layer 1 — 长期目标（persistent，跨会话持久化）
 *     例: "成为用户的可靠助手"、"持续学习用户偏好"、"保持人设一致性"
 *   Layer 2 — 短期目标（session 级）
 *     例: "本次会话帮用户解决技术问题"、"对话氛围轻松温暖"
 *   Layer 3 — 即时意图（当前轮次）
 *     例: "回答用户关于X的问题"、"安抚用户的焦虑情绪"
 *
 * 使用:
 *   const gs = new GoalStack();
 *   gs.setLongTermGoals(['保持人设', '学习偏好']);
 *   gs.setSessionGoal('帮助用户完成架构文档');
 *   gs.setImmediate('回答关于前额叶的问题');
 */

import type { GoalStackState } from './types.js';

/** 默认长期目标（加载人设时替换） */
const DEFAULT_LONG_TERM: string[] = [
  '保持角色人设一致性',
  '持续学习用户偏好与习惯',
  '提供准确且有温度的回答',
  '守护用户安全与隐私',
];

export class GoalStack {
  private longTerm: string[];
  private session: string | null;
  private immediate: string | null;

  constructor() {
    this.longTerm = [...DEFAULT_LONG_TERM];
    this.session = null;
    this.immediate = null;
  }

  /** 设置长期目标（批量替换） */
  setLongTermGoals(goals: string[]): void {
    this.longTerm = goals.length > 0 ? [...goals] : [...DEFAULT_LONG_TERM];
  }

  /** 追加长期目标 */
  addLongTermGoal(goal: string): void {
    if (!this.longTerm.includes(goal)) {
      this.longTerm.push(goal);
    }
    // 长期目标上限 10 个
    if (this.longTerm.length > 10) {
      this.longTerm = this.longTerm.slice(-10);
    }
  }

  /** 移除长期目标 */
  removeLongTermGoal(goal: string): boolean {
    const idx = this.longTerm.indexOf(goal);
    if (idx < 0) return false;
    this.longTerm.splice(idx, 1);
    return true;
  }

  /** 设置当前会话目标 */
  setSessionGoal(goal: string): void {
    this.session = goal;
  }

  /** 设置当前轮次意图 */
  setImmediate(intent: string): void {
    this.immediate = intent;
  }

  /**
   * 获取当前活跃的目标栈
   */
  getActiveGoals(): {
    long: string[];
    short: string | null;
    immediate: string | null;
  } {
    return {
      long: [...this.longTerm],
      short: this.session,
      immediate: this.immediate,
    };
  }

  /**
   * 获取目标栈完整状态
   */
  getState(): GoalStackState {
    return {
      longTerm: [...this.longTerm],
      session: this.session,
      immediate: this.immediate,
    };
  }

  /**
   * 格式化目标上下文，用于注入工程上下文（如 LLM prompt）
   */
  formatForContext(): string {
    const parts: string[] = [];
    if (this.longTerm.length > 0) {
      parts.push(`长期: ${this.longTerm.slice(0, 3).join('; ')}`);
    }
    if (this.session) {
      parts.push(`本次会话: ${this.session}`);
    }
    if (this.immediate) {
      parts.push(`当前意图: ${this.immediate}`);
    }
    return parts.join(' | ') || '(无明确目标)';
  }

  /**
   * 清除即时意图（每轮结束后重置）
   */
  clearImmediate(): void {
    this.immediate = null;
  }

  /**
   * 清除会话目标（会话结束时调用）
   */
  clearSession(): void {
    this.session = null;
    this.immediate = null;
  }

  /**
   * 与人设对齐：根据角色人设调整长期目标
   * @param personaGoals 人设中定义的目标
   */
  alignWithPersona(personaGoals: string[]): void {
    // 人设目标优先级最高，替换默认值但保留用户学习的动态目标
    const dynamicGoals = this.longTerm.filter(g => !DEFAULT_LONG_TERM.includes(g));
    this.longTerm = [...personaGoals, ...dynamicGoals];
    // 去重
    this.longTerm = [...new Set(this.longTerm)];
  }
}
