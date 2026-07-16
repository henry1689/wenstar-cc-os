/**
 * GlobalRegistry.ts — 类型安全的全局模块注册表 (V4.0 Phase 3)
 * ============================================================
 * 替代 (globalThis as any).__xxx 的零类型安全模式。
 *
 * 使用:
 *   // 注册（在 server.ts initPipeline 中）
 *   setGlobal('prefrontalCortex', cortex);
 *
 *   // 读取（在任何模块中）
 *   const pfc = getGlobal('prefrontalCortex');
 *   if (pfc) { pfc.process(...); }
 *
 * 新增模块时:
 *   1. 在 GlobalRegistry 接口中添加该模块的类型
 *   2. 在 server.ts initPipeline 中使用 setGlobal() 注册
 *   3. 消费者使用 getGlobal() 读取
 */

import type { PrefrontalCortex } from '../engine/tianquan/prefrontal/PrefrontalCortex.js';
import type { HeartStateStore } from '../engine/tianquan/heart/HeartStateStore.js';
import type { HippocampusRhythmCoordinator } from '../engine/tianquan/temporal/HippocampusRhythmCoordinator.js';
import type { CoreMemoryManager } from '../engine/tianquan/temporal/CoreMemoryManager.js';
import type { SleepTimeConsolidator } from '../engine/tianquan/temporal/SleepTimeConsolidator.js';
import type { SceneSnapshotBuilder } from '../engine/tianquan/temporal/SceneSnapshotBuilder.js';
import type { ProspectiveSimulator } from '../engine/tianquan/temporal/ProspectiveSimulator.js';
import type { SecondBrainGateway } from '../engine/tianquan/knowledge/SecondBrainGateway.js';
import type { MDFileWatcher } from '../engine/tianquan/knowledge/MDFileWatcher.js';
import type { WikiLinkResolver } from '../engine/tianquan/knowledge/WikiLinkResolver.js';
import type { SourceTracker } from '../engine/tianquan/knowledge/SourceTracker.js';
import type { KnowledgeBridge } from '../engine/tianquan/knowledge/KnowledgeBridge.js';
import type { KnowledgeAccessFacade } from '../engine/tianquan/temporal/KnowledgeAccessFacade.js';
import type { TianquanEventBus } from '../engine/tianquan/bus/TianquanEventBus.js';
import type { PrefrontalDirective } from '../engine/tianquan/prefrontal/types.js';
import type { DailyMaintenanceScheduler } from '../app/learning/DailyMaintenanceScheduler.js';
import type { GlobalBusClient } from '../tianquan/GlobalBusClient.js';

/** 全局模块注册表接口 — 所有通过 globalThis 共享的模块都必须在此声明 */
export interface GlobalRegistry {
  // ── 天权仿生智脑 ──
  prefrontalCortex: PrefrontalCortex;
  heartStateStore: HeartStateStore;
  hippocampusCoordinator: HippocampusRhythmCoordinator;
  coreMemory: CoreMemoryManager;
  sleepTimeConsolidator: SleepTimeConsolidator;
  snapshotBuilder: SceneSnapshotBuilder;
  prospectiveSimulator: ProspectiveSimulator;

  // ── 第二大脑 ──
  secondBrainGateway: SecondBrainGateway;
  mdFileWatcher: MDFileWatcher;
  wikiLinkResolver: WikiLinkResolver;
  sourceTracker: SourceTracker;

  // ── 知识/检索 ──
  knowledgeBridge: KnowledgeBridge;
  knowledgeAccessFacade: KnowledgeAccessFacade;

  // ── 事件总线 ──
  tianquanBus: TianquanEventBus;

  // ── 全局调度 ──
  dailyMaintenanceScheduler: DailyMaintenanceScheduler;
  globalBusClient: GlobalBusClient;

  // ── 运行时状态（非模块，由 chat.ts 注入） ──
  pfcConversationContext: Array<{ role: string; content: string }>;
  currentRoleplay: string | null;
  pfcDirective: PrefrontalDirective | null;

  // ── 三域数据 ──
  lastYaolingSnapshot: Record<string, unknown> | null;
  lastYaoguangSnapshot: Record<string, unknown> | null;

  // ── 家族图谱 + 外部组件 ──
  familyGraph: any; // FamilyGraph 类型在 m4/ 中，避免循环依赖
  cortexOrchestrator: any; // GenerationOrchestrator 在 engine/cortex/，避免循环依赖
  masterProfile: any; // MasterProfileService 在 app/profile/
  wss: any; // WebSocketServer 在 node_modules/ws/
}

// ═══════════════════════════════════════════════════════
//  类型安全的读写函数
// ═══════════════════════════════════════════════════════

const _store = globalThis as unknown as Record<string, unknown>;

/**
 * 获取全局注册的模块实例（类型安全）
 * @returns 模块实例，未注册时返回 undefined
 */
export function getGlobal<K extends keyof GlobalRegistry>(key: K): GlobalRegistry[K] | undefined {
  return _store['__gr_' + key] as GlobalRegistry[K] | undefined;
}

/**
 * 注册全局模块实例
 */
export function setGlobal<K extends keyof GlobalRegistry>(key: K, value: GlobalRegistry[K]): void {
  _store['__gr_' + key] = value;
  // 保持旧的 globalThis.__xxx 路径兼容（Phase 3 过渡期）
  _store['__' + key] = value;
}

/**
 * 检查模块是否已注册
 */
export function hasGlobal<K extends keyof GlobalRegistry>(key: K): boolean {
  return _store['__gr_' + key] !== undefined;
}
