/**
 * 档案自动采集引擎 — Profile Acquisition Engine (PAE)
 *
 * 定位：FG 档案数据的自动采集与写入单一入口。
 * 替代散落在 chat.ts 中的 4 套正则提取管道，以 LLM 为主、正则为辅，
 * 带置信度评分、去重、冲突检测、写保护闸门。
 *
 * 架构原则：
 * - 合理性：只提取明确陈述的事实，三级确定性区分
 * - 规范性：统一写入 dossier 结构化字段
 * - 自动化：Hook B（生成前）+ Hook C（生成后）自动触发
 * - 可靠性：写前快照 + 写后验证 + 回滚机制
 * - 准确性：LLM 提取 → 正则验证 → 置信度闸门 三层过滤
 * - 文学性：LLM prompt 要求保持原文语言风格
 * - 最高保护：acquisitionIntegrityGuard 6 项启动自检
 * - 升级免疫：修改 PAE 代码必须通过 integrity guard 前后对比
 */

import { PAE_CONFIG, PAE_INTEGRITY_CHECKS } from '../config/profile-acquisition-guard.js';
import {
  buildExtractionSystemPrompt,
  buildExtractionUserMessage,
  summarizeExistingProfile,
} from './prompts/profile-extraction.js';
import type { PersonProfile, PersonDossier, PendingItem } from './FamilyGraph.js';
import type { FamilyGraph } from './FamilyGraph.js';

// ── 类型定义 ──

/** 原始 LLM 调用签名：messages → 返回 text */
export type RawLLMCaller = (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  temperature: number
) => Promise<string>;

/** 提取的单个字段 */
export interface ExtractionField {
  /** 字段路径，如 "occupation"、"basicInfo.birthYear"、"imageTraits.looks" */
  fieldPath: string;
  /** 提取的值 */
  value: string | string[] | number;
  /** LLM 自评置信度 0-1 */
  confidence: number;
  /** 原文证据句子 */
  evidence: string;
  /** 确定性级别 */
  certainty: 'explicit' | 'implied' | 'ambiguous';
}

/** 单个人的提取结果 */
export interface ExtractionResult {
  personName: string;
  fields: ExtractionField[];
  reasoningTrace?: string;
  /** 综合置信度 */
  overallConfidence: number;
  /** 此人是否在本段对话中被提及 */
  personReferenced: boolean;
}

/** 采集选项 */
export interface AcquisitionOptions {
  /** 提取模式 */
  mode: 'pre_generation' | 'post_generation';
  /** 来源标记 */
  source?: string;
  /** 已知人物档案（避免重复提取），按人名索引 */
  existingProfiles?: Map<string, PersonProfile>;
  /** FG 家族上下文 */
  fgContext?: Array<{ entity: string; relation: string }>;
}

/** 单次采集报告 */
export interface AcquisitionReport {
  /** 采集到的人数 */
  personsProcessed: number;
  /** 写入的字段总数 */
  fieldsWritten: number;
  /** 丢弃的字段数（低置信度） */
  fieldsDiscarded: number;
  /** 跳过的字段数（去重/冲突） */
  fieldsSkipped: number;
  /** 各人物详情 */
  details: Array<{
    personName: string;
    fieldsCommitted: string[];
    fieldsSkipped: string[];
    errors: string[];
  }>;
  /** 采集耗时 ms */
  elapsedMs: number;
}

/** 完整性守护报告 */
export interface IntegrityGuardReport {
  healthy: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  errors: string[];
}

/** 写入提交结果 */
interface CommitResult {
  committed: boolean;
  fieldPath: string;
  reason: string;
}

// ── 字段验证器（从原 extractProfileFromText 26 条规则转换）──

const FIELD_VALIDATORS: Record<string, (value: any) => boolean> = {
  'basicInfo.birthYear': (v) =>
    typeof v === 'number' ? v >= 1900 && v <= 2020 : /^(19|20)\d{2}$/.test(String(v)) && +v >= 1900 && +v <= 2020,
  'basicInfo.gender': (v) => ['男', '女'].includes(String(v)),
  'contact.phone': (v) => /^1[3-9]\d{9}$/.test(String(v).replace(/\s|-/g, '')),
  'contact.wechat': (v) => /^[a-zA-Z0-9_-]{4,30}$/.test(String(v)),
  'contact.email': (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)),
  'occupation': (v) => {
    const s = String(v).trim();
    return s.length >= 2 && s.length <= 30 && !/^(叫|什么|哪|哪里|哪儿|谁|吗|呢|吧|啊|呀)/.test(s);
  },
  'health.condition': (v) => {
    const s = String(v).trim();
    return s.length >= 2 && s.length <= 200;
  },
};

