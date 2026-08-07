/**
 * NoteAdapter — 玉瑶记事存储域适配器（Foundation V1.0）
 * ======================================================
 * 玉瑶记事（memories 表 memory_type='note'，如物品位置/事实/提醒/人物标签）。
 *
 * 收编痛点：YuyaoMemoryService.search 原本未接 UUIDPoliceFilter（memories 表有
 *   belong_entity_uuid 列）。本适配器直接 SQL（对齐其 LIKE 匹配逻辑），查询层带
 *   buildSqlClause 收编（deny-by-default）。
 */

import type { RetrievalAdapter } from '../adapter.js';
import type { RetrievalContext, SearchHit } from '../types.js';
import { buildSqlClause } from '../../../governance/police/UUIDPoliceFilter.js';

/** 记事行 */
export interface NoteRow {
  id: string;
  raw_input: string;
  sub_type: string;
  created_at: string;
  belong_entity_uuid?: string | null;
}

/** 数据源接口（兼容 SQLiteAdapter） */
export interface NoteSqlSource {
  queryAll<T = unknown>(sql: string, params?: unknown[]): T[];
}

export class NoteAdapter implements RetrievalAdapter {
  readonly domain = 'note' as const;
  readonly routes = ['note'] as const;

  constructor(private sqlite: NoteSqlSource) {}

  search(ctx: RetrievalContext): Promise<SearchHit[]> {
    const query = ctx.query.trim();
    if (query.length < 2) return Promise.resolve([]);
    try {
      const sqlite = this.sqlite;
      // 查询层收编 police：直接用 ctx.policy（enforce:false 户主最高权限 → 无过滤；
      // 会晤白名单 → belong_entity_uuid IN (...)；户主有白名单 → IN + OR IS NULL），deny-by-default
      const police = buildSqlClause(ctx.policy);
      const limit = ctx.limit ?? 3;
      // S4-评审修复: 补 is_valid=1 — 对齐 YuyaoMemoryService.search（作废/被覆盖的记事不得泄漏）
      const rows = sqlite.queryAll<NoteRow>(
        `SELECT id, raw_input, sub_type, created_at, belong_entity_uuid
         FROM memories
         WHERE memory_type='note' AND is_valid=1 AND (raw_input LIKE ? OR note_key LIKE ?)${police.clause}
         ORDER BY created_at DESC LIMIT ?`,
        [`%${query}%`, `%${query}%`, ...police.params, limit],
      );

      const hits: SearchHit[] = rows.map((r) => ({
        id: String(r.id),
        domain: 'note' as const,
        text: (r.raw_input || '').substring(0, 150),
        score: 1.0,
        route: 'note' as const,
        entityUuid: r.belong_entity_uuid ?? null,
        createdAt: r.created_at ?? '',
        payload: { sub_type: r.sub_type },
        backref: { table: 'memories', id: String(r.id) },
      }));
      return Promise.resolve(hits);
    } catch (e) {
      console.error('[NoteAdapter]', (e as Error)?.message);
      return Promise.resolve([]);
    }
  }
}
