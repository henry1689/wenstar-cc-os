/**
 * MeetingSessionContext — 会晤会话不可变上下文快照
 *
 * 🔴 B-1: 将 chat.ts 中散落的 9 个与会晤状态相关的变量收敛为单一不可变对象。
 * 创建后不可变（每轮对话创建新实例），确保同轮内所有消费方看到一致的快照。
 *
 * 收敛变量: _meetingEntityName | _entityContextText | _meetingKBCache | _activeMeetingName
 */

export interface MeetingSnapshot {
  entityName: string | null;
  contextText: string;
  sceneLabel: string;
  isActive: boolean;
}

export class MeetingSessionContext {
  /** 会晤实体名（如"徐诗韵"），null=未在会晤中 */
  private readonly _entityName: string | null;
  /** 实体上下文文本（含档案+对话历史+开场协议） */
  private readonly _contextText: string;
  /** 知识库缓存 Map（跨轮次共享引用，存储实体名→KB内容映射） */
  private readonly _kbCache: Map<string, string>;

  constructor(params: {
    entityName: string | null;
    contextText: string;
    kbCache: Map<string, string>;
  }) {
    this._entityName = params.entityName;
    this._contextText = params.contextText;
    this._kbCache = params.kbCache;
  }

  /** 会晤实体名（null=未激活） */
  getEntityName(): string | null {
    return this._entityName;
  }

  /** 实体上下文文本（含档案+对话历史+开场协议） */
  getContextText(): string {
    return this._contextText;
  }

  /** 知识库缓存（跨轮次共享） */
  getKBCache(): Map<string, string> {
    return this._kbCache;
  }

  /** 会晤是否激活 */
  isActive(): boolean {
    return this._entityName !== null;
  }

  /** 输出快照（供 PFC 等下游使用） */
  toSnapshot(): MeetingSnapshot {
    return {
      entityName: this._entityName,
      contextText: this._contextText,
      sceneLabel: this._entityName ? `会晤:${this._entityName}` : '对话中',
      isActive: this._entityName !== null,
    };
  }
}
