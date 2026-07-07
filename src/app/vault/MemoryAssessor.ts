/**
 * MemoryAssessor — 三库自动流转调度器
 *
 * v2: 所有硬编码阈值/周期从 MemoryConfig 读取。
 *     新增幂等校验，防止重复晋升。
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import type { EntityGene } from '../../m1/types/dna.js';
import type { Perception24D } from '../../m3/types/perception.js';
import type { EmotionalMemoryRecord } from '../../m2/types/index.js';
import { initialStrength } from '../../m2/math.js';
import { autoPromoteCandidatesV2, logVaultOperation } from './VaultManager.js';
import { MEMORY_CONFIG } from '../../config/MemoryConfig.js';

const NEUTRAL_PERCEPTION: Perception24D = {
  pleasure: 0,
  arousal: 0,
  dominance: 0,
  aggression: 0,
  sincerity: 0.5,
  humor: 0,
  factual: 0.5,
  logical: 0.5,
  certainty: 0.5,
  abstract: 0,
  temporal_focus: 0,
  self_ref: 0.5,
  intimacy: 0,
  power_diff: 0,
  dependency: 0,
  moral_judgment: 0,
  etiquette: 0.5,
  belonging: 0,
  sexual_attraction: 0,
  sensory_craving: 0,
  energy_merge: 0,
  possessiveness: 0,
  ecstasy: 0,
  safety: 0.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeTopicTag(topic: unknown): string | undefined {
  if (typeof topic !== 'string') return undefined;
  const normalized = topic.trim().replace(/\s+/g, '_').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  return normalized ? normalized.slice(0, 48) : undefined;
}

function parseConversationEntities(raw: unknown): EntityGene[] {
  const materialize = (name: string, type: EntityGene['type'] = 'person'): EntityGene => ({
    name,
    type,
    allele: name,
    phenotype: 'neutral',
    knowledge_type: 'private',
  });

  if (typeof raw !== 'string' || raw.trim().length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') {
            const name = item.trim();
            return name ? materialize(name) : null;
          }
          if (item && typeof item === 'object' && typeof item.name === 'string') {
            const name = item.name.trim();
            if (!name) return null;
            return {
              name,
              type: item.type ?? 'person',
              allele: item.allele ?? name,
              phenotype: item.phenotype ?? 'neutral',
              knowledge_type: item.knowledge_type ?? 'private',
            } as EntityGene;
          }
          return null;
        })
        .filter((item): item is EntityGene => Boolean(item));
    }
  } catch { /* fallback to csv */ }

  return raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => materialize(name));
}

function parseSandPerception(raw: unknown): Perception24D {
  if (typeof raw !== 'string' || raw.trim().length === 0) return { ...NEUTRAL_PERCEPTION };

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 24 && parsed.every((item) => typeof item === 'number')) {
      return {
        pleasure: parsed[0], arousal: parsed[1], dominance: parsed[2], aggression: parsed[3],
        sincerity: parsed[4], humor: parsed[5], factual: parsed[6], logical: parsed[7],
        certainty: parsed[8], abstract: parsed[9], temporal_focus: parsed[10], self_ref: parsed[11],
        intimacy: parsed[12], power_diff: parsed[13], dependency: parsed[14], moral_judgment: parsed[15],
        etiquette: parsed[16], belonging: parsed[17], sexual_attraction: parsed[18], sensory_craving: parsed[19],
        energy_merge: parsed[20], possessiveness: parsed[21], ecstasy: parsed[22], safety: parsed[23],
      };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        ...NEUTRAL_PERCEPTION,
        pleasure: clamp(Number(parsed.pleasure ?? 0), -1, 1),
        arousal: clamp(Number(parsed.arousal ?? 0), 0, 1),
        intimacy: clamp(Number(parsed.intimacy ?? 0), 0, 1),
      };
    }
  } catch { /* use neutral defaults */ }

  return { ...NEUTRAL_PERCEPTION };
}

function deriveNarrativeTag(text: string, topic: unknown): string | undefined {
  const topicTag = normalizeTopicTag(topic);
  if (topicTag) return topicTag;
  if (/工作|项目|客户|会议|公司|合同|研发|采购/.test(text)) return '工作';
  if (/妈妈|爸爸|家人|老婆|老公|女友|男友|朋友/.test(text)) return '关系';
  if (/记得|回忆|以前|过去|小时候/.test(text)) return '回忆';
  return undefined;
}

function derivePrimaryEmotion(perception: Perception24D): string {
  if (perception.intimacy >= 0.45) return '亲密';
  if (perception.pleasure >= 0.35) return '快乐';
  if (perception.pleasure <= -0.35) return '失落';
  if (perception.arousal >= 0.65) return '激动';
  if (perception.factual >= 0.7) return '事实';
  return '中性';
}

export class MemoryAssessor {
  private storage: FusionStorageAdapter;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private started = false;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    console.log('[MemoryAssessor] 启动三库流转调度器');

