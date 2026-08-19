/**
 * UuidBackfillService — UUID 归属全量回填器 (V13)
 * ============================================================
 * 对 fusion_memory.db 中 belong_entity_uuid IS NULL 的历史记录做归属分类回填，
 * 消灭「无归属」数据，让检索（buildSqlClause deny-by-default）不再漏数据。
 *
 * 背景（S1）：
 *   - 非会晤模式 resolveOwnership 分级解析（entity_genes → 自称 → 显式指名）
 *     全失败返回 null → persistence-stage 写入 belong_entity_uuid=NULL。
 *   - 这类记录 = DNA 无 person 实体基因 + 文本无已知人名，主要是用户本人日常对话。
 *   - 实测 conversations 39% / memories 7% / black_diamond 53% / dream_logs 56% 无 UUID。
 *
 * 规则流水线（按优先级，纯规则零 LLM）：
 *   ① 垃圾判定 → DELETE（乱码/纯标点/无实体噪音/is_test/system namespace）
 *   ② 对话组传导：dialog_group_id 组内多数 UUID → 传导给组内无 UUID 轮次（"和谁对话就归谁"）
 *   ③ 显式人名匹配：内容含 FG 已知人名 → 归属该实体（复用 EntityOwnershipResolver）
 *   ④ 第一人称/个人事务 → 户主玉瑶 TXS-000000001
 *   ⑤ 无法判断 → 户主玉瑶 TXS-000000001 兜底
 *
 * 设计：
 *   - 纯函数 + 显式数据参数，无副作用；dry-run 只统计，execute 才写库（由 CLI 承担）
 *   - 幂等：只处理 belong_entity_uuid IS NULL / ''
 *   - 可审计：每次决策记录 rule 来源
 *   - knowledge_base 跳过（保留公共知识语义，用户决策）
 */

import { resolveOwnership, OWNER_UUID } from './EntityOwnershipResolver.js';

// 户主 UUID 单一真相源见 EntityOwnershipResolver.OWNER_UUID（此处 re-export 兼容）

/** 归属决策来源（可审计） */
export type OwnershipRule =
  | 'garbage'
  | 'group_conduct'
  | 'explicit_mention'
  | 'self_ref'
  | 'owner_fallback';

export interface BackfillDecision {
  rule: OwnershipRule;
  /** 归属 UUID；garbage 时为 null（待删除） */
  uuid: string | null;
  /** 关联实体名（group_conduct/explicit_mention 时） */
  entityName?: string;
}

export interface BackfillStats {
  total: number;
  byRule: Record<string, number>;
  garbageToDelete: number;
}

/** 待分类的无 UUID 记录行（由 CLI/调用方从各表提取） */
export interface UnownedRow {
  /** 主键 id（conversations 为数字，其余为 TEXT） */
  id: string | number;
  role?: 'user' | 'assistant' | string;
  content?: string | null;
  dialogGroupId?: string | null;
  isTest?: boolean | number;
  namespace?: string | null;
}

// ════════════════════════════════════════════════════
// ① 垃圾判定
// ════════════════════════════════════════════════════

