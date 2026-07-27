/**
 * 角色扮演隔离红线测试 (P0-5)
 * ============================
 * 五条红线全量覆盖。每个测试代表一个不可妥协的隔离要求。
 */

import { describe, it, expect } from 'vitest';
import { RoleplayIsolationGuard, buildIsolationContext } from '../app/role/RoleplayIsolationGuard.js';

describe('角色扮演隔离 — 五条红线', () => {
  // ── 红线 1: 虚构角色不得写入主 FG ──
  it('红线1: 角色扮演中写主FG → 触发违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨', fgWriteTarget: 'main' })
    );
    guard.assertNoMainFGWrite();
    expect(guard.hasViolations()).toBe(true);
    expect(guard.getViolations()[0].rule).toBe('fg_write');
  });

  it('红线1: 非角色扮演写主FG → 无违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: false, fgWriteTarget: 'main' })
    );
    guard.assertNoMainFGWrite();
    expect(guard.hasViolations()).toBe(false);
  });

  it('红线1: 角色扮演中写分支FG → 无违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨', fgWriteTarget: 'branch' })
    );
    guard.assertNoMainFGWrite();
    expect(guard.hasViolations()).toBe(false);
  });

  // ── 红线 2: 角色分支不得读取主 FG ──
  it('红线2: allowMainFgRead=false 时读主FG → 触发违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨', allowMainFgRead: false })
    );
    guard.assertNoMainFGRead();
    expect(guard.hasViolations()).toBe(true);
    expect(guard.getViolations()[0].rule).toBe('fg_read');
  });

  it('红线2: allowMainFgRead=true 时读主FG → 无违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨', allowMainFgRead: true })
    );
    guard.assertNoMainFGRead();
    expect(guard.hasViolations()).toBe(false);
  });

  // ── 红线 3: 角色扮演记忆必须标记 rp_dialog ──
  it('红线3: 角色记忆未标记rp_dialog → 触发违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨' })
    );
    guard.assertMemoryTag('dialog');  // 普通对话类型
    expect(guard.hasViolations()).toBe(true);
    expect(guard.getViolations()[0].rule).toBe('memory_tag');
  });

  it('红线3: 角色记忆标记为rp_dialog → 无违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨' })
    );
    guard.assertMemoryTag('rp_dialog');
    expect(guard.hasViolations()).toBe(false);
  });

  it('红线3: 非角色扮演不检查memory_tag', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: false })
    );
    guard.assertMemoryTag(undefined);
    expect(guard.hasViolations()).toBe(false);
  });

  // ── 红线 4: FG 真人不能被角色扮演 ──
  it('红线4: 角色名在FG真人列表中 → 触发违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '熊梓铭' })
    );
    guard.assertRealPersonNotRoleplayed(['熊梓铭', '王全芬', '徐诗韵']);
    expect(guard.hasViolations()).toBe(true);
    expect(guard.getViolations()[0].rule).toBe('real_person');
  });

  it('红线4: 角色名不在FG真人列表中 → 无违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '虚构角色张三' })
    );
    guard.assertRealPersonNotRoleplayed(['熊梓铭', '王全芬']);
    expect(guard.hasViolations()).toBe(false);
  });

  // ── 红线 5: 退出角色扮演时必须清理所有分支状态 ──
  it('红线5: 退出时有残留分支状态 → 触发违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: false })
    );
    guard.assertCleanup({ fgOverride: true, branchMemory: false, rpCache: true });
    expect(guard.hasViolations()).toBe(true);
    expect(guard.getViolations()[0].rule).toBe('cleanup');
  });

  it('红线5: 退出时所有分支状态已清理 → 无违规', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: false })
    );
    guard.assertCleanup({ fgOverride: false, branchMemory: false, rpCache: false });
    expect(guard.hasViolations()).toBe(false);
  });
});

describe('buildIsolationContext — 默认值', () => {
  it('空参数 → 正常模式无违规', () => {
    const ctx = buildIsolationContext({});
    expect(ctx.isRoleplay).toBe(false);
    expect(ctx.fgWriteTarget).toBe('main');
    expect(ctx.allowMainFgRead).toBe(true);
  });

  it('基本角色参数正确映射', () => {
    const ctx = buildIsolationContext({ isRoleplay: true, roleName: '测试', fgWriteTarget: 'branch' });
    expect(ctx.isRoleplay).toBe(true);
    expect(ctx.roleName).toBe('测试');
    expect(ctx.fgWriteTarget).toBe('branch');
  });
});
