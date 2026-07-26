/**
 * MeetingFGWriter — FG 写入操作统一服务
 *
 * 🔴 C-1: 将 chat.ts 中 3 处 FG 直接写入操作迁移到专用服务。
 * 统一处理"真实FG vs 角色FG"分支判定。
 *
 * 🚨 FG 红线 8: _realFg vs _fgX 分叉不能混淆
 * 🚨 FG 红线 1: 角色扮演时禁止向主 FG 写入
 * 🚨 全局规则 2: FamilyGraph.ts 为唯一数据源 — MeetingFGWriter 是代理层
 */

import type { FamilyGraph } from './FamilyGraph.js';

export interface MeetingFGWriterDeps {
  /** 主 FamilyGraph 实例（真实 FG，写操作使用） */
  realFg: FamilyGraph;
  /** 当前 FamilyGraph 实例（可能是角色分支，读操作使用） */
  currentFg: FamilyGraph;
  /** 是否处于角色扮演模式 */
  isRoleplay: boolean;
}

export class MeetingFGWriter {
  private deps: MeetingFGWriterDeps;

  constructor(deps: MeetingFGWriterDeps) {
    this.deps = deps;
  }

  /** 检查是否可以安全写入主 FG */
  private canWrite(): boolean {
    // 🔴 FG 红线 1: 角色扮演时禁止向主 FG 写入
    return !this.deps.isRoleplay;
  }

  /**
   * 更新人物档案
   * 🔴 FG 红线 8: 写操作用 _realFg（绕过角色分支），读操作用 _fgX
   */
  updatePersonProfile(entityName: string, updates: Record<string, any>): void {
    if (!this.canWrite()) {
      console.log('[MeetingFGWriter] 角色扮演模式，跳过主 FG 档案写入:', entityName);
      return;
    }
    this.deps.realFg.updatePersonProfile(entityName, updates as any, { countMention: false });
  }

  /**
   * 添加外貌/特征边
   * 🔴 FG 红线 8: 同步调用 addFeatureEdge
   */
  addFeatureEdge(personName: string, featureName: string, featureType: 'appearance' | 'body' | 'style' | 'trait' = 'appearance'): void {
    if (!this.canWrite()) {
      console.log('[MeetingFGWriter] 角色扮演模式，跳过特征边写入:', personName, featureName);
      return;
    }
    try {
      this.deps.currentFg.addFeatureEdge?.(personName, featureName, featureType)
        ?.catch((e: any) => console.warn('[FG] addFeatureEdge失败:', e?.message));
    } catch (e: any) {
      console.warn('[FG] addFeatureEdge调用异常:', e?.message);
    }
  }

  /**
   * 同步人际关系
   * 为尚未建立家庭关系的 person 实体写入"熟人"关系
   */
  syncSocialRelation(personName: string, message: string): void {
    if (!this.canWrite()) {
      console.log('[MeetingFGWriter] 角色扮演模式，跳过关系写入:', personName);
      return;
    }
    this.deps.currentFg.integrateSocialRelation?.(personName, 'acquaintance_of', message)
      ?.catch((e: any) => console.warn('[chat] FG关系写入失败:', e?.message));
  }
}

/**
 * 从 chat.ts 上下文创建 MeetingFGWriter 实例
 *
 * 🔴 FG 红线 8: 当调用方持有主 FG 引用时（如 server.ts 初始化阶段保存的 _mainFg），
 *    通过 realFg 参数传入，确保写操作始终指向主 FG 而非角色分支 FG。
 *    currentFg 仍从 ctx.m4.getFamilyGraph() 获取（可能被角色 override）。
 */
export function createMeetingFGWriter(ctx: {
  m4?: { getFamilyGraph?: () => FamilyGraph };
  _currentRoleplay?: any;
  /** 🔴 红线8: 可选的主 FG 引用——绕过角色分支，确保写操作写入正确 FG */
  realFg?: FamilyGraph;
}): MeetingFGWriter | null {
  if (!ctx.m4) return null;
  const currentFg = ctx.m4.getFamilyGraph?.();
  if (!currentFg) return null;
  const realFg = ctx.realFg ?? currentFg;
  return new MeetingFGWriter({
    realFg,
    currentFg,
    isRoleplay: !!ctx._currentRoleplay,
  });
}
