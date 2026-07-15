/**
 * tianquan/knowledge/ — 第二大脑治理层 (V4.0 Phase 2)
 * ======================================================
 * 从"薄桥接层"升级为第二大脑治理层：
 *   - KnowledgeBridge — 保留，第一大脑侧的摘要索引代理
 *   - SecondBrainGateway — 第二大脑 MD 文件系统统一入口
 *   - MDFileWatcher — MD 文件变更监测
 *   - WikiLinkResolver — [[wikilink]] 解析与图谱
 *   - SourceTracker — MD↔记忆溯源
 *   - KnowledgeSyncPipeline — 夜间批量同步
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分 §3
 */
export { KnowledgeBridge } from './KnowledgeBridge.js';
export { SecondBrainGateway } from './SecondBrainGateway.js';
export { MDFileWatcher } from './MDFileWatcher.js';
export { WikiLinkResolver } from './WikiLinkResolver.js';
export { SourceTracker } from './SourceTracker.js';
export { KnowledgeSyncPipeline } from './KnowledgeSyncPipeline.js';
export * from './types.js';