const SYSTEM_NAMESPACES = new Set(['system', 'test', 'debug', 'internal']);
const GARBAGE_CHAR_RATIO = 0.6; // 非可读字符占比 > 60% → 乱码
/** emoji/符号 计入可读字符（H3 加固：防误删"哈哈😂""好的👍"） */
const READABLE_RE = /[一-龥A-Za-z0-9\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

/** 判定内容是否为垃圾（乱码/纯标点/系统测试/无实体噪音） */
export function isGarbage(
  text: string,
  meta?: { isTest?: boolean | number; namespace?: string | null },
): boolean {
  if (meta?.isTest) return true;
  if (meta?.namespace && SYSTEM_NAMESPACES.has(String(meta.namespace))) return true;
  if (!text) return true;
  const t = String(text).trim();
  if (t.length < 2) return true;
  // 有效字符：中文/英文/数字/emoji（UTF-16 按 code unit 计数，emoji 占 2 但与 .length 一致）
  const readable = (t.match(READABLE_RE) || []).length;
  if (readable / t.length < GARBAGE_CHAR_RATIO) return true; // 乱码
  // 纯标点 / 无实义词（纯数字如"666"保留，非垃圾）
  if (!/[一-龥A-Za-z0-9]/.test(t)) return true;
  return false;
}

// ════════════════════════════════════════════════════
// ② 对话组传导
// ════════════════════════════════════════════════════

export interface GroupOwnershipRow {
  dialog_group_id: string;
  belong_entity_uuid: string;
  c: number;
}

/**
 * 构建对话组归属映射：dialog_group_id → 组内计数最多的 belong_entity_uuid。
 * 输入来自 `SELECT dialog_group_id, belong_entity_uuid, COUNT(*) c ... GROUP BY`。
 */
export function buildGroupOwnershipMap(rows: GroupOwnershipRow[]): Map<string, string> {
  const best = new Map<string, { uuid: string; c: number }>();
  for (const row of rows) {
    if (!row?.dialog_group_id || !row?.belong_entity_uuid) continue;
    const cur = best.get(row.dialog_group_id);
    if (!cur || row.c > cur.c) best.set(row.dialog_group_id, { uuid: row.belong_entity_uuid, c: row.c });
  }
  return new Map([...best].map(([k, v]) => [k, v.uuid]));
}

// ════════════════════════════════════════════════════
// 主分类
// ════════════════════════════════════════════════════

export interface FgReader {
  getAllPersonNames?(): string[];
  getUUIDByName?(name: string): string | null;
}

export interface ClassifyOptions {
  role?: 'user' | 'assistant';
  dialogGroupId?: string | null;
  groupMap?: Map<string, string>;
  fg?: FgReader;
  isTest?: boolean | number;
  namespace?: string | null;
}

/**
 * 全名 → 简称候选（对话用"诗雨"而档案是"徐诗雨"）。
 * 3 字名（姓+2字名）→ 去姓简称；2 字名 → 自身。
 */
export function nameCandidates(name: string): string[] {
  const cands = [name];
  if (name.length === 3) {
    const short = name.slice(1); // 徐诗雨 → 诗雨
    if (short.length >= 2) cands.push(short);
  }
  return cands;
}

/** 对一条无 UUID 记录做归属决策（纯函数） */
export function classifyRecord(
  text: string,
  opts: ClassifyOptions = {},
): BackfillDecision {
  // ① 垃圾判定
  if (isGarbage(text, { isTest: opts.isTest, namespace: opts.namespace })) {
    return { rule: 'garbage', uuid: null };
  }

  // ② 对话组传导（"和谁对话就归谁"）
  if (opts.dialogGroupId && opts.groupMap?.has(opts.dialogGroupId)) {
    return { rule: 'group_conduct', uuid: opts.groupMap.get(opts.dialogGroupId)! };
  }

  // ③ 显式人名匹配 / 助手自称（复用 EntityOwnershipResolver 三级解析：全名/自称/显式指名）
  if (opts.fg?.getAllPersonNames && opts.fg?.getUUIDByName) {
    const result = resolveOwnership(text, [], opts.fg as any, opts.role ?? 'user');
    if (result.uuid) {
      const rule: OwnershipRule = result.src === 'self_ref' ? 'self_ref' : 'explicit_mention';
      return { rule, uuid: result.uuid, entityName: result.entityName };
    }

    // ③b 简称匹配：resolveOwnership 只做 includes(全名)，对话常用去姓简称（"诗雨"vs"徐诗雨"）
    try {
      const allNames = opts.fg.getAllPersonNames();
      for (const name of allNames) {
        if (!name || name.length < 2) continue;
        for (const cand of nameCandidates(name)) {
          if (cand.length >= 2 && text.includes(cand)) {
            const uuid = opts.fg.getUUIDByName(name);
            if (uuid) return { rule: 'explicit_mention', uuid, entityName: name };
          }
        }
      }
    } catch { /* fall through */ }
  }

  // ④⑤ 第一人称 / 无法判断 → 户主玉瑶兜底
  return { rule: 'owner_fallback', uuid: OWNER_UUID };
}

export interface RowResult {
  id: string | number;
  decision: BackfillDecision;
}

/**
 * 扫描无 UUID 记录并做归属决策（纯计算，不写库）。
 * 供 CLI dry-run 与 execute 共用。
 */
export function analyzeUnowned(
  rows: UnownedRow[],
  groupMap: Map<string, string>,
  fg?: FgReader,
): { results: RowResult[]; stats: BackfillStats } {
  const stats: BackfillStats = { total: rows.length, byRule: {}, garbageToDelete: 0 };
  const results: RowResult[] = [];
  for (const row of rows) {
    const decision = classifyRecord(row.content ?? '', {
      role: (row.role as 'user' | 'assistant') || 'user',
      dialogGroupId: row.dialogGroupId,
      groupMap,
      fg,
      isTest: row.isTest,
      namespace: row.namespace,
    });
    results.push({ id: row.id, decision });
    stats.byRule[decision.rule] = (stats.byRule[decision.rule] || 0) + 1;
    if (decision.rule === 'garbage') stats.garbageToDelete++;
  }
  return { results, stats };
}

export default {
  OWNER_UUID,
  isGarbage,
  buildGroupOwnershipMap,
  classifyRecord,
  analyzeUnowned,
};
