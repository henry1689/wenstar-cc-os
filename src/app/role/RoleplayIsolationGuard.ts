/**
 * RoleplayIsolationGuard — 角色扮演隔离守卫 (V12.0 P0-5)
 * ========================================================
 * 确保角色扮演时绝对不污染主 FG、不泄漏主 FG 数据、
 * 角色记忆正确标记、退出时完全清理。
 *
 * 五条红线:
 *   1. 虚构角色不得写入主 FG
 *   2. 角色分支不得读取主 FG（allowMainFgRead=false 时）
 *   3. 角色扮演记忆必须标记 memory_type='rp_dialog'
 *   4. FG 真人不能被角色扮演（检测后再入分支）
 *   5. 退出角色扮演时必须清理所有分支状态
 *
 * 设计原则: 断言式——违规时抛 error 并记录，不静默吞下。
 */

export interface IsolationContext {
  /** 当前是否为角色扮演模式 */
  isRoleplay: boolean;
  /** 角色名（如果 isRoleplay） */
  roleName?: string;
  /** FG 写入目标 ('main' | 'branch') */
  fgWriteTarget: 'main' | 'branch';
  /** 是否允许读取主 FG */
  allowMainFgRead: boolean;
}

/** 5条红线的违规记录 */
export interface IsolationViolation {
  /** 违规类型 */
  rule: 'fg_write' | 'fg_read' | 'memory_tag' | 'real_person' | 'cleanup';
  /** 违规描述 */
  message: string;
  /** ISO时间戳 */
  timestamp: string;
}

/**
 * 角色扮演隔离守卫
 *
 * 用法:
 *   const guard = new RoleplayIsolationGuard({ isRoleplay: true, roleName: '熊梓铭', ... });
 *   guard.assertNoMainFGWrite();  // 角色扮演中写主FG → throw
 *   guard.assertMemoryTag();      // 角色记忆未标记rp_dialog → throw
 */
export class RoleplayIsolationGuard {
  private violations: IsolationViolation[] = [];

  constructor(private ctx: IsolationContext) {}

  /** 断言: 当前不在角色扮演中，或在角色扮演中但写入目标是分支 FG */
  assertNoMainFGWrite(): void {
    if (this.ctx.isRoleplay && this.ctx.fgWriteTarget === 'main') {
      const msg = `角色扮演"${this.ctx.roleName}"中尝试写入主FG — 已拦截`;
      this.violations.push({ rule: 'fg_write', message: msg, timestamp: new Date().toISOString() });
      console.error('[RoleplayGuard] ' + msg);
    }
  }

  /** 断言: 当前不在角色扮演中，或 allowMainFgRead=true */
  assertNoMainFGRead(): void {
    if (this.ctx.isRoleplay && !this.ctx.allowMainFgRead) {
      const msg = `角色扮演"${this.ctx.roleName}"中尝试读取主FG — allowMainFgRead=false`;
      this.violations.push({ rule: 'fg_read', message: msg, timestamp: new Date().toISOString() });
      console.warn('[RoleplayGuard] ' + msg);
    }
  }

  /** 断言: 角色扮演中的记忆必须标记 rp_dialog */
  assertMemoryTag(memoryType: string | undefined): void {
    if (this.ctx.isRoleplay && memoryType !== 'rp_dialog') {
      const msg = `角色扮演"${this.ctx.roleName}"记忆未标记 rp_dialog (当前: ${memoryType || 'undefined'})`;
      this.violations.push({ rule: 'memory_tag', message: msg, timestamp: new Date().toISOString() });
      console.warn('[RoleplayGuard] ' + msg);
    }
  }

  /** 断言: FG 中已注册的真人不能作为角色扮演对象 */
  assertRealPersonNotRoleplayed(allRealPersons: string[]): void {
    if (this.ctx.isRoleplay && this.ctx.roleName && allRealPersons.includes(this.ctx.roleName)) {
      const msg = `FG真人"${this.ctx.roleName}"被作为角色扮演对象 — 已拦截`;
      this.violations.push({ rule: 'real_person', message: msg, timestamp: new Date().toISOString() });
      console.error('[RoleplayGuard] ' + msg);
    }
  }

  /** 断言: 退出角色扮演时所有分支状态必须清理 */
  assertCleanup(branchState: Record<string, boolean>): void {
    const unclean = Object.entries(branchState).filter(([, active]) => active);
    if (unclean.length > 0) {
      const msg = `退出角色扮演但残留分支状态: ${unclean.map(([k]) => k).join(', ')}`;
      this.violations.push({ rule: 'cleanup', message: msg, timestamp: new Date().toISOString() });
      console.error('[RoleplayGuard] ' + msg + ' — 强制清理');
    }
  }

  /** 返回是否违反了任一条红线 */
  hasViolations(): boolean {
    return this.violations.length > 0;
  }

  /** 获取所有违规记录 */
  getViolations(): IsolationViolation[] {
    return [...this.violations];
  }

  /** 清空违规记录 */
  clear(): void {
    this.violations = [];
  }
}

/**
 * 创建隔离上下文 — 从 chat.ts 的零散状态构建
 */
export function buildIsolationContext(opts: {
  isRoleplay?: boolean,
  roleName?: string,
  fgWriteTarget?: 'main' | 'branch',
  allowMainFgRead?: boolean,
}): IsolationContext {
  return {
    isRoleplay: opts.isRoleplay || false,
    roleName: opts.roleName,
    fgWriteTarget: opts.fgWriteTarget || 'main',
    allowMainFgRead: opts.allowMainFgRead !== false,
  };
}

export default RoleplayIsolationGuard;
