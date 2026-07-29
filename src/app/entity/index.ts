/**
 * entity/ — 多角色超长上下文隔离管理模块
 * =========================================
 * EntityContextManager: UUID 上下文窗口管理 + 隔离 + token预算
 * EntityContextStore:    DB 级持久化 + 跨会话重建 + 情感快照
 * EntityContextStrategy: 实体差异化策略 (category+warmth+频次)
 * EntityContextCompressor: 三层压缩 (锚点/摘要/归档)
 * EntityIndexMaintainer: UUID 列索引维护
 */
export { EntityContextManager } from './EntityContextManager.js';
export type { EntityContextWindow } from './EntityContextManager.js';
export { EntityContextStore } from './EntityContextStore.js';
export type { EmotionSnapshot } from './EntityContextStore.js';
export { computeStrategy, applyTokenBudget } from './EntityContextStrategy.js';
export type { EntityContextStrategy, EntityProfile } from './EntityContextStrategy.js';
export { compressContext, buildCompressedText } from './EntityContextCompressor.js';
export type { CompressedContext } from './EntityContextCompressor.js';
export { ensureEntityUUIDIndexes, verifyIndexes } from './EntityIndexMaintainer.js';
