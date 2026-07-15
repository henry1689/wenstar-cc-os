/**
 * tianquan/prefrontal/ — 前额叶管理域
 * ===================================
 * 全域唯一顶层决策、规划、管控中枢。
 *
 * 前额定策：负责统筹全局、逻辑判断、制定计划、下发行动指令。
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分 §2
 */
export { PrefrontalCortex } from './PrefrontalCortex.js';
export { ConstraintValidator } from './ConstraintValidator.js';
export { DirectiveGenerator } from './DirectiveGenerator.js';
export { MetacognitionReview } from './MetacognitionReview.js';
export { WorkingMemory } from './WorkingMemory.js';
export { GoalStack } from './GoalStack.js';
export { assemblePrefrontal } from './assemblePrefrontal.js';
export type { PrefrontalDeps } from './assemblePrefrontal.js';
export * from './types.js';
