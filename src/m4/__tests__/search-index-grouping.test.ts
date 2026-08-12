/**
 * search-index-grouping.test.ts — S2-C1 search_index L1 按 source_type 分组取 top
 * ==============================================================================
 * 场景：term='熊梓铭' 命中 784 条，conversation 占 711(91%)。
 * 旧实现 `LIMIT 100` 无分组 → 100 条截断把 knowledge_base(19条)/black_diamond(21条) 全淹没。
 * 新实现逐源查询各取 top → 低频高价值源（知识库/黑钻）必然进入候选。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import { search } from '../UnifiedSearchEngine.js';

describe('UnifiedSearchEngine L1 分组取 top（S2-C1）', () => {
  let SQL: any;
  beforeAll(async () => { SQL = await initSqlJs(); });

  /** 构造库：convCount 条 conversation 含"熊梓铭" + kbCount 条 knowledge_base 含"熊梓铭"（同 term） */
  function buildDb(convCount: number, kbCount: number) {
    const db = new SQL.Database();
    db.run('CREATE TABLE conversations (id TEXT PRIMARY KEY, content TEXT, belong_entity_uuid TEXT)');
    db.run('CREATE TABLE knowledge_base (id TEXT PRIMARY KEY, title TEXT, content TEXT, belong_entity_uuid TEXT)');
    db.run('CREATE TABLE search_index (term TEXT, source_type TEXT, source_id TEXT, belong_entity_uuid TEXT, position INTEGER)');
    for (let i = 0; i < convCount; i++) {
      db.run('INSERT INTO conversations (id, content, belong_entity_uuid) VALUES (?, ?, ?)', [`c${i}`, `熊梓铭 的对话内容第 ${i} 条`, 'TXS-1']);
      db.run('INSERT INTO search_index (term, source_type, source_id, belong_entity_uuid, position) VALUES (?, ?, ?, ?, ?)', ['熊梓铭', 'conversation', `c${i}`, 'TXS-1', i]);
    }
    for (let i = 0; i < kbCount; i++) {
      db.run('INSERT INTO knowledge_base (id, title, content, belong_entity_uuid) VALUES (?, ?, ?, ?)', [`kb${i}`, `熊梓铭档案${i}`, '熊梓铭 的人物档案内容', 'TXS-1']);
      db.run('INSERT INTO search_index (term, source_type, source_id, belong_entity_uuid, position) VALUES (?, ?, ?, ?, ?)', ['熊梓铭', 'knowledge_base', `kb${i}`, 'TXS-1', i]);
    }
    return db;
  }

  it('conversation 大量命中时 knowledge_base 仍进入候选（旧 LIMIT 100 被淹没）', () => {
    const db = buildDb(100, 20);  // 100 conversation + 20 knowledge_base，同 term
    const r = search(db as any, '熊梓铭', null, {
      limit: 8,
      entityUuids: ['TXS-1'],
      includeKnowledgeBase: true,
    });
    expect(r.hitsBySource.knowledge_base).toBeGreaterThan(0);
  });

  it('knowledge_base 命中数返回完整（20 条全部进入候选）', () => {
    const db = buildDb(100, 20);
    const r = search(db as any, '熊梓铭', null, {
      limit: 50,
      entityUuids: ['TXS-1'],
      includeKnowledgeBase: true,
    });
    expect(r.hitsBySource.knowledge_base).toBe(20);
  });

  it('无知识库命中时返回空（不崩溃）', () => {
    const db = buildDb(5, 0);
    const r = search(db as any, '熊梓铭', null, {
      limit: 8,
      entityUuids: ['TXS-1'],
      includeKnowledgeBase: true,
    });
    expect(r.hitsBySource.knowledge_base ?? 0).toBe(0);
  });

  it('conversation 仍可正常召回（分组不影响主源）', () => {
    const db = buildDb(10, 3);
    const r = search(db as any, '熊梓铭', null, {
      limit: 8,
      entityUuids: ['TXS-1'],
      includeKnowledgeBase: true,
    });
    expect(r.hitsBySource.conversation).toBeGreaterThan(0);
  });
});
