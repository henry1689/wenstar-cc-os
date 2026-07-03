/**
 * 角色扮演域管线集成测试
 *
 * 覆盖：
 *   场景 1：数据完整 → missingFields 为空
 *   场景 2：年龄缺失 → missingFields 包含 '年龄'
 *   场景 3：不认识的人 → unknownEntities 包含该人
 *   场景 4：已知人物 → knownPersons 包含该人
 *
 * 🔴 铁律：不在 ReadinessGate 中做条件判断。
 *   验证方向：数据覆盖报告是否正确，而非"有没有注入反编造"。
 *   反编造在 PromptAssembler 层无条件执行——所有缺失字段自动生成未知边界。
 *
 * 运行：npx vitest run src/__tests__/roleplay-pipeline.test.ts
 */
import { describe, it, expect } from 'vitest';
import { coverageReport } from '../app/roleplay/ReadinessGate.js';
import { classifyIntent } from '../app/roleplay/DataCollector.js';
import { getOrCreateTempProfile, clearAllTempProfiles, updateTempProfile, extractInfoPoints } from '../app/roleplay/RoleplayProfileManager.js';
import type { CollectedData } from '../app/roleplay/types.js';

function makeEmptyData(overrides?: Partial<CollectedData>): CollectedData {
  return {
    fg: { branch: null, treeText: '', rootProfile: null, familyMembers: ['徐诗雨'], familyProfiles: {} },
    kb: [],
    history: [],
    portrait: null,
    context: {
      message: '', entities: [], kinshipTerms: [],
      pronounTarget: null, intent: 'chat',
    },
    knownFields: {
      hasAge: false, hasRelations: true, hasAppearance: false,
      hasOccupation: false, hasPersonality: false, askedPersonFound: false,
    },
    ...overrides,
  };
}

describe('角色扮演域管线', () => {
  // ── 意图分类（保留，DataCollector 需要） ──
  describe('意图分类', () => {
    it('问人意图', () => {
      expect(classifyIntent('她叫什么名字')).toBe('ask_person');
      expect(classifyIntent('他是谁')).toBe('ask_person');
    });
    it('问年龄意图', () => {
      expect(classifyIntent('你多大了')).toBe('ask_age');
      expect(classifyIntent('你几岁')).toBe('ask_age');
    });
    it('问背景意图', () => {
      expect(classifyIntent('说说你自己')).toBe('ask_background');
    });
    it('普通聊天', () => {
      expect(classifyIntent('今天天气真好')).toBe('chat');
    });
  });

  // ── 数据覆盖报告 ──
  describe('数据覆盖报告', () => {
    it('有年龄时缺失列表不含年龄', () => {
      const data = makeEmptyData({
        knownFields: { ...makeEmptyData().knownFields, hasAge: true },
      });
      const r = coverageReport(data);
      expect(r.missingFields).not.toContain('年龄');
    });

    it('无年龄时缺失列表包含年龄', () => {
      const data = makeEmptyData({
        knownFields: { ...makeEmptyData().knownFields, hasAge: false },
      });
      const r = coverageReport(data);
      expect(r.missingFields).toContain('年龄');
    });

    it('知道的人物在 knownPersons 中', () => {
      const data = makeEmptyData({
        context: { message: '徐诗雨', entities: ['徐诗雨'], kinshipTerms: [], pronounTarget: null, intent: 'ask_person' },
      });
      const r = coverageReport(data);
      expect(r.knownPersons).toContain('徐诗雨');
    });

    it('不知道的人在 unknownEntities 中', () => {
      const data = makeEmptyData({
        context: { message: '陈都灵', entities: ['陈都灵'], kinshipTerms: [], pronounTarget: null, intent: 'ask_person' },
        fg: { branch: null, treeText: '', rootProfile: null, familyMembers: [], familyProfiles: {} },
      });
      const r = coverageReport(data);
      expect(r.unknownEntities).toContain('陈都灵');
    });

    it('亲属称呼不进入 knownPersons', () => {
      const data = makeEmptyData({
        context: { message: '姐姐', entities: ['姐姐'], kinshipTerms: ['姐姐'], pronounTarget: null, intent: 'ask_relation' },
        fg: { branch: null, treeText: '', rootProfile: null, familyMembers: [], familyProfiles: {} },
      });
      const r = coverageReport(data);
      expect(r.knownPersons).not.toContain('姐姐');
    });
  });

  // ── 三阶生长 ──
  describe('三阶生长 ProfileManager', () => {
    it('临时建档', () => {
      clearAllTempProfiles();
      const p = getOrCreateTempProfile('测试角色');
      expect(p.name).toBe('测试角色');
      expect(p.stage).toBe('probation');
      expect(p.turnCount).toBe(0);
      clearAllTempProfiles();
    });

    it('信息点提取：年龄', () => {
      clearAllTempProfiles();
      const points = extractInfoPoints('诗韵', '诗韵才14岁', '', 1);
      expect(points.length).toBeGreaterThanOrEqual(1);
      expect(points[0].field).toBe('age');
      expect(points[0].value).toBe('14岁');
      clearAllTempProfiles();
    });

    it('更新档案增加轮次', () => {
      clearAllTempProfiles();
      const p = updateTempProfile('测试角色', '你好', '', 1);
      expect(p.turnCount).toBe(1);
      const p2 = updateTempProfile('测试角色', '今天天气好', '', 2);
      expect(p2.turnCount).toBe(2);
      clearAllTempProfiles();
    });
  });
});
