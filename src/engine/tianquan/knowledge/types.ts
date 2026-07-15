/**
 * Knowledge Index Domain 类型定义 — 知识索引摘要层
 * ==================================================
 * 轻量索引摘要层：只存摘要，不存完整内容。
 * 完整知识库仍在 src/app/knowledge/。
 *
 * 定位（用户确认）:
 *   知识库是"第二大脑"，双重身份 —
 *     ① 用户日常工作和生活需要
 *     ② AI 玉瑶自培训 + 理解用户
 *   tianquan/knowledge/ 只放摘要索引，不放完整知识库。
 *
 * Ref: WS-TIANQUAN-BIONIC-001 §第二部分 §3
 */

// ─── 知识索引条目 ───

export interface KnowledgeIndexEntry {
  /** 索引唯一 ID（自动生成: idx_{sourceId}） */
  indexId: string;
  /** 来源知识库条目 ID */
  sourceId: string;
  /** 摘要（≤100 chars） */
  summary: string;
  /** 关键词标签（≤5 个） */
  tags: string[];
  /** 关联场景标签 */
  sceneTags: string[];
  /** 情感关联（JSON 字符串，存储 pleasure/intimacy/arousal 等关键维度） */
  emotionSignature?: string;
  /** 印象值 [0, 1] — 越高越优先引用 */
  impressionScore: number;
  /** 知识分类 */
  interactionType: string;
  /** 最后访问时间 ISO 8601 */
  lastAccessedAt: string;
  /** 创建时间 ISO 8601 */
  createdAt: string;
}

// ─── 知识摘要请求 ───

export interface KnowledgeSummaryRequest {
  sourceIds: string[];
  reason: 'auto_sync' | 'user_query' | 'periodic_maintenance';
}

// ─── 知识桥接结果 ───

export interface KnowledgeBridgeResult {
  entries: KnowledgeIndexEntry[];
  totalHits: number;
  queryTimeMs: number;
}

// ─── 知识统计 ───

export interface KnowledgeIndexStats {
  totalIndexes: number;
  avgImpressionScore: number;
  lastFullSyncAt: string | null;
  pendingUpdates: number;
}


// ─── V4.0 第二大脑类型 ───

/** MD 文件清单条目 */
export interface MDFileManifest {
  uuid: string;
  path: string;
  title: string;
  type: 'entity' | 'topic' | 'relation' | 'insight' | 'daily' | 'unknown';
  tags: string[];
  aliases: string[];
  sha256: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  lastIndexedAt?: string;
  indexStatus: 'current' | 'pending' | 'outdated';
  sourceType: 'conversation' | 'upload' | 'inference' | 'manual';
  confidence: 'high' | 'medium' | 'low' | 'uncertain';
  claimType: 'stated' | 'inferred' | 'observed' | 'ambiguous';
  wikilinks: string[];
}

/** Wiki 条目（解析后的 MD 文件内容） */
export interface WikiEntry {
  manifest: MDFileManifest;
  summary: string;
  content: string;
  relations: Array<{ target: string; type: string }>;
  backlinks: string[];
}

/** 同步报告 */
export interface SyncReport {
  timestamp: string;
  totalScanned: number;
  changed: number;
  newFiles: number;
  deletedFiles: number;
  summariesGenerated: number;
  embeddingsGenerated: number;
  goldEntriesCreated: number;
  cascadeCleared: number;
  errors: string[];
}

/** MD源文件→记忆条目溯源记录 */
export interface SourceTrackingRecord {
  id: string;
  sourcePath: string;
  sourceUuid: string;
  sourceHash: string;
  memoryId: string;
  syncedAt: string;
  status: 'active' | 'expired' | 'orphaned';
}
