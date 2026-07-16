/**
 * Tianquan Bus 类型定义 — 天权四域事件类型 + 路由规则
 * =====================================================
 * 定义天权域内部事件类型、路由表、路由守卫规则。
 *
 * 核心约束（WS-TIANQUAN-BIONIC-001 §第三部分）:
 *   ① 感知数据不得直接流入 prefrontal，必须经 temporal 压缩
 *   ② 知识库素材不得直接流入 prefrontal，必须经 temporal 重组封装
 *   ③ prefrontal 只产出指令，不触及存储层
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第三部分
 */

import type { SceneSnapshot } from '../temporal/types.js';
import type { PrefrontalDirective } from '../prefrontal/types.js';

// ─── 天权域事件类型枚举 ───

export type TianquanEventType =
  | 'perception:raw'            // 瑶光/瑶灵原始感知数据
  | 'scene:snapshot_ready'      // 海马域场景快照就绪
  | 'prefrontal:directive_issued' // 前额域指令发布
  | 'consolidation:complete'    // 睡眠期巩固完成
  | 'knowledge:index_updated'
  | 'knowledge:second_brain_sync'   // V4.0: second brain sync
  | 'knowledge:md_file_changed'     // V4.0: MD file change   // 知识索引更新
  | 'heart:state_changed'       // 情感状态变化
  | 'metacognition:feedback'    // 元认知复盘反馈
  | 'system:error';             // 系统错误

// ─── 具体事件接口 ───

export interface PerceptionRawEvent {
  type: 'perception:raw';
  traceId: string;
  timestamp: number;
  sessionId: string;
  /** 事件的来源模块 */
  sourceModule: 'yao_ling' | 'yao_guang';
  /** 事件的目标模块（路由守卫会检查） */
  targetModule: 'temporal' | 'prefrontal' | 'heart' | 'knowledge';
  payload: {
    channel: string;
    content: Record<string, unknown>;
    rawText?: string;
  };
}

export interface SceneSnapshotReadyEvent {
  type: 'scene:snapshot_ready';
  traceId: string;
  timestamp: number;
  sessionId: string;
  /** 轻量通知 — 消费者通过 getGlobal('snapshotBuilder') 获取完整快照 */
  payload: {
    contextSignature: string;
    calciumScore: number;
    entityCount: number;
  };
}

export interface PrefrontalDirectiveEvent {
  type: 'prefrontal:directive_issued';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    directive: PrefrontalDirective;
    sourceModule: string;
    workingMemoryState: { activeSlots: number; evictionPolicy: string };
  };
}

export interface ConsolidationCompleteEvent {
  type: 'consolidation:complete';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    sandToGold: number;
    goldToDiamond: number;
    semanticInductions: number;
    crossSessionLinks: number;
    forgotten: number;
    stagesRun: string[];
  };
}

export interface KnowledgeIndexUpdatedEvent {
  type: 'knowledge:index_updated';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    sourceId: string;
    operation: 'create' | 'update' | 'delete';
    indexId?: string;
  };
}

export interface HeartStateChangedEvent {
  type: 'heart:state_changed';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    previousState: Record<string, number>;
    currentState: Record<string, number>;
    delta: Record<string, number>;
  };
}

export interface MetacognitionFeedbackEvent {
  type: 'metacognition:feedback';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    summaryId: string;
    directiveId: string;
    gapAnalysis: string;
    worthSubmitting: boolean;
  };
}

export interface SystemErrorEvent {
  type: 'system:error';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    module: string;
    message: string;
    level: 'warn' | 'error' | 'fatal';
    stack?: string;
  };
}

// ─── 联合类型 ───

/** V4.0 第二大脑同步事件 */
export interface KnowledgeSecondBrainSyncEvent {
  type: 'knowledge:second_brain_sync';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    changedFiles: string[];
    syncType: 'full' | 'incremental';
    triggeredBy: 'nightly_batch' | 'manual';
  };
}

/** V4.0 MD 文件变更事件 */
export interface MDFileChangedEvent {
  type: 'knowledge:md_file_changed';
  traceId: string;
  timestamp: number;
  sessionId: string;
  payload: {
    filePath: string;
    changeType: 'created' | 'modified' | 'deleted';
    previousHash?: string;
    currentHash?: string;
  };
}

export type TianquanEvent =
  | PerceptionRawEvent
  | SceneSnapshotReadyEvent
  | PrefrontalDirectiveEvent
  | ConsolidationCompleteEvent
  | KnowledgeIndexUpdatedEvent
  | HeartStateChangedEvent
  | MetacognitionFeedbackEvent
  | SystemErrorEvent
  | KnowledgeSecondBrainSyncEvent
  | MDFileChangedEvent;

// ═══════════════════════════════════════════════════════
//  路由规则（WS-TIANQUAN-BIONIC-001 §第三部分）
// ═══════════════════════════════════════════════════════

/**
 * 天权域事件路由表
 *
 *   user:input           → temporal（海马先压缩）→ prefrontal（前额决策）
 *   perception:analyzed  → temporal（绑定时空标签 + 情感标签）
 *   memory:retrieved     → temporal（拼接场景快照）→ prefrontal
 *   heart:state_updated  → temporal（附加情绪标签）+ prefrontal（情绪权重参考）
 *   generation:request   → prefrontal（约束校验）→ temporal（场景注入）→ cortex（生成）
 *   output:finalized     → temporal（记忆归档）+ heart（情感更新）
 */
export const ROUTING_TABLE: Record<string, { allowedTargets: string[]; blockedSources: string[] }> = {
  'perception:raw': {
    allowedTargets: ['temporal'],          // ① 只能流入海马
    blockedSources: [],                    // 无限制
  },
  'knowledge:direct_query': {
    allowedTargets: ['temporal'],          // ② 素材只能经海马重组
    blockedSources: ['prefrontal'],        // 前额域不得直读知识库
  },
  'scene:snapshot_ready': {
    allowedTargets: ['prefrontal'],        // ③ 海马唯一输出 → 前额
    blockedSources: [],
  },
  'prefrontal:directive_issued': {
    allowedTargets: ['yao_ling', 'yao_guang', 'heart', 'temporal', 'knowledge'],
    blockedSources: [],
  },
};

/** 路由违规日志记录函数 */
export function logRoutingViolation(
  eventType: string,
  targetModule: string,
  sourceModule: string,
  reason: string,
): void {
  console.warn(
    `[BusRouter] 路由违规: type=${eventType} ` +
    `target=${targetModule} source=${sourceModule} reason="${reason}"`
  );
}
