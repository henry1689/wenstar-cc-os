/**
 * tianquan/temporal/ — 海马时序域
 * ===============================
 * 仿生人脑海马体，天权唯一场景生成、记忆重现模块。
 *
 * 海马造景：负责浮现回忆、渲染场景、压缩经验、搬运记忆。
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分 §1
 */
export { HippocampusRhythmCoordinator } from './HippocampusRhythmCoordinator.js';
export { HippocampalIndex } from './HippocampalIndex.js';
export { CoreMemoryManager } from './CoreMemoryManager.js';
export { SleepTimeConsolidator } from './SleepTimeConsolidator.js';
export { SelectiveForgettingEngine } from './SelectiveForgettingEngine.js';
export { NoveltyDetector } from './NoveltyDetector.js';
export { SceneSnapshotBuilder } from './SceneSnapshotBuilder.js';
export { PatternCompleter } from './PatternCompleter.js';
export { PatternSeparator } from './PatternSeparator.js';
export { ProspectiveSimulator } from './ProspectiveSimulator.js';
export { SceneMap } from './SceneMap.js';
export { BrainOutputService } from './BrainOutputService.js';
export { EmotionRegulator } from './EmotionRegulator.js';
export { EmotionCycleTracker } from './EmotionCycleTracker.js';
export { KnowledgeAccessFacade } from './KnowledgeAccessFacade.js';
export { assembleAndStartHippocampus } from './assembleHippocampus.js';
export type { HippocampusDeps } from './assembleHippocampus.js';
export * from './types.js';
