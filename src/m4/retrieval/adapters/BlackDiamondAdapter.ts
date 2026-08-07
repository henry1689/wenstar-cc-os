/**
 * BlackDiamondAdapter — 黑钻库存储域适配器（Foundation V1.0）
 * ===========================================================
 * 黑钻库（black_diamond 表）固化记忆检索。
 *
 * 设计说明（为何不用 VaultManager.searchBlackDiamonds）：
 *   VaultManager.rowToBlackDiamond（src/app/vault/VaultManager.ts L656-668）映射时
 *   **丢弃了 belong_entity_uuid 列** → 无法做实体隔离。本适配器直接 SQL（对齐其
 *   emotion_tag 精确命中 + summary/tags LIKE 兜底逻辑），SELECT 全列保留 UUID。
 *
 * 收编痛点：searchBlackDiamonds 原本未接 UUIDPoliceFilter。本适配器查询层用
 *   buildSqlClause 收编（deny-by-default），runAdapter 再兜底。
 */

import type { RetrievalAdapter } from '../adapter.js';
import type { RetrievalContext, SearchHit } from '../types.js';
import { buildSqlClause } from '../../../governance/police/UUIDPoliceFilter.js';

/** 黑钻行（SQL 全列，含 belong_entity_uuid） */
export interface BlackDiamondRow {
  id: string;
  summary: string;
  emotion_tag: string | null;
  source_id: string | null;
  calcium_level: number;
  created_at: string;
  belong_entity_uuid?: string | null;
}

/** 数据源接口（兼容 SQLiteAdapter） */
export interface BlackDiamondSqlSource {
  queryAll<T = unknown>(sql: string, params?: unknown[]): T[];
}

export class BlackDiamondAdapter implements RetrievalAdapter {
  readonly domain = 'black_diamond' as const;
  readonly routes = ['diamond'] as const;

  constructor(private sqlite: BlackDiamondSqlSource) {}

  search(ctx: RetrievalContext): Promise<SearchHit[]> {
    const query = ctx.query.trim();
    if (query.length < 2) return Promise.resolve([]);
    try {
      const limit = ctx.limit ?? 5;
      // 查询层收编 police：直接用 ctx.policy（enforce:false 户主最高权限 → 无过滤；
      // 会晤白名单 → belong_entity_uuid IN (...)；户主有白名单 → IN + OR IS NULL），deny-by-default
      const police = buildSqlClause(ctx.policy);
      const rows = this.sqlite.queryAll<BlackDiamondRow>(
        `SELECT id, summary, emotion_tag, source_id, calcium_level, created_at, belong_entity_uuid
         FROM black_diamond
         WHERE (summary LIKE ? OR emotion_tag LIKE ? OR tags LIKE ?)${police.clause}
         ORDER BY created_at DESC LIMIT ?`,
        [`%${query}%`, `%${query}%`, `%${query}%`, ...police.params, limit],
      );

      const hits: SearchHit[] = rows.map((r) => ({
        id: String(r.id),
        domain: 'black_diamond' as const,
        text: (r.summary || '').substring(0, 200),
        score: r.calcium_level ?? 1,
        route: 'diamond' as const,
        entityUuid: r.belong_entity_uuid ?? null,
        calciumScore: r.calcium_level ?? 0,
        calciumLevel: r.calcium_level ?? 0,
        createdAt: r.created_at ?? '',
        payload: { emotion_tag: r.emotion_tag, source_id: r.source_id },
        backref: { table: 'black_diamond', id: String(r.id) },
      }));
      return Promise.resolve(hits);
    } catch (e) {
      console.error('[BlackDiamondAdapter]', (e as Error)?.message);
      return Promise.resolve([]);
    }
  }
}
