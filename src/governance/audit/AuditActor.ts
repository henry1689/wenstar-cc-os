// ============================================================
// AUDIT-B — AuditActor 审计执行者
// ============================================================
// 描述"谁"触发了可审计的动作。
// 必填字段确保每个审计事件都可以追溯到人。
// ============================================================

/** 执行者类型 */
export type ActorType =
  | 'user'          // 人类用户
  | 'agent'         // AI Agent / Tool
  | 'system'        // 系统自动操作（心跳/计时器）
  | 'migration';    // 迁移/回填脚本

/**
 * AuditActor — 审计事件中"谁执行了动作"。
 *
 * 至少需要 id 和 type。name 是可选的人类可读标识符。
 */
export interface AuditActor {
  /** 执行者唯一标识符（TXS-ID 或系统 ID） */
  id: string;
  /** 执行者类型 */
  type: ActorType;
  /** 人类可读名称（可选） */
  name?: string;
}

/** 创建 AuditActor 的工厂函数 */
export function createAuditActor(
  id: string,
  type: ActorType,
  name?: string,
): AuditActor {
  return { id, type, ...(name ? { name } : {}) };
}

// ── 预置的常见 Actor ──

/** 系统自动操作 Actor */
export const SYSTEM_ACTOR: AuditActor = {
  id: 'TXS-000000000',
  type: 'system',
  name: 'System',
};

/** 未知 Actor（永远不应出现在生产审计事件中；表示审计日志的完整性缺口） */
export const UNKNOWN_ACTOR: AuditActor = {
  id: 'UNKNOWN',
  type: 'system',
  name: 'Unknown',
};
