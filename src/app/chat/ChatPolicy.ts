/**
 * ChatPolicy — 会话模式状态机 + 权限策略 (V12.0)
 * ================================================
 * 替代散落在 chat.ts 中 12 个 _meetingEntityName / _currentRoleplay 判断点。
 * 所有模式相关权限判断收敛到此模块。
 *
 * 设计原则:
 *   - 单一真相源: ChatMode 是唯一会话状态描述
 *   - 策略可查询: policy.canXxx() 替代裸 if (!_meetingEntityName)
 *   - 防御式默认: canXxx() 默认 false，白名单制
 */

// ── 会话模式类型 ──

export type ChatMode =
  | { kind: 'normal' }
  | { kind: 'entity_meeting'; entityUuid: string; entityName: string }
  | { kind: 'roleplay'; branchId: string; roleId: string; roleName: string; allowMainFgRead: false }
  | { kind: 'secretary'; }
  | { kind: 'task'; taskType: string };

export type ChatModeKind = ChatMode['kind'];

// ── 权限策略 ──

export class ChatPolicy {
  constructor(private mode: ChatMode) {}

  /** 是否可以注入 M6 自我模型（人格/偏好/自传） */
  canInjectM6(): boolean {
    return this.mode.kind === 'normal' || this.mode.kind === 'secretary';
  }

  /** 是否可以使用主 FG（家族图谱） */
  canUseMainFG(): boolean {
    // 角色扮演使用独立分支 FG，不使用主 FG
    return this.mode.kind !== 'roleplay';
  }

  /** 是否可以将数据写入主 FG */
  canPersistToMainFG(): boolean {
    // 角色扮演绝对不写主 FG
    return this.mode.kind !== 'roleplay';
  }

  /** 是否可以注入角色提示（当前角色路由） */
  canUseRoleHint(): boolean {
    // 会晤模式下实体有自己的身份，不注入玉瑶角色提示
    return this.mode.kind !== 'entity_meeting' && this.mode.kind !== 'roleplay';
  }

  /** 是否可以注入 "不知道" 守卫（玉瑶不知道的事诚实说不知道） */
  canUseUnknownGuard(): boolean {
    // 会晤实体有自己的知识范围
    return this.mode.kind === 'normal' || this.mode.kind === 'secretary';
  }

  /** 是否可以检索用户记忆 */
  canRetrieveMemories(): boolean {
    // 会晤模式下跳过用户记忆检索（实体有自己的记忆范围）
    return this.mode.kind !== 'entity_meeting';
  }

  /** 是否可以使用 PFC 知识精炼 */
  canUsePFCKnowledgeRefine(): boolean {
    return this.mode.kind !== 'entity_meeting' && this.mode.kind !== 'roleplay';
  }

  /** 是否可以使用知识库 */
  canUseKnowledgeBase(): boolean {
    return this.mode.kind !== 'roleplay';
  }

  /** 是否为实体会晤 */
  isEntityMeeting(): boolean {
    return this.mode.kind === 'entity_meeting';
  }

  /** 是否为角色扮演 */
  isRoleplay(): boolean {
    return this.mode.kind === 'roleplay';
  }

  /** 获取活跃模式的简短描述 */
  getModeLabel(): string {
    switch (this.mode.kind) {
      case 'entity_meeting': return `会晤:${this.mode.entityName}`;
      case 'roleplay': return `扮演:${this.mode.roleName}`;
      case 'secretary': return '秘书模式';
      case 'task': return `任务:${this.mode.taskType}`;
      default: return '正常';
    }
  }

  /** 获取当前模式的 ChatModeKind，用于 PromptAssembler 的 modeScope */
  getModeKind(): ChatModeKind {
    return this.mode.kind;
  }
}

// ── 工厂函数 ──

export function normalMode(): ChatMode {
  return { kind: 'normal' };
}

export function meetingMode(entityUuid: string, entityName: string): ChatMode {
  return { kind: 'entity_meeting', entityUuid, entityName };
}

export function roleplayMode(branchId: string, roleId: string, roleName: string): ChatMode {
  return { kind: 'roleplay', branchId, roleId, roleName, allowMainFgRead: false };
}

export function secretaryMode(): ChatMode {
  return { kind: 'secretary' };
}

export function taskMode(taskType: string): ChatMode {
  return { kind: 'task', taskType };
}

export default ChatPolicy;