    this.schedule('sandToGold', MEMORY_CONFIG.sandToGold.intervalMs, () => this.runSandToGold());
    this.schedule('goldToDiamond', MEMORY_CONFIG.goldToDiamond.intervalMs, () => this.runGoldToDiamond());
    this.schedule('decay', MEMORY_CONFIG.decay.intervalMs, () => this.runDecay());
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.started = false;
  }

  private schedule(name: string, interval: number, fn: () => Promise<void>): void {
    const tick = () => {
      fn().catch(err => console.warn(`[MemoryAssessor] ${name} 失败:`, err));
      this.timers.push(setTimeout(tick, interval));
    };
    this.timers.push(setTimeout(tick, Math.random() * 60000 + 5000));
  }

  // ── ① 砂金库→金库 ──

  private async runSandToGold(): Promise<void> {
    const cfg = MEMORY_CONFIG.sandToGold;
    let txOpened = false;
    try {
      const sqlite = this.storage.getSQLite();
      const recentConvs = sqlite.queryAll(
        `SELECT id, role, content, calcium_score, entity_names, dna_root_id, timestamp,
                perception_summary, topic, seq_pos, dialog_group_id, namespace
         FROM conversations
         WHERE is_promoted = 0 AND calcium_score >= ?
         ORDER BY calcium_score DESC LIMIT ?`,
        [cfg.minCalciumScore, cfg.batchSize]
      ) as any[];

      if (recentConvs.length === 0) {
        console.log('[MemoryAssessor] 砂金→金库: 无待晋升数据');
        return;
      }

      let promoted = 0;
      let nextSeq = Number((sqlite.queryAll('SELECT COALESCE(MAX(seq_pos), 0) as max_seq FROM memories') as any[])?.[0]?.max_seq ?? 0) + 1;
      sqlite.writeRaw('BEGIN');
      txOpened = true;

      for (const conv of recentConvs) {
        if (conv.role !== 'user') continue;
        const text = (conv.content || '') as string;
        if (text.length < cfg.minContentLength) continue;

        const conversationId = Number(conv.id ?? 0);
        const dnaRootId = String(conv.dna_root_id || `sand_fallback_${conversationId || Date.now()}`);
        const calciumScore = Number(conv.calcium_score || 1.0);
        const memoryId = `mem_${dnaRootId.replace(/[^\w-]/g, '_')}_${conversationId || nextSeq}`;
        const perception = parseSandPerception(conv.perception_summary);
        const calciumLevel = clamp(Math.floor(calciumScore), 0, 3) as 0 | 1 | 2 | 3;
        const normalizedCalcium = clamp(calciumScore / MEMORY_CONFIG.recall.calciumMax, 0, 1);
        const narrativeTag = deriveNarrativeTag(text, conv.topic);
        const entityGenes = parseConversationEntities(conv.entity_names);
        const now = new Date().toISOString();
        const record: EmotionalMemoryRecord = {
          id: memoryId,
          seq_pos: nextSeq,
          created_at: String(conv.timestamp || now),
          dna_root_id: dnaRootId,
          thread_id: String(conv.dialog_group_id || dnaRootId || memoryId),
          session_id: null as any,
          dialog_group_id: conv.dialog_group_id ? String(conv.dialog_group_id) : undefined,
          source_conversation_ids: conversationId > 0 ? [conversationId] : [],
          perception,
          calcium_score: clamp(calciumScore, MEMORY_CONFIG.recall.calciumMin, MEMORY_CONFIG.recall.calciumMax),
          calcium_level: calciumLevel,
          raw_input: text.substring(0, 500),
          locus_path: narrativeTag ? `chat.promoted.${narrativeTag}` : 'chat.promoted',
          entity_genes: entityGenes,
          leaf_zone: 'spatiotemporal_episode_zone',
          memory_kind: 'episodic',
          lifecycle_state: calciumLevel >= 2 ? 'active' : 'candidate',
          confidence_score: 0.62,
          stability_score: calciumLevel >= 2 ? 0.48 : 0.24,
          last_verified_at: now,
          promotion_reason: 'sand_to_gold',
          suppression_reason: undefined,
          archived_at: null,
          healed_at: null,
          fg_entity_names: entityGenes.length > 0 ? entityGenes.map((gene) => gene.name).join(',') : undefined,
          primary_emotion: derivePrimaryEmotion(perception),
          recall_count: 0,
          last_recalled_at: null,
          reinforcement_accumulator: 0,
          effective_strength: Number(initialStrength(normalizedCalcium).toFixed(4)),
          strength_updated_at: now,
          is_landmark: false,
          landmarked_at: null,
          narrative_tag: narrativeTag,
          sensory_anchor: undefined,
          promoted_to_diamond: false,
          namespace: typeof conv.namespace === 'string' && conv.namespace.trim() ? conv.namespace.trim() : 'default',
        };

        try {
          // 幂等：已存在则跳过
          const exist = sqlite.queryAll('SELECT id FROM memories WHERE id = ? LIMIT 1', [memoryId]);
          if (exist.length > 0) continue;

          sqlite.write(record);
          sqlite.writeRaw('UPDATE conversations SET is_promoted = 1 WHERE id = ?', conv.id);
          promoted++;
          nextSeq++;
        } catch { /* 去重跳过 */ }
      }

      sqlite.writeRaw('COMMIT');
      txOpened = false;
      if (promoted > 0) {
        logVaultOperation(sqlite, 'promote_sand', 'sand', undefined, undefined, `砂金晋升金库 ${promoted} 条`);
        console.log(`[MemoryAssessor] 砂金→金库: ${promoted} 条 (calcium>=${cfg.minCalciumScore})`);
      }
    } catch (err) {
      if (txOpened) {
        try { this.storage.getSQLite().writeRaw('ROLLBACK'); } catch { /* rollback best effort */ }
      }
      console.warn('[MemoryAssessor] 砂金→金库失败:', err);
    }
  }

  // ── ② 金库→黑钻 ──

  private async runGoldToDiamond(): Promise<void> {
    try {
      const sqlite = this.storage.getSQLite();
      const entries = autoPromoteCandidatesV2(sqlite, MEMORY_CONFIG.goldToDiamond.batchSize);
      if (entries.length > 0) {
        console.log(`[MemoryAssessor] 金库→黑钻: ${entries.length} 条`);
      }
    } catch (err) {
      console.warn('[MemoryAssessor] 金库→黑钻失败:', err);
    }
  }

  // ── ③ 钙化分衰减 ──

  private async runDecay(): Promise<void> {
    const dc = MEMORY_CONFIG.decay;
    try {
      const sqlite = this.storage.getSQLite();
      const now = new Date().toISOString();

      // 强烈情感记忆 (calcium >= 3) → 极慢衰减
      sqlite.writeRaw(
        `UPDATE memories SET calcium_score = ROUND(MAX(?, calcium_score - ?), 1),
         effective_strength = ROUND(MAX(?, effective_strength * ?), 4),
         strength_updated_at = ?
         WHERE calcium_score > 0
           AND COALESCE(promoted_to_diamond, 0) = 0
           AND COALESCE(lifecycle_state, 'candidate') IN ('candidate', 'active', 'healed')
           AND calcium_score >= 3.0`,
        MEMORY_CONFIG.recall.calciumMin, dc.highCalciumDecay,
        dc.strengthFloor, dc.highStrengthFactor, now,
      );

      // 工作相关记忆 → 慢衰减
      sqlite.writeRaw(
        `UPDATE memories SET calcium_score = ROUND(MAX(?, calcium_score - ?), 1),
         effective_strength = ROUND(MAX(?, effective_strength * ?), 4),
         strength_updated_at = ?
         WHERE calcium_score > 0
         AND COALESCE(promoted_to_diamond, 0) = 0
         AND COALESCE(lifecycle_state, 'candidate') IN ('candidate', 'active', 'healed')
         AND calcium_score < 3.0
         AND (COALESCE(narrative_tag, '') LIKE '%工作%' OR COALESCE(narrative_tag, '') LIKE '%项目%'
              OR COALESCE(narrative_tag, '') LIKE '%公司%' OR COALESCE(narrative_tag, '') LIKE '%会议%')`,
        MEMORY_CONFIG.recall.calciumMin, dc.workDecay,
        dc.strengthFloor, dc.workStrengthFactor, now,
      );

      // 普通中性记忆 → 正常衰减
      sqlite.writeRaw(
        `UPDATE memories SET calcium_score = ROUND(MAX(?, calcium_score - ?), 1),
         effective_strength = ROUND(MAX(?, effective_strength * ?), 4),
         strength_updated_at = ?
         WHERE calcium_score > 0
         AND COALESCE(promoted_to_diamond, 0) = 0
         AND COALESCE(lifecycle_state, 'candidate') IN ('candidate', 'active', 'healed')
         AND calcium_score < 3.0
         AND (COALESCE(narrative_tag, '') NOT LIKE '%工作%' AND COALESCE(narrative_tag, '') NOT LIKE '%项目%'
              AND COALESCE(narrative_tag, '') NOT LIKE '%公司%' AND COALESCE(narrative_tag, '') NOT LIKE '%会议%')`,
        MEMORY_CONFIG.recall.calciumMin, dc.normalDecay,
        dc.strengthFloor, dc.normalStrengthFactor, now,
      );

      console.log('[MemoryAssessor] 钙化分衰减完成');
    } catch (err) {
      console.warn('[MemoryAssessor] 钙化分衰减失败:', err);
    }
  }

  async triggerSandToGold(): Promise<number> {
    await this.runSandToGold();
    const sqlite = this.storage.getSQLite();
    const count = sqlite.queryAll('SELECT COUNT(*) as c FROM memories') as any[];
    return count[0]?.c || 0;
  }

  async triggerGoldToDiamond(): Promise<number> {
    await this.runGoldToDiamond();
    const sqlite = this.storage.getSQLite();
    const count = sqlite.queryAll('SELECT COUNT(*) as c FROM black_diamond') as any[];
    return count[0]?.c || 0;
  }
}
