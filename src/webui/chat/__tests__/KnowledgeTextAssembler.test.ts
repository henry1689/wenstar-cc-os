import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { FamilyGraph } from '../../../m4/household/FamilyGraph.js';
import { KnowledgeTextAssembler } from '../KnowledgeTextAssembler.js';

const TEST_DB = join(__dirname, '.test-kta.db');

describe('KnowledgeTextAssembler — withEntityProfiles 年龄注入', () => {
  let graph: FamilyGraph;

  beforeEach(async () => {
    graph = new FamilyGraph(TEST_DB);
    await graph.initialize();
    // 熊梓玥: 顶层 birthYear + dossier 职业（模拟 dossier 优先场景）
    await graph.addNode({ id: 'zy', type: 'person', name: '熊梓玥' } as any);
    await graph.updatePersonProfile('熊梓玥', { birthYear: 2018, relation_to_user: '熊勇的小女儿' } as any);
    await graph.setDossierField('熊梓玥', 'socialIdentity.currentOccupation', '学生');
  });

  afterEach(() => {
    try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
  });

  it('输出 2018年生 + N岁（修复读顶层 basicInfo 的失效路径）', () => {
    const text = new KnowledgeTextAssembler()
      .withEntityProfiles(graph, ['熊梓玥'])
      .build();
    expect(text).toContain('【关于熊梓玥】');
    expect(text).toContain('2018年生');
    expect(text).toContain(`${new Date().getFullYear() - 2018}岁`);
  });

  it('空名字列表 → 不注入', () => {
    const text = new KnowledgeTextAssembler().withEntityProfiles(graph, []).build();
    expect(text).toBe('');
  });
});
