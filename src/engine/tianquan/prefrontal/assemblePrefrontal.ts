/**
 * assemblePrefrontal.ts — 前额叶组件装配器 (V1.0 / BIONIC-002 Phase 1)
 * =====================================================================
 * 创建 PrefrontalCortex 实例，初始化所有子模块。
 * 在 server.ts initPipeline() 末尾被调用。
 *
 * 模仿 assembleHippocampus.ts 的装配模式:
 *   ① 构造所有子模块
 *   ② 构造主类并注入依赖
 *   ③ 注入 eventBus（可选）
 *   ④ 注册到 globalThis（与 __hippocampusCoordinator 一致）
 *
 * 使用:
 *   const cortex = assemblePrefrontal({ storage, familyGraph, knowledgeBase });
 */
import type { SQLiteAdapter } from '../../../m2/SQLiteAdapter.js';
import type { FusionStorageAdapter } from '../../../m2/FusionStorageAdapter.js';
import type { KnowledgeBase } from '../../../m2/KnowledgeBase.js';
import { PrefrontalCortex } from './PrefrontalCortex.js';
import { WorkingMemory } from './WorkingMemory.js';
import { GoalStack } from './GoalStack.js';
import { ConstraintValidator } from './ConstraintValidator.js';
import { DirectiveGenerator } from './DirectiveGenerator.js';
import { MetacognitionReview } from './MetacognitionReview.js';

export interface PrefrontalDeps {
  /** 融合存储适配器（提供 SQLite 句柄） */
  storage: FusionStorageAdapter;
  /** 家族图谱（供 ConstraintValidator 校验现实规则） */
  familyGraph?: any;
  /** 知识库（供元认知复盘查询历史经验） */
  knowledgeBase?: KnowledgeBase;
  /** 事件总线（可选，供元认知推送梦境引擎） */
  eventBus?: { emit: (event: any) => Promise<void> };
}

/**
 * 装配前额叶域所有组件并返回 PrefrontalCortex 实例
 */
export function assemblePrefrontal(deps: PrefrontalDeps): PrefrontalCortex {
  const sqlite: SQLiteAdapter = deps.storage.getSQLite()!;

  // ① 构造子模块
  const wm  = new WorkingMemory();
  const gs  = new GoalStack();
  const cv  = new ConstraintValidator(sqlite);
  const dg  = new DirectiveGenerator();
  const mc  = new MetacognitionReview();

  // ② 构造主协调类
  const cortex = new PrefrontalCortex(wm, gs, cv, dg, mc);

  // ③ 可选注入事件总线
  if (deps.eventBus) {
    cortex.setEventBus(deps.eventBus);
  }

  // ④ 注册到全局（与 __hippocampusCoordinator 模式一致）
  (globalThis as any).__prefrontalCortex = cortex;

  console.log('[Prefrontal] 前额叶装配完成 · ' +
    `工作记忆 ${wm.capacity} 槽位 · ` +
    `总线 ${deps.eventBus ? '已' : '未'}注入 · ` +
    `目标栈 ${gs.getState().longTerm.length} 长期目标 ✓`);

  return cortex;
}
