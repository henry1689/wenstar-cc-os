/**
 * KnowledgeAdapter — 知识库存储域适配器（Foundation V1.0）
 * =========================================================
 * 包装 `ctx.knowledgeBase.search`（KnowledgeEngine.search，FTS5 BM25 + Zvec 向量 + RRF）。
 *
 * 过滤语义（filterMode='allow-common'）：
 *   知识库是"半开"语义（对齐 retrieval-stage L585-590 现有行为）：
 *     - 无归属（通用知识）→ 放行（用户既定：公用知识可根据聊天内容提取使用）
 *     - 有归属（当事人知识）→ 必须在白名单内（UUID 法 deny-by-default）
 *   兜底在 runAdapter 由 policeFilterHits('allow-common') 统一执行。
 */

import type { RetrievalAdapter } from '../adapter.js';
import type { RetrievalContext, SearchHit } from '../types.js';

/** KnowledgeItem 最小形状（含 V13 回读的 belong_entity_uuid） */
export interface KnowledgeItemLike {
  id: string;
  title: string;
  content: string;
  created_at?: string;
  belong_entity_uuid?: string | null;
}

/** 知识库数据源接口（兼容 KnowledgeBase.search 签名） */
export interface KnowledgeSource {
  search(
    keyword: string,
    limit?: number,
    emotionalContext?: { pleasure: number; arousal: number; intimacy: number },
    interactionType?: string,
    belongEntityUuid?: string,
  ): Promise<KnowledgeItemLike[]>;
}

/** KnowledgeAdapter 构造依赖 */
export interface KnowledgeAdapterDeps {
  /** 知识库数据源（ctx.knowledgeBase） */
  knowledgeBase: KnowledgeSource;
}

export class KnowledgeAdapter implements RetrievalAdapter {
  readonly domain = 'knowledge' as const;
  readonly routes = ['knowledge'] as const;
  readonly filterMode = 'allow-common' as const;

  constructor(private deps: KnowledgeAdapterDeps) {}

  async search(ctx: RetrievalContext): Promise<SearchHit[]> {
    const query = ctx.query.trim();
    if (query.length < 2) return [];
    try {
      // 不传 belongEntityUuid → 引擎层返回全部（含通用），实体过滤由 filterMode='allow-common' 兜底
      const limit = ctx.limit ?? 5;
      const items = await this.deps.knowledgeBase.search(query, limit);
      return items.map((item) => ({
        id: String(item.id),
        domain: 'knowledge' as const,
        text: ((item.title ?? '') + ': ' + (item.content ?? '')).substring(0, 200),
        score: 1.0, // KB 路无路内排名分 → 统一 1.0（RRF 只看排名，融合前按返回顺序排列）
        route: 'knowledge' as const,
        entityUuid: item.belong_entity_uuid ?? null,
        createdAt: item.created_at ?? '',
        backref: { table: 'knowledge_base', id: String(item.id) },
      }));
    } catch (e) {
      console.error('[KnowledgeAdapter]', (e as Error)?.message);
      return [];
    }
  }
}
