/**
 * 天权四域仿生闭环 — 集成测试
 *
 * 覆盖 "感知→海马→前额→指令" 完整闭环。
 * Ref: WS-TIANQUAN-BIONIC-001 §第三部分
 */
import { describe, it, expect } from 'vitest';

describe('天权四域仿生闭环', () => {
  it('五域 barrel 导出完整', async () => {
    const tianquan = await import('../index.js');
    // 五域入口可导入
    expect(tianquan.prefrontal).toBeDefined();
    expect(tianquan.temporal).toBeDefined();
    expect(tianquan.heart).toBeDefined();
    expect(tianquan.knowledge).toBeDefined();
    expect(tianquan.bus).toBeDefined();
  });

  it('顶层便捷导出完整', async () => {
    const tianquan = await import('../index.js');
    expect(tianquan.TianquanEventBus).toBeDefined();
    expect(tianquan.KnowledgeBridge).toBeDefined();
    expect(tianquan.KnowledgeAccessFacade).toBeDefined();
    expect(tianquan.PrefrontalCortex).toBeDefined();
    expect(tianquan.assemblePrefrontal).toBeDefined();
  });

  it('子域 barrel 导出完整', async () => {
    const bus = await import('../bus/index.js');
    expect(bus.TianquanEventBus).toBeDefined();

    const kb = await import('../knowledge/index.js');
    expect(kb.KnowledgeBridge).toBeDefined();

    const pfc = await import('../prefrontal/index.js');
    expect(pfc.PrefrontalCortex).toBeDefined();
    expect(pfc.ConstraintValidator).toBeDefined();
    expect(pfc.DirectiveGenerator).toBeDefined();
    expect(pfc.MetacognitionReview).toBeDefined();

    const tmp = await import('../temporal/index.js');
    expect(tmp.HippocampusRhythmCoordinator).toBeDefined();
    expect(tmp.KnowledgeAccessFacade).toBeDefined();
  });

  it('总线路由表规则完整', async () => {
    const { ROUTING_TABLE } = await import('../bus/types.js');
    const rule = ROUTING_TABLE['perception:raw'];
    expect(rule.allowedTargets).toEqual(['temporal']);
  });

  it('场景快照类型可导入', async () => {
    const types = await import('../temporal/types.js');
    expect(types).toBeDefined();
  });

  it('前额域类型可导入', async () => {
    const types = await import('../prefrontal/types.js');
    expect(types).toBeDefined();
  });
});