/** 验证单字段值是否合法 */
function validateFieldValue(fieldPath: string, value: any): boolean {
  // 通用检查
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length < 1 || trimmed.length > 500) return false;
    // 过滤 LLM 对话文本污染（复用 _isValidPendingValue 逻辑）
    if (/^\s*[\n\r：:玉]/.test(trimmed)) return false;
    if (/\(.*(?:听到|突然|叫出|心想|嘀咕|小声|低声|默默)/.test(trimmed)) return false;
    if (/^[\d\s,.，。、！？!?]+$/.test(trimmed) && trimmed.replace(/[\d\s,.，。、！？!?]/g, '').length === 0)
      return false;
  }

  // 特定字段验证器
  const validator = FIELD_VALIDATORS[fieldPath];
  if (validator) return validator(value);

  // 默认通过（值非空）
  return true;
}

// ── 限流器 ──

class RateLimiter {
  private calls: number[] = [];

  /** 检查是否允许本次调用，记录时间戳 */
  allow(maxPerHour: number, maxPerDay: number): boolean {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    const dayAgo = now - 86400_000;

    // 清理过期记录
    this.calls = this.calls.filter((t) => t > dayAgo);

    const lastHour = this.calls.filter((t) => t > hourAgo).length;
    const lastDay = this.calls.length;

    if (lastHour >= maxPerHour || lastDay >= maxPerDay) {
      return false;
    }

    this.calls.push(now);
    return true;
  }

  /** 当前窗口计数 */
  stats(): { lastHour: number; lastDay: number } {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    const dayAgo = now - 86400_000;
    this.calls = this.calls.filter((t) => t > dayAgo);
    return {
      lastHour: this.calls.filter((t) => t > hourAgo).length,
      lastDay: this.calls.length,
    };
  }
}

// ── 主类 ──

export class ProfileAcquisitionEngine {
  private familyGraph: FamilyGraph;
  private rawLLMCall: RawLLMCaller;
  private rateLimiter = new RateLimiter();
  private extractionCache = new Map<string, { result: ExtractionResult[]; timestamp: number }>();
  private writeLock = new Map<string, Promise<void>>();

  constructor(familyGraph: FamilyGraph, rawLLMCall: RawLLMCaller) {
    this.familyGraph = familyGraph;
    this.rawLLMCall = rawLLMCall;
  }

  // ═══════════════════════════════════════════════════════════════
  // 主入口
  // ═══════════════════════════════════════════════════════════════

  /**
   * 从对话文本中提取人物档案信息并写入 FG。
   *
   * @param conversationText - 对话文本（用户消息 或 AI 回复）
   * @param mentionedPersons - M1 识别到的被提及人名列表
   * @param options - 采集选项
   */
  async acquire(
    conversationText: string,
    mentionedPersons: string[],
    options: AcquisitionOptions
  ): Promise<AcquisitionReport> {
    const startTime = Date.now();
    const report: AcquisitionReport = {
      personsProcessed: 0,
      fieldsWritten: 0,
      fieldsDiscarded: 0,
      fieldsSkipped: 0,
      details: [],
      elapsedMs: 0,
    };

    if (!conversationText || mentionedPersons.length === 0) return report;

    // 去重 + 限流
    const dedupedPersons = [...new Set(mentionedPersons)].filter((n) => n && n !== '我');
    if (dedupedPersons.length === 0) return report;

    // AI 回复提取（Hook C）的额外限流
    if (options.mode === 'post_generation') {
      if (!this.rateLimiter.allow(PAE_CONFIG.maxCallsPerHour, PAE_CONFIG.maxCallsPerDay)) {
        return report;
      }
    }

    // 按批次处理（maxPersonsPerCall 人/次）
    const batches: string[][] = [];
    for (let i = 0; i < dedupedPersons.length; i += PAE_CONFIG.maxPersonsPerCall) {
      batches.push(dedupedPersons.slice(i, i + PAE_CONFIG.maxPersonsPerCall));
    }

    for (const batch of batches) {
      try {
        // 缓存检查
        const cacheKey = `${conversationText}|${batch.sort().join(',')}`;
        let results: ExtractionResult[];

        const cached = this.extractionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < PAE_CONFIG.cacheTTL) {
          results = cached.result;
        } else {
          // LLM 提取
          const fgKnownPersons = this.familyGraph.getAllPersonNames?.() || [];
          const rawResults = await this.extractWithLLM(
            conversationText.substring(0, PAE_CONFIG.maxInputLength),
            batch,
            options,
            fgKnownPersons
          );
          results = rawResults;
          this.extractionCache.set(cacheKey, { result: results, timestamp: Date.now() });
        }

        // 处理每个提取结果
        for (const result of results) {
          if (!result.personReferenced) continue;
          report.personsProcessed++;

          const detail: AcquisitionReport['details'][0] = {
            personName: result.personName,
            fieldsCommitted: [],
            fieldsSkipped: [],
            errors: [],
          };

          for (const field of result.fields) {
            try {
              const commitResult = await this.commitField(
                result.personName,
                field,
                options
              );
              if (commitResult.committed) {
                report.fieldsWritten++;
                detail.fieldsCommitted.push(field.fieldPath);
              } else {
                report.fieldsSkipped++;
                detail.fieldsSkipped.push(`${field.fieldPath}(${commitResult.reason})`);
              }
            } catch (err) {
              detail.errors.push(
                `${field.fieldPath}: ${err instanceof Error ? err.message : String(err)}`
              );
            }
          }

          report.details.push(detail);
        }
      } catch (err) {
        // 单个 batch 失败不阻塞其他 batch
        console.warn('[PAE] Batch extraction failed:', err instanceof Error ? err.message : String(err));
      }
    }

