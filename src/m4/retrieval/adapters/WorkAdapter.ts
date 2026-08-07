/**
 * WorkAdapter — 作品库存储域适配器（Foundation V1.0）
 * ====================================================
 * 作品库（works 表）长文/小说元数据召回。
 *
 * 逻辑对齐 MemoryRetriever.retrieveMultiRank 的 work 路（L633-679）：
 *   - 用关键词（实体名 + locus）LIKE 匹配 works.title/summary/full_text
 *   - 会晤场景仅实体自有作品（无归属 deny）；户主钥匙（entityUuids 空）全放行
 *
 * 与 ReferentResolver（指称词直查 work 主键）互补：此路服务普通查询关键词召回，
 * 指称解析仍在 retrieval-stage P0 段由 WorkRepository 执行。
 */

import type { RetrievalAdapter } from '../adapter.js';
import type { RetrievalContext, SearchHit } from '../types.js';

/** 作品行 */
export interface WorkRow {
  work_id: string;
  title: string;
  work_type: string;
  summary: string;
  full_text: string;
  belong_entity_uuid: string | null;
  created_at: string;
}

/** 数据源接口（兼容 SQLiteAdapter） */
export interface WorkSqlSource {
  queryAll<T = unknown>(sql: string, params?: unknown[]): T[];
}

export class WorkAdapter implements RetrievalAdapter {
  readonly domain = 'work' as const;
  readonly routes = ['work'] as const;

  constructor(private sqlite: WorkSqlSource) {}

  search(ctx: RetrievalContext): Promise<SearchHit[]> {
    const keywords = this._extractKeywords(ctx);
    if (keywords.length === 0) return Promise.resolve([]);
    try {
      const sqlite = this.sqlite;
      const likeClauses = keywords.map(() => '(title LIKE ? OR summary LIKE ? OR full_text LIKE ?)').join(' OR ');
      const params: unknown[] = [];
      for (const kw of keywords) params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
      const rows = sqlite.queryAll<WorkRow>(
        `SELECT work_id, title, work_type, summary, full_text, belong_entity_uuid, created_at
         FROM works WHERE ${likeClauses} ORDER BY created_at DESC LIMIT 5`,
        params,
      );

      const uuidSet = new Set(ctx.entityUuids);
      const hits: SearchHit[] = [];
      for (const row of rows) {
        const owner = row.belong_entity_uuid ?? null;
        // 会晤（entityUuids 非空）→ 仅白名单内实体作品放行（无归属 deny，杜绝泄漏）
        if (ctx.entityUuids.length > 0 && (!owner || !uuidSet.has(owner))) continue;
        const title = String(row.title || '');
        const summary = String(row.summary || '').substring(0, 120);
        const hitsCount = keywords.reduce(
          (acc, kw) => acc + (title.includes(kw) ? 1 : 0) + ((row.summary || '').includes(kw) ? 1 : 0),
          0,
        );
        hits.push({
          id: String(row.work_id),
          domain: 'work' as const,
          text: `《${title}》 ${summary}`.substring(0, 200),
          score: Math.max(1, hitsCount),
          route: 'work' as const,
          entityUuid: owner,
          calciumScore: 0,
          createdAt: String(row.created_at || ''),
          payload: { title, work_type: row.work_type, full_text: row.full_text },
          backref: { table: 'works', id: String(row.work_id) },
        });
      }
      return Promise.resolve(hits);
    } catch (e) {
      console.error('[WorkAdapter]', (e as Error)?.message);
      return Promise.resolve([]);
    }
  }

  /** 提取关键词：实体名 + locus 末段（对齐 retrieveMultiRank work 路） */
  private _extractKeywords(ctx: RetrievalContext): string[] {
    const kws = new Set<string>();
    // ctx 无 entities 参数 → 从 query 中取分词；补充 locus 末段
    for (const m of ctx.query.match(/[一-鿿]{2,4}/g) ?? []) kws.add(m);
    if (ctx.locusPath) {
      const last = ctx.locusPath.split('.').pop();
      if (last && last !== 'default' && last !== 'general') kws.add(last);
    }
    return [...kws].slice(0, 5).filter(kw => kw && kw.length > 1);
  }
}
