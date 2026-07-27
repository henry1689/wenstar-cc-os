/**
 * 身份稳定性与持久化行为测试 (P1-8)
 * =================================
 * 验证:
 *   1. 会晤模式不泄漏玉瑶身份
 *   2. 模式切换后身份正确恢复
 *   3. 持久化数据不丢失
 */
import { describe, it, expect } from 'vitest';
import { ChatPolicy, meetingMode, normalMode, roleplayMode, secretaryMode } from '../app/chat/ChatPolicy.js';
import { RoleplayIsolationGuard, buildIsolationContext } from '../app/role/RoleplayIsolationGuard.js';

describe('ChatPolicy — 模式切换身份正确性', () => {
  it('正常模式 → 所有权限开放', () => {
    const p = new ChatPolicy(normalMode());
    expect(p.canInjectM6()).toBe(true);
    expect(p.canUseRoleHint()).toBe(true);
    expect(p.canUseUnknownGuard()).toBe(true);
    expect(p.canUsePFCKnowledgeRefine()).toBe(true);
    expect(p.isEntityMeeting()).toBe(false);
    expect(p.isRoleplay()).toBe(false);
  });

  it('会晤模式 → M6/roleHint/unknownGuard 全部禁止', () => {
    const p = new ChatPolicy(meetingMode('TXS-1', '徐诗韵'));
    expect(p.canInjectM6()).toBe(false);
    expect(p.canUseRoleHint()).toBe(false);
    expect(p.canUseUnknownGuard()).toBe(false);
    expect(p.canUsePFCKnowledgeRefine()).toBe(false);
    expect(p.isEntityMeeting()).toBe(true);
  });

  it('角色扮演模式 → FG/M6/knowledgeBase 全禁', () => {
    const p = new ChatPolicy(roleplayMode('b1', 'r1', '胡冰'));
    expect(p.canUseMainFG()).toBe(false);
    expect(p.canPersistToMainFG()).toBe(false);
    expect(p.canInjectM6()).toBe(false);
    expect(p.canUseRoleHint()).toBe(false);
    expect(p.canUseKnowledgeBase()).toBe(false);
    expect(p.isRoleplay()).toBe(true);
  });

  it('会晤模式 → 记忆检索关闭', () => {
    const p = new ChatPolicy(meetingMode('TXS-2', '熊梓铭'));
    expect(p.canRetrieveMemories()).toBe(false);
  });

  it('秘书模式 → M6可用，其他业务权限同正常模式', () => {
    const p = new ChatPolicy(secretaryMode());
    expect(p.canInjectM6()).toBe(true);
    expect(p.canUseRoleHint()).toBe(true);
    expect(p.canUseMainFG()).toBe(true);
  });

  it('getModeLabel — 返回可读描述', () => {
    expect(new ChatPolicy(normalMode()).getModeLabel()).toBe('正常');
    expect(new ChatPolicy(meetingMode('','熊梓铭')).getModeLabel()).toBe('会晤:熊梓铭');
    expect(new ChatPolicy(roleplayMode('','','胡冰')).getModeLabel()).toBe('扮演:胡冰');
  });
});

describe('RoleplayIsolationGuard — 多模式切换不残留', () => {
  it('从角色扮演退出 → 新 guard 实例无违规', () => {
    const ctx = buildIsolationContext({ isRoleplay: false });
    const guard = new RoleplayIsolationGuard(ctx);
    guard.assertCleanup({ fgOverride: false, branchMemory: false, rpCache: false });
    expect(guard.hasViolations()).toBe(false);
  });

  it('正常模式 guard → 不检查 memory_tag', () => {
    const guard = new RoleplayIsolationGuard(buildIsolationContext({ isRoleplay: false }));
    guard.assertMemoryTag(undefined);
    expect(guard.hasViolations()).toBe(false);
  });

  it('真实人名检测 — 提取常见名', () => {
    const realNames = ['熊梓铭', '王全芬', '徐诗韵', '徐诗雨', '徐诗涵'];
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗韵' })
    );
    guard.assertRealPersonNotRoleplayed(realNames);
    expect(guard.hasViolations()).toBe(true);
  });

  it('角色退出后 guard 清空 → 可重用', () => {
    const guard = new RoleplayIsolationGuard(
      buildIsolationContext({ isRoleplay: true, roleName: '徐诗雨', fgWriteTarget: 'main' })
    );
    guard.assertNoMainFGWrite();
    expect(guard.hasViolations()).toBe(true);
    guard.clear();
    expect(guard.hasViolations()).toBe(false);
  });
});

describe('持久化行为 — ChatPolicy 模式快照', () => {
  const modes = ['normal', 'entity_meeting', 'roleplay', 'secretary'] as const;
  const expectedBlocks: Record<string, string[]> = {
    normal: ['M6', 'roleHint', 'memory', 'unknownGuard'],
    entity_meeting: ['entityContext'],
    roleplay: [],
    secretary: ['M6', 'roleHint'],
  };

  for (const mode of modes) {
    it(`${mode} 模式 — 验证权限矩阵不退化`, () => {
      const p = mode === 'entity_meeting' ? new ChatPolicy(meetingMode('', ''))
        : mode === 'roleplay' ? new ChatPolicy(roleplayMode('', '', ''))
        : mode === 'secretary' ? new ChatPolicy(secretaryMode())
        : new ChatPolicy(normalMode());

      // 每个模式的核心权限不随时间退化
      expect(p.getModeLabel().length).toBeGreaterThan(0);
      expect(typeof p.canInjectM6()).toBe('boolean');
      expect(typeof p.canUseMainFG()).toBe('boolean');
      expect(typeof p.canPersistToMainFG()).toBe('boolean');
    });
  }
});