    report.elapsedMs = Date.now() - startTime;
    return report;
  }

  // ═══════════════════════════════════════════════════════════════
  // LLM 提取
  // ═══════════════════════════════════════════════════════════════

  private async extractWithLLM(
    conversationText: string,
    persons: string[],
    options: AcquisitionOptions,
    fgKnownPersons: string[]
  ): Promise<ExtractionResult[]> {
    // 构建 system prompt
    const systemPrompt = buildExtractionSystemPrompt();

    // 合并多人的提取请求到一次调用
    const userMessageParts: string[] = [];

    for (const personName of persons) {
      const profile = options.existingProfiles?.get(personName);
      const existingSummary = profile
        ? summarizeExistingProfile(profile, PAE_CONFIG.maxProfileSummaryLength)
        : '';

      userMessageParts.push(
        buildExtractionUserMessage({
          conversationText,
          personName,
          existingProfileSummary: existingSummary,
          fgKnownPersons,
        })
      );
    }

    const userMessage = userMessageParts.join('\n\n---\n\n');

    // 调用 LLM（带超时）
    const llmPromise = this.rawLLMCall(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      PAE_CONFIG.extractionMaxTokens,
      PAE_CONFIG.extractionTemperature
    );

    let responseText: string;
    try {
      responseText = await Promise.race([
        llmPromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('PAE_LLM_TIMEOUT')), PAE_CONFIG.llmTimeout)
        ),
      ]);
    } catch (err) {
      throw new Error(`LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 解析 JSON 响应
    return this.parseExtractionResponse(responseText, persons);
  }

  /** 解析 LLM JSON 响应，带容错 */
  private parseExtractionResponse(responseText: string, expectedPersons: string[]): ExtractionResult[] {
    let text = responseText.trim();

    // 去除可能的 markdown 代码块标记
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/, '');

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 尝试从文本中提取 JSON 块
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return [];
        }
      } else {
        return [];
      }
    }

    if (!parsed || !Array.isArray(parsed.persons)) return [];

    const results: ExtractionResult[] = [];
    for (const p of parsed.persons) {
      if (!p.personName) continue;

      const fields: ExtractionField[] = (p.fields || [])
        .filter((f: any) => f.fieldPath && f.value !== undefined && f.value !== null)
        .map((f: any) => ({
          fieldPath: String(f.fieldPath),
          value: f.value,
          confidence: typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : 0.5,
          evidence: String(f.evidence || '').substring(0, 200),
          certainty: ['explicit', 'implied', 'ambiguous'].includes(f.certainty)
            ? (f.certainty as 'explicit' | 'implied' | 'ambiguous')
            : 'implied',
        }));

      const overallConfidence =
        fields.length > 0
          ? Math.round((fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length) * 100) / 100
          : 0;

      results.push({
        personName: String(p.personName),
        fields,
        reasoningTrace: p.reasoningTrace || undefined,
        overallConfidence,
        personReferenced: p.personReferenced !== false,
      });
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  // 置信度计算
  // ═══════════════════════════════════════════════════════════════

  private computeConfidence(field: ExtractionField): number {
    // 确定性分数
    const certaintyScores: Record<string, number> = {
      explicit: 1.0,
      implied: 0.6,
      ambiguous: 0.3,
    };
    const certaintyScore = certaintyScores[field.certainty] || 0.5;

    // 证据质量分数
    const evidenceLen = (field.evidence || '').length;
    let evidenceScore: number;
    if (evidenceLen >= 20) evidenceScore = 1.0;
    else if (evidenceLen >= 8) evidenceScore = 0.7;
    else evidenceScore = 0.3;

    // 综合：LLM 自评 40% + 确定性 30% + 证据质量 30%
    return Math.round((field.confidence * 0.4 + certaintyScore * 0.3 + evidenceScore * 0.3) * 100) / 100;
  }

  // ═══════════════════════════════════════════════════════════════
  // 去重与冲突检测
  // ═══════════════════════════════════════════════════════════════

  private detectConflict(
    personName: string,
    fieldPath: string,
    newValue: any,
    profile: PersonProfile
  ): { isDuplicate: boolean; isConflict: boolean; reason: string } {
    // 1. 检查现有值
    const existingValue = this.getExistingFieldValue(profile, fieldPath);

    if (existingValue !== undefined && existingValue !== null) {
      // 精确匹配
      if (JSON.stringify(existingValue) === JSON.stringify(newValue)) {
        return { isDuplicate: true, isConflict: false, reason: 'exact_match' };
      }

      // 语义等价（归一化后相同）
      const normOld = this.normalize(String(existingValue));
      const normNew = this.normalize(String(newValue));
      if (normOld === normNew && normOld.length > 1) {
        return { isDuplicate: true, isConflict: false, reason: 'semantic_equivalent' };
      }

      // 冲突检测：新值与旧值不同 → 保守处理，标记冲突
      if (normOld.length > 1 && normNew.length > 1 && normOld !== normNew) {
        return { isDuplicate: false, isConflict: true, reason: `conflict: old="${String(existingValue).substring(0, 30)}" new="${String(newValue).substring(0, 30)}"` };
      }
    }

    return { isDuplicate: false, isConflict: false, reason: 'new_field' };
  }

  /** 从 profile 中获取指定路径的值（先查 flat 字段，再查 dossier） */
  private getExistingFieldValue(profile: PersonProfile, fieldPath: string): any {
    // Flat 字段直接查
    const flatFields: Record<string, keyof PersonProfile> = {
      'occupation': 'occupation',
      'appearance': 'appearance',
      'body_features': 'body_features',
      'style': 'style',
      'voice': 'voice',
      'traits': 'traits',
      'personality': 'personality',
      'interests': 'interests',
      'habits': 'habits',
      'psychology': 'psychology',
      'description': 'description',
    };

    if (flatFields[fieldPath]) {
      return profile[flatFields[fieldPath]];
    }

    // Dossier 字段按路径查
    if (profile.dossier) {
      const parts = fieldPath.split('.');
      let target: any = profile.dossier;
      for (const key of parts) {
        if (target === undefined || target === null) return undefined;
        target = target[key];
      }
      return target;
    }

    return undefined;
  }

  private normalize(value: string): string {
    return value.replace(/[，,。.!！?\s、：:]/g, '').toLowerCase().trim();
  }

  // ═══════════════════════════════════════════════════════════════
  // 受保护的写入管道
  // ═══════════════════════════════════════════════════════════════

  private async commitField(
    personName: string,
    field: ExtractionField,
    options: AcquisitionOptions
  ): Promise<CommitResult> {
    // Step 1: 验证
    if (!validateFieldValue(field.fieldPath, field.value)) {
      return { committed: false, fieldPath: field.fieldPath, reason: 'validation_failed' };
    }

    // Step 2: 置信度评分
    const confidence = this.computeConfidence(field);

    // AI 回复来源 → 更高的阈值 + 只写 pending
    const isAssistantSource = options.source === 'assistant_response' || options.mode === 'post_generation';
    const directThreshold = isAssistantSource
      ? PAE_CONFIG.assistantResponseThreshold
      : PAE_CONFIG.directWriteThreshold;
    const canDirectWrite = !isAssistantSource || PAE_CONFIG.assistantResponseDirectWrite;

    if (confidence < PAE_CONFIG.pendingThreshold) {
      return { committed: false, fieldPath: field.fieldPath, reason: `low_confidence(${confidence})` };
    }

    // Step 3: 获取写入锁（按人物串行化）
    return this.withWriteLock(personName, async () => {
      // Step 4: 读取当前档案
      const profile = this.familyGraph.getPersonProfile(personName);
      if (!profile) {
        return { committed: false, fieldPath: field.fieldPath, reason: 'person_not_found' };
      }

      // Step 5: 去重 & 冲突检测
      const { isDuplicate, isConflict, reason } = this.detectConflict(
        personName,
        field.fieldPath,
        field.value,
        profile
      );

      if (isDuplicate) {
        return { committed: false, fieldPath: field.fieldPath, reason };
      }

      if (isConflict) {
        // 记录冲突但不覆盖
        try {
          await this.familyGraph.addProfileChange?.(
            personName,
            `dossier.${field.fieldPath}`,
            this.getExistingFieldValue(profile, field.fieldPath),
            field.value
          );
        } catch { /* 非关键 */ }
        return { committed: false, fieldPath: field.fieldPath, reason };
      }

      // Step 6: 写前快照
      let snapshot: string | null = null;
      try {
        const node = (this.familyGraph as any).findPersonNodeByNameOrAlias?.(personName);
        if (node) snapshot = node.properties;
      } catch { /* 降级：快照失败也继续写 */ }

      // Step 7: 写入
      try {
        if (confidence >= directThreshold && canDirectWrite) {
          // 直接写入 dossier
          await this.familyGraph.setDossierField(personName, field.fieldPath, field.value);
        } else {
          // 写入 pendingItems
          const source = `${options.source || 'conversation'} | ${field.evidence.substring(0, 80)}`;
          await this.familyGraph.addPendingItem(
            personName,
            field.fieldPath,
            typeof field.value === 'string' ? field.value : String(field.value),
            source
          );
        }

        // Step 8: 写后验证
        const updatedProfile = this.familyGraph.getPersonProfile(personName);
        if (updatedProfile) {
          const writtenValue = this.getExistingFieldValue(updatedProfile, field.fieldPath);
          const valueWritten =
            writtenValue !== undefined &&
            (JSON.stringify(writtenValue) === JSON.stringify(field.value) ||
              String(writtenValue) === String(field.value));

          if (!valueWritten && confidence >= directThreshold && canDirectWrite) {
            // 直接写入验证失败 → 回滚
            if (snapshot) {
              const node = (this.familyGraph as any).findPersonNodeByNameOrAlias?.(personName);
              if (node) {
                (this.familyGraph as any).run?.(
                  'UPDATE nodes SET properties = ? WHERE id = ?',
                  [snapshot, node.id]
                );
              }
            }
            return { committed: false, fieldPath: field.fieldPath, reason: 'write_verification_failed' };
          }
        }

        const writeType = confidence >= directThreshold && canDirectWrite ? 'direct' : 'pending';
        return { committed: true, fieldPath: field.fieldPath, reason: `${writeType}:${confidence}` };
      } catch (err) {
        // 写入异常 → 尝试回滚
        if (snapshot) {
          try {
            const node = (this.familyGraph as any).findPersonNodeByNameOrAlias?.(personName);
            if (node) {
              (this.familyGraph as any).run?.(
                'UPDATE nodes SET properties = ? WHERE id = ?',
                [snapshot, node.id]
              );
            }
          } catch { /* 回滚失败，已尽力 */ }
        }
        return {
          committed: false,
          fieldPath: field.fieldPath,
          reason: `write_error:${err instanceof Error ? err.message : String(err)}`,
        };
      }
    });
  }

  /** 按人物串行化写入，防止 Hook B/C 并发竞争 */
  private async withWriteLock<T>(personName: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.writeLock.get(personName) || Promise.resolve();
    const next = prev.then(fn, fn) as Promise<T>;
    this.writeLock.set(personName, next.catch(() => {}) as Promise<void>);
    return next;
  }

  // ═══════════════════════════════════════════════════════════════
  // 完整性守护闸门
  // ═══════════════════════════════════════════════════════════════

  /**
   * 启动时完整性自检，与 fgIntegrityGuard 同级。
   * 6 项检查，任何一项不通过 → healthy=false。
   */
  acquisitionIntegrityGuard(): IntegrityGuardReport {
    const checks: IntegrityGuardReport['checks'] = [];
    const errors: string[] = [];

    try {
      const allPersons = (this.familyGraph as any).getAllPersons?.() || [];

      // ① 无空值污染：所有 dossier 非空字段的值不为 null/undefined
      let nullCount = 0;
      for (const p of allPersons) {
        const props = p.properties ? JSON.parse(p.properties) : {};
        const dossier = props.dossier;
        if (!dossier) continue;
        this.checkDossierNulls(dossier, '', (path) => {
          nullCount++;
          if (nullCount <= 5) errors.push(`空值污染: ${p.name}.${path}`);
        });
      }
      checks.push({
        name: PAE_INTEGRITY_CHECKS[0],
        passed: nullCount === 0,
        detail: nullCount === 0 ? '所有 dossier 字段无空值' : `${nullCount} 个空值字段`,
      });

      // ② pendingItems 质量：无 LLM 对话文本混入
      let badPendingCount = 0;
      for (const p of allPersons) {
        const props = p.properties ? JSON.parse(p.properties) : {};
        const items: PendingItem[] = props.pendingItems || [];
        for (const item of items) {
          if (!item?.value) continue;
          if (/^\s*[\n\r：:玉]/.test(item.value) || /\(.*(?:听到|突然|叫出|心想|嘀咕)/.test(item.value)) {
            badPendingCount++;
          }
        }
      }
      checks.push({
        name: PAE_INTEGRITY_CHECKS[1],
        passed: badPendingCount === 0,
        detail: badPendingCount === 0 ? '所有 pendingItems 质量合格' : `${badPendingCount} 个可疑条目`,
      });

      // ③ 无重复 pendingItems：相同 field::value 不重复
      let dupPendingCount = 0;
      for (const p of allPersons) {
        const props = p.properties ? JSON.parse(p.properties) : {};
        const items: PendingItem[] = props.pendingItems || [];
        const seen = new Set<string>();
        for (const item of items) {
          const key = `${item.field}::${item.value}`;
          if (seen.has(key)) dupPendingCount++;
          else seen.add(key);
        }
      }
      checks.push({
        name: PAE_INTEGRITY_CHECKS[2],
        passed: dupPendingCount === 0,
        detail: dupPendingCount === 0 ? '无重复 pendingItems' : `${dupPendingCount} 个重复条目`,
      });

      // ④ changeHistory 不超限
      let overLimitCount = 0;
      for (const p of allPersons) {
        const props = p.properties ? JSON.parse(p.properties) : {};
        const history = props._changeHistory || [];
        if (history.length > 100) overLimitCount++;
      }
      checks.push({
        name: PAE_INTEGRITY_CHECKS[3],
        passed: overLimitCount === 0,
        detail: overLimitCount === 0 ? '所有 changeHistory 长度合规' : `${overLimitCount} 人超限`,
      });

      // ⑤ completeness 合法
      let badCompletenessCount = 0;
      for (const p of allPersons) {
        const props = p.properties ? JSON.parse(p.properties) : {};
        const c = props.completeness;
        if (c !== undefined && (typeof c !== 'number' || c < 0 || c > 1)) {
          badCompletenessCount++;
        }
      }
      checks.push({
        name: PAE_INTEGRITY_CHECKS[4],
        passed: badCompletenessCount === 0,
        detail: badCompletenessCount === 0 ? '所有 completeness 值合法' : `${badCompletenessCount} 个非法值`,
      });

      // ⑥ 无孤儿 dossier：嵌套子对象不为 null（只检查已存在的）
      let orphanCount = 0;
      for (const p of allPersons) {
        const props = p.properties ? JSON.parse(p.properties) : {};
        const dossier = props.dossier;
        if (!dossier) continue;
        if (dossier.imageTraits?.feminineDetails === null) orphanCount++;
        if (dossier.relationMap?.intersections === null) orphanCount++;
      }
      checks.push({
        name: PAE_INTEGRITY_CHECKS[5],
        passed: orphanCount === 0,
        detail: orphanCount === 0 ? '无孤儿 dossier 子对象' : `${orphanCount} 个孤儿子对象`,
      });

    } catch (err) {
      errors.push(`完整性检查异常: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      healthy: errors.length === 0 && checks.every((c) => c.passed),
      checks,
      errors,
    };
  }

  /** 递归检查 dossier 中的空值 */
  private checkDossierNulls(obj: any, prefix: string, onNull: (path: string) => void): void {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, val] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (val === null || val === undefined) {
        onNull(path);
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        this.checkDossierNulls(val, path, onNull);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 限流状态查询
  // ═══════════════════════════════════════════════════════════════

  getRateLimitStats(): { lastHour: number; lastDay: number } {
    return this.rateLimiter.stats();
  }
}

export default ProfileAcquisitionEngine;
