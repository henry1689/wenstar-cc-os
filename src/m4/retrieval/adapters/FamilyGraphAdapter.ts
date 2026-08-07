/**
 * FamilyGraphAdapter — FG 家族图谱存储域适配器（Foundation V1.0）
 * ==============================================================
 * FG 人物档案/关系检索（只读）。
 *
 * ⚠️ 默认不注册：FG 检索已由 EntityContextBuilder / MeetingContextPipeline 覆盖，
 *   独立接入需谨慎。供未来 SearchOrchestrator 显式启用。
 *
 * FG 红线合规：只调用只读方法（getPersonProfile / searchPersonWithMemories），
 *   零 FG 写入、零角色分支访问，不触碰 11 条红线。
 */

import type { RetrievalAdapter } from '../adapter.js';
import type { RetrievalContext, SearchHit } from '../types.js';

/** FG 数据源最小接口 */
export interface FamilyGraphSource {
  /** 按名称查人物档案 + 关系 */
  searchPersonWithMemories?(personName: string): {
    profile: { name?: string; bio?: string; relation_to_user?: string } | null;
    relations: Array<{ name: string; relation: string }>;
  };
  /** 名称 → UUID（归属隔离） */
  getUUIDByName?(name: string): string | null;
}

export class FamilyGraphAdapter implements RetrievalAdapter {
  readonly domain = 'family_graph' as const;
  readonly routes = ['profile'] as const;
  // FG 节点无 belong 列，uuid 即户籍 → 兜底按 entityUuid（= FG uuid）走 policePasses
  readonly filterMode = 'deny' as const;

  constructor(private fg: FamilyGraphSource) {}

  search(ctx: RetrievalContext): Promise<SearchHit[]> {
    // 从 query 提取疑似人名（2-4 字），尝试查 FG 档案
    const candidates = new Set<string>();
    for (const m of ctx.query.match(/[一-鿿]{2,4}/g) ?? []) {
      candidates.add(m);
    }
    // 活跃实体名优先
    for (const e of ctx.entities ?? []) {
      if (e.type === 'person' && e.name) candidates.add(e.name);
    }

    if (candidates.size === 0) return Promise.resolve([]);

    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    for (const name of [...candidates].slice(0, 3)) {
      if (seen.has(name)) continue;
      seen.add(name);
      try {
        const res = this.fg.searchPersonWithMemories?.(name);
        if (!res?.profile?.name) continue;
        const profile = res.profile;
        const relText = (res.relations ?? [])
          .slice(0, 5)
          .map(r => `${r.name}(${r.relation})`)
          .join('、');
        const text = `${profile.name}: ${profile.bio || '暂无简介'}${relText ? ' | 关系: ' + relText : ''}`;
        const uuid = this.fg.getUUIDByName?.(name) ?? null;
        hits.push({
          id: uuid ?? name,
          domain: 'family_graph' as const,
          text: text.substring(0, 200),
          score: 1.0,
          route: 'profile' as const,
          entityUuid: uuid,
          createdAt: '',
          payload: { name: profile.name, relation_to_user: profile.relation_to_user },
          // FG 无归属表 → 不设 backref（backfillBackrefs 对 family_graph 跳过）
        });
      } catch (e) {
        console.error(`[FamilyGraphAdapter] ${name}`, (e as Error)?.message);
      }
    }
    return Promise.resolve(hits);
  }
}
