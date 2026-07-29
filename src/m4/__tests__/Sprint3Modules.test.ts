/**
 * Sprint3-modules.test.ts — ForesightFilter + NarrativeAssembler 集成测试
 */
import { describe, it, expect } from 'vitest';
import { filterExpiredForesight, annotateForesightWarnings } from '../filters/ForesightValidityFilter.js';
import { MemoryNarrativeAssembler } from '../narrative/MemoryNarrativeAssembler.js';
import type { MemoryClosureResult } from '../graph/MemoryAssociationTypes.js';

describe('ForesightValidityFilter', () => {
  it('非 foresight 记忆直接放行', () => {
    const items = [{ isForesight: false, text: 'hello' }];
    const result = filterExpiredForesight(items);
    expect(result).toHaveLength(1);
  });

  it('过期未完成计划默认不返回', () => {
    const now = Date.now();
    const items = [
      { isForesight: true, validUntilMs: now - 86400000, foresightStatus: 'active', text: 'expired' },
    ];
    const result = filterExpiredForesight(items, { nowMs: now });
    expect(result).toHaveLength(0);
  });

  it('includeExpired=true 可调试查看全部', () => {
    const now = Date.now();
    const items = [
      { isForesight: true, validUntilMs: now - 86400000, foresightStatus: 'active', text: 'expired' },
    ];
    const result = filterExpiredForesight(items, { nowMs: now, includeExpired: true });
    expect(result).toHaveLength(1);
  });

  it('未来计划 normal 默认保留', () => {
    const now = Date.now();
    const items = [
      { isForesight: true, validStartMs: now + 86400000, validUntilMs: now + 7 * 86400000, foresightStatus: 'future', text: 'future' },
    ];
    const result = filterExpiredForesight(items, { nowMs: now });
    expect(result).toHaveLength(1);
  });

  it('completed 状态默认保留', () => {
    const items = [
      { isForesight: true, foresightStatus: 'completed', text: 'done' },
    ];
    const result = filterExpiredForesight(items);
    expect(result).toHaveLength(1);
  });

  it('annotateForesightWarnings 标注过期项', () => {
    const now = Date.now();
    const items = [
      { isForesight: true, validUntilMs: now - 86400000, foresightStatus: 'active', text: 'expired' },
      { isForesight: false, text: 'normal' },
    ];
    const warnings = annotateForesightWarnings(items, now);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('expired_foresight');
  });
});

describe('MemoryNarrativeAssembler', () => {
  const assembler = new MemoryNarrativeAssembler();

  const closure: MemoryClosureResult = {
    seedGlobalUids: ['S1'],
    nodes: [
      { globalUid: 'S1', depth: 0, isSeed: true },
      { globalUid: 'N1', depth: 1, isSeed: false },
      { globalUid: 'N2', depth: 1, isSeed: false },
    ],
    edges: [
      {
        id: 1, namespace: 'default', belongEntityUuid: 'u1',
        sourceGlobalUid: 'S1', targetGlobalUid: 'N1',
        edgeType: 'causal', edgeReason: 'test',
        confidence: 0.8, weight: 1.0,
        sourceTimestampMs: 1000, targetTimestampMs: 2000,
        createdBy: 'test', createdAtMs: 1000, updatedAtMs: 1000,
        stateFlag: 'active',
      },
      {
        id: 2, namespace: 'default', belongEntityUuid: 'u1',
        sourceGlobalUid: 'N1', targetGlobalUid: 'N2',
        edgeType: 'entity', edgeReason: 'test',
        confidence: 0.7, weight: 1.0,
        sourceTimestampMs: 2000, targetTimestampMs: 3000,
        createdBy: 'test', createdAtMs: 2000, updatedAtMs: 2000,
        stateFlag: 'active',
      },
    ],
  };

  const textMap = new Map([
    ['S1', { rawInput: '妈妈身体不好我很担心', calciumScore: 2.5, emotion: '焦虑', createdAt: '2026-07-15T14:30:00Z', foresightStatus: 'none' }],
    ['N1', { rawInput: '建议回去看看', calciumScore: 1.5, emotion: '温暖', createdAt: '2026-07-15T14:32:00Z', foresightStatus: 'none' }],
    ['N2', { rawInput: '决定下周请假回家', calciumScore: 2.0, emotion: '释然', createdAt: '2026-07-16T09:15:00Z', foresightStatus: 'future' }],
  ]);

  it('输入闭包子图 → 输出 timeline', () => {
    const narrative = assembler.assemble(closure, textMap);
    expect(narrative.timeline).toHaveLength(3);
    expect(narrative.timeline[0].content).toContain('妈妈');
  });

  it('种子节点被标记为关键事件', () => {
    const narrative = assembler.assemble(closure, textMap);
    const seedItem = narrative.timeline.find(t => t.globalUid === 'S1');
    expect(seedItem).toBeDefined();
    expect(seedItem!.isSeed).toBe(true);
    expect(seedItem!.isKeyEvent).toBe(true);
  });

  it('输出 relations 带中文解释', () => {
    const narrative = assembler.assemble(closure, textMap);
    expect(narrative.relations).toHaveLength(2);
    expect(narrative.relations[0].explanation).toContain('因果');
  });

  it('情绪弧线正确连接', () => {
    const narrative = assembler.assemble(closure, textMap);
    expect(narrative.emotionArc).toBeDefined();
    expect(narrative.emotionArc!.summary).toBe('焦虑 → 温暖 → 释然');
  });

  it('foresight 状态生成 warning', () => {
    const narrative = assembler.assemble(closure, textMap);
    // N2 有 foresightStatus='future'
    expect(narrative.warnings.length).toBeGreaterThanOrEqual(1);
    expect(narrative.warnings.some(w => w.includes('future'))).toBe(true);
  });

  it('compactText 包含关键信息', () => {
    const narrative = assembler.assemble(closure, textMap);
    expect(narrative.compactText).toContain('时间线');
    expect(narrative.compactText).toContain('关系');
    expect(narrative.compactText).toContain('情绪演变');
  });

  it('compactText 不超过 maxTokens', () => {
    const narrative = assembler.assemble(closure, textMap, 200);
    expect(narrative.compactText.length).toBeLessThanOrEqual(203);
  });

  it('无边图安全降级 — 返回普通列表', () => {
    const noEdgeClosure: MemoryClosureResult = {
      seedGlobalUids: ['X'],
      nodes: [{ globalUid: 'X', depth: 0, isSeed: true }],
      edges: [],
    };
    const tm = new Map([['X', { rawInput: '普通记忆', calciumScore: 0.5, emotion: '中性', createdAt: '2026-01-01', foresightStatus: 'none' }]]);
    const narrative = assembler.assemble(noEdgeClosure, tm);
    expect(narrative.timeline).toHaveLength(1);
    expect(narrative.relations).toHaveLength(0);
    expect(narrative.compactText).toContain('时间线');
    // 无边时不包含"关系："标题
    expect(narrative.compactText).not.toContain('\n关系：');
  });
});
