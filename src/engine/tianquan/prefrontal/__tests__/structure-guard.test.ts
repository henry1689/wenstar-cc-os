/**
 * Prefrontal 结构守卫测试
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分 §2
 */
import { describe, it, expect } from 'vitest';

describe('[Prefrontal守卫] 导出完整性', () => {
  it('5 个子模块全部可导入', async () => {
    const wm = await import('../WorkingMemory.js');
    const gs = await import('../GoalStack.js');
    const cv = await import('../ConstraintValidator.js');
    const dg = await import('../DirectiveGenerator.js');
    const mc = await import('../MetacognitionReview.js');
    const pc = await import('../PrefrontalCortex.js');
    const ap = await import('../assemblePrefrontal.js');

    expect(typeof wm.WorkingMemory).toBe('function');
    expect(typeof gs.GoalStack).toBe('function');
    expect(typeof cv.ConstraintValidator).toBe('function');
    expect(typeof dg.DirectiveGenerator).toBe('function');
    expect(typeof mc.MetacognitionReview).toBe('function');
    expect(typeof pc.PrefrontalCortex).toBe('function');
    expect(typeof ap.assemblePrefrontal).toBe('function');
  });

  it('prefrontal/index.ts barrel 导出完整', async () => {
    const mod = await import('../index.js');
    expect(mod.PrefrontalCortex).toBeDefined();
    expect(mod.ConstraintValidator).toBeDefined();
    expect(mod.DirectiveGenerator).toBeDefined();
    expect(mod.MetacognitionReview).toBeDefined();
    expect(mod.WorkingMemory).toBeDefined();
    expect(mod.GoalStack).toBeDefined();
    expect(mod.assemblePrefrontal).toBeDefined();
  });

  it('types 定义完整', async () => {
    const types = await import('../types.js');
    // 验证关键接口存在（编译时类型，运行时检查模块加载）
    expect(types).toBeDefined();
  });
});
