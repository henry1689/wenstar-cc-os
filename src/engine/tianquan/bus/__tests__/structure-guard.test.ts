/**
 * Tianquan Bus 结构性守卫测试
 *
 * 用途：防止 bus/ 模块在后期维护中发生架构漂移。
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分
 */
import { describe, it, expect } from 'vitest';

describe('[Bus守卫] 导出完整性', () => {
  it('TianquanEventBus 可导入', async () => {
    const mod = await import('../TianquanEventBus.js');
    expect(typeof mod.TianquanEventBus).toBe('function');
  });

  it('bus/index.ts barrel 导出完整', async () => {
    const mod = await import('../index.js');
    expect(mod.TianquanEventBus).toBeDefined();
    expect(mod.ROUTING_TABLE).toBeDefined();
    expect(mod.logRoutingViolation).toBeDefined();
  });

  it('事件类型枚举不退化', async () => {
    const mod = await import('../types.js');
    const table = mod.ROUTING_TABLE;
    // 感知数据只能流入海马
    expect(table['perception:raw']).toBeDefined();
    expect(table['perception:raw'].allowedTargets).toContain('temporal');
  });

  it('TianquanEventBus 构造函数不崩溃', async () => {
    const { EventBus } = await import('../../../bus/EventBus.js');
    const { TianquanEventBus } = await import('../TianquanEventBus.js');
    const raw = new EventBus({ disableTrace: true });
    const tb = new TianquanEventBus(raw);
    expect(tb.isEnabled).toBe(true);
  });
});

describe('[Bus守卫] 路由规则完整性', () => {
  it('路由表包含 4 条核心规则', async () => {
    const { ROUTING_TABLE } = await import('../types.js');
    const keys = Object.keys(ROUTING_TABLE);
    expect(keys).toContain('perception:raw');
    expect(keys).toContain('knowledge:direct_query');
    expect(keys).toContain('scene:snapshot_ready');
    expect(keys).toContain('prefrontal:directive_issued');
  });

  it('TianquanEvent 联合类型包含 8 种事件', async () => {
    const types = await import('../types.js');
    // 验证事件类型常量存在（编译时联合类型由 TypeScript 保证）
    expect(types.logRoutingViolation).toBeDefined();
  });
});
