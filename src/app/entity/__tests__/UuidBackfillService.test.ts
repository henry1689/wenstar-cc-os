import { describe, it, expect } from 'vitest';
import { resolveOwnership, OWNER_UUID } from '../EntityOwnershipResolver.js';
import { classifyRecord, isGarbage, buildGroupOwnershipMap } from '../UuidBackfillService.js';

const mockFg = {
  getAllPersonNames: () => ['徐诗雨', '熊梓铭', '玉瑶'],
  getUUIDByName: (name: string) =>
    name === '徐诗雨' ? 'TXS-000000007'
    : name === '熊梓铭' ? 'TXS-000000003'
    : name === '玉瑶' ? 'TXS-000000001' : null,
};

describe('EntityOwnershipResolver — ownerFallback（V13 兜底）', () => {
  it('entity_genes 命中 → 归属实体', () => {
    const r = resolveOwnership('我和诗雨去吃饭', [{ type: 'person', name: '徐诗雨' } as any], mockFg, 'user');
    expect(r.uuid).toBe('TXS-000000007');
  });

  it('无归属 + 默认(不兜底) → null', () => {
    const r = resolveOwnership('今天天气不错', [], mockFg, 'user');
    expect(r.uuid).toBeNull();
    expect(r.src).toBe('none');
  });

  it('无归属 + ownerFallback=true → 户主玉瑶', () => {
    const r = resolveOwnership('今天天气不错', [], mockFg, 'user', { ownerFallback: true });
    expect(r.uuid).toBe(OWNER_UUID);
    expect(r.src).toBe('owner_fallback');
  });

  it('显式指名全名 → 归属', () => {
    const r = resolveOwnership('徐诗雨在高峰电业工作', [], mockFg, 'user');
    expect(r.uuid).toBe('TXS-000000007');
  });
});

describe('UuidBackfillService — classifyRecord（回填器）', () => {
  it('垃圾判定：GBK 乱码 → garbage', () => {
    expect(isGarbage('����ʫ������')).toBe(true);
  });

  it('垃圾判定：正常中文 → 非垃圾', () => {
    expect(isGarbage('诗雨，你认识这几个吗')).toBe(false);
  });

  it('垃圾判定：emoji 短消息保留（H3 加固）', () => {
    expect(isGarbage('哈哈😂')).toBe(false);
    expect(isGarbage('好的👍')).toBe(false);
  });

  it('垃圾判定：纯数字保留（H3 加固）', () => {
    expect(isGarbage('666')).toBe(false);
    expect(isGarbage('520')).toBe(false);
  });

  it('对话组传导：组内 UUID 传导', () => {
    const groupMap = buildGroupOwnershipMap([{ dialog_group_id: 'DG1', belong_entity_uuid: 'TXS-000000007', c: 3 }]);
    const d = classifyRecord('随便聊聊', { dialogGroupId: 'DG1', groupMap });
    expect(d.rule).toBe('group_conduct');
    expect(d.uuid).toBe('TXS-000000007');
  });

  it('简称匹配：诗雨 → 徐诗雨（3字名去姓）', () => {
    const d = classifyRecord('诗雨，你在哪工作', { fg: mockFg, role: 'user' });
    expect(d.rule).toBe('explicit_mention');
    expect(d.uuid).toBe('TXS-000000007');
  });

  it('无法判断 → 户主兜底', () => {
    const d = classifyRecord('今天天气不错', { fg: mockFg, role: 'user' });
    expect(d.rule).toBe('owner_fallback');
    expect(d.uuid).toBe(OWNER_UUID);
  });
});