/**
 * tianquan/ — 天权四域仿生闭环统一入口
 * =========================================
 * 聚合 prefrontal（前额决策）/ temporal（海马时序）/
 * heart（边缘情感）/ knowledge（知识索引）/ bus（事件总线）
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分
 */

// 子域 barrel 导出
export * as bus from './bus/index.js';
export * as prefrontal from './prefrontal/index.js';
export * as temporal from './temporal/index.js';
export * as heart from './heart/index.js';
export * as knowledge from './knowledge/index.js';

// 顶层便捷导出
export { TianquanEventBus } from './bus/TianquanEventBus.js';
export { KnowledgeAccessFacade } from './temporal/KnowledgeAccessFacade.js';
export { KnowledgeBridge } from './knowledge/KnowledgeBridge.js';
export { PrefrontalCortex } from './prefrontal/PrefrontalCortex.js';
export { assemblePrefrontal } from './prefrontal/assemblePrefrontal.js';
export type { PrefrontalDeps } from './prefrontal/assemblePrefrontal.js';
// V4.0 第二大脑模块
export { SecondBrainGateway } from './knowledge/SecondBrainGateway.js';
export { MDFileWatcher } from './knowledge/MDFileWatcher.js';
export { WikiLinkResolver } from './knowledge/WikiLinkResolver.js';
export { SourceTracker } from './knowledge/SourceTracker.js';
export { KnowledgeSyncPipeline } from './knowledge/KnowledgeSyncPipeline.js';
