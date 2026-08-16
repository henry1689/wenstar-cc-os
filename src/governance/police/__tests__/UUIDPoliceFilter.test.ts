import { describe, it, expect } from 'vitest';
import { passes, buildSqlClause, filterRows, assertMasterKey, canWriteEntity } from '../UUIDPoliceFilter.js';

const POLICY = {
  visibleUuids: new Set(['TXS-000000001', 'TXS-000000007']), // 我 + 徐诗雨
  allowUnowned: false,
};

describe('UUIDPoliceFilter — 户籍公安过滤器', () => {
  it('白名单内 UUID → 放行', () => {
    expect(passes('TXS-000000007', POLICY)).toBe(true);
  });

  it('白名单外 UUID → 拒绝', () => {
    expect(passes('TXS-000000003', POLICY)).toBe(false); // 熊梓铭不在白名单
  });

  it('无归属记录 + allowUnowned=false → 拒绝（杜绝逃生口）', () => {
    expect(passes(null, POLICY)).toBe(false);
    expect(passes('', POLICY)).toBe(false);
    expect(passes(undefined, POLICY)).toBe(false);
  });

  it('无归属记录 + allowUnowned=true → 放行（户主钥匙场景）', () => {
    expect(passes(null, { visibleUuids: POLICY.visibleUuids, allowUnowned: true })).toBe(true);
  });

  it('buildSqlClause 收编逃生口：无 allowUnowned 时不输出 OR IS NULL', () => {
    const { clause, params } = buildSqlClause(POLICY);
    expect(clause).not.toContain('IS NULL');
    expect(clause).toContain('belong_entity_uuid IN (?,?)');
    expect(params).toEqual(['TXS-000000001', 'TXS-000000007']);
  });

  it('buildSqlClause 空白名单 → AND 1=0（fail-closed）', () => {
    const { clause } = buildSqlClause({ visibleUuids: new Set(), allowUnowned: false });
    expect(clause).toBe(' AND 1=0');
  });

  it('filterRows 行级过滤：白名单外剔除', () => {
    const rows = [
      { belong_entity_uuid: 'TXS-000000007' }, // 徐诗雨（白名单）
      { belong_entity_uuid: 'TXS-000000003' }, // 熊梓铭（不在）
      { belong_entity_uuid: null },            // 无归属（拒绝）
    ];
    const filtered = filterRows(rows as any, POLICY);
    expect(filtered.length).toBe(1);
    expect(filtered[0].belong_entity_uuid).toBe('TXS-000000007');
  });

  it('assertMasterKey：白名单内放行，越权抛错', () => {
    expect(() => assertMasterKey('TXS-000000007', POLICY)).not.toThrow();
    expect(() => assertMasterKey('TXS-000000003', POLICY)).toThrow(/最高权限钥匙/);
    expect(() => assertMasterKey(null, POLICY)).toThrow(); // 无归属 + 非户主钥匙
  });

  describe('canWriteEntity — 写侧授权（会晤写隔离）', () => {
    // 模拟主 FG：徐诗雨(TXS-7) / 熊梓铭(TXS-3) 已存在
    const mockFg = {
      getUUIDByName: (name: string) =>
        name === '徐诗雨' ? 'TXS-000000007' : name === '熊梓铭' ? 'TXS-000000003' : null,
    };

    it('非会晤 → 任意实体均可写', () => {
      expect(canWriteEntity('张三', { meetingEntityName: null }, mockFg).allowed).toBe(true);
      expect(canWriteEntity('熊梓铭', {}, mockFg).allowed).toBe(true);
    });

    it('会晤中 → 写会晤实体本人放行', () => {
      const r = canWriteEntity('徐诗雨', { meetingEntityName: '徐诗雨', meetingEntityUuid: 'TXS-000000007' }, mockFg);
      expect(r.allowed).toBe(true);
    });

    it('会晤中 → 写主FG不存在的新实体放行', () => {
      const r = canWriteEntity('新同事李四', { meetingEntityName: '徐诗雨' }, mockFg);
      expect(r.allowed).toBe(true);
    });

    it('会晤中 → 写主FG已有的其他实体拒绝', () => {
      const r = canWriteEntity('熊梓铭', { meetingEntityName: '徐诗雨' }, mockFg);
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain('熊梓铭');
    });

    it('空目标名 → 拒绝', () => {
      expect(canWriteEntity('', { meetingEntityName: '徐诗雨' }, mockFg).allowed).toBe(false);
    });
  });
});
