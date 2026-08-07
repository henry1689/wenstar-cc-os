import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { FamilyGraph } from '../household/FamilyGraph.js';
import { buildEntityContext } from '../household/EntityContextBuilder.js';

const TEST_DB = join(__dirname, '.test-entity-context.db');

describe('EntityContextBuilder — 家人年龄注入', () => {
  let graph: FamilyGraph;

  beforeEach(async () => {
    graph = new FamilyGraph(TEST_DB);
    await graph.initialize();
    // 建熊家三节点 + 姐妹边
    await graph.addNode({ id: 'zm', type: 'person', name: '熊梓铭' } as any);
    await graph.addNode({ id: 'zy', type: 'person', name: '熊梓玥' } as any);
    await graph.updatePersonProfile('熊梓铭', { birthYear: 2008, gender: 'female' } as any);
    // 模拟熊梓玥数据漂移: 顶层 female / dossier 未知，dossier 有 birthYear + 职业
    await graph.updatePersonProfile('熊梓玥', { birthYear: 2018, gender: 'female' } as any);
    await graph.setDossierField('熊梓玥', 'basicInfo.gender', '未知');
    await graph.setDossierField('熊梓玥', 'socialIdentity.currentOccupation', '学生');
    await graph.addEdge({ source_id: 'zm', target_id: 'zy', relation: 'elder_sister_of' } as any);
  });

  afterEach(() => {
    try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
  });

  it('家人区块注入 (性别, N岁, 职业)', () => {
    const result = buildEntityContext(graph, { entityName: '熊梓铭' });
    expect(result.systemText).toContain('熊梓玥');
    // 归一化 gender: '未知' 过滤 → 顶层 female 兜底 → '女'
    expect(result.systemText).toContain('女');
    // 实时年龄: 2026 - 2018 = 8
    expect(result.systemText).toContain('8岁');
    // dossier.socialIdentity 职业
    expect(result.systemText).toContain('学生');
  });

  it('无 birthYear 的家人不编造年龄', async () => {
    await graph.addNode({ id: 'w2', type: 'person', name: '熊二' } as any);
    await graph.addEdge({ source_id: 'zm', target_id: 'w2', relation: 'younger_brother_of' } as any);
    const result = buildEntityContext(graph, { entityName: '熊梓铭' });
    // 熊二 无 birthYear → 不输出年龄数字，但保留关系标签（哥哥）
    expect(result.systemText).toContain('熊二（哥哥）');
    // 🔴 不编造：熊二区块不含"岁"（没有任何年龄）
    const siblingLine = result.systemText.split('\n').find(l => l.includes('兄弟姐妹'));
    expect(siblingLine).toContain('熊二（哥哥）');
    // 只有熊梓玥有年龄（8岁），熊二没有 → 不出现"熊二"后紧跟岁数
    expect(siblingLine).not.toMatch(/熊二[^）]*\d+岁/);
  });

  it('parents 分支归一化性别：顶层 female / dossier 未知 → 进母亲栏', async () => {
    await graph.addNode({ id: 'xy', type: 'person', name: '熊妈' } as any);
    // 顶层 gender=female（updatePersonProfile 写顶层），dossier 未知（setDossierField 写 dossier）
    await graph.updatePersonProfile('熊妈', { birthYear: 1979, gender: 'female' } as any);
    await graph.setDossierField('熊妈', 'basicInfo.gender', '未知');
    // 熊梓铭 → child_of → 熊妈（熊梓铭是熊妈的孩子）
    await graph.addEdge({ source_id: 'zm', target_id: 'xy', relation: 'child_of' } as any);
    const result = buildEntityContext(graph, { entityName: '熊梓铭' });
    // 归一化后 gender='女' → 应进"母亲"栏而非"父亲"
    expect(result.systemText).toContain('母亲：熊妈');
    expect(result.systemText).not.toContain('父亲：熊妈');
  });
});
