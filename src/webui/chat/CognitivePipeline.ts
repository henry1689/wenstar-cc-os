/**
 * CognitivePipeline — M1→M5 认知编排协调器 (V12.0 P2-2)
 * ======================================================
 * 将 chat.ts 中分散的 M4→M5 编排逻辑集中到此模块。
 * 这是 P0-6 (chat.ts 神级编排) 的延续:
 *   搜索 → retrieval-stage / UnifiedSearchEngine
 *   Prompt → PromptAssembler
 *   持久化 → persistence-stage
 *   Policy → ChatPolicy
 *   编排 → 此模块
 *
 * 当前阶段: 薄门面 — 不改变调用链，仅把编排语义显式化。
 */

import type { M4Orchestrator } from '../../m4/M4Orchestrator.js';
import type { M5Orchestrator } from '../../m5/M5Orchestrator.js';
import type { RoleType } from '../../app/role/RoleClassifier.js';

export interface PipelineInput {
  m4Ctx: any;
  enrichedHistory: any[];
  finalKnowledgeText: string;
  knowledgeBaseText: string;
  userMessage: string;
  role: RoleType;
  isEntityMeeting: boolean;
}

/**
 * M4→M5 编排 — 薄协调层。
 *
 * 后续可在此层加入: 重试/降级策略、超时控制、流式缓冲、认知审计日志。
 */
export async function runCognitivePipeline(
  m4: M4Orchestrator,
  m5: M5Orchestrator,
  input: PipelineInput,
): Promise<string> {
  return m5.orchestrate(
    input.m4Ctx,
    input.enrichedHistory,
    input.finalKnowledgeText,
    input.knowledgeBaseText
      ? input.knowledgeBaseText.split('\n').filter((l: string) => l.trim()).join('\n') + '\n\n' + input.userMessage
      : input.userMessage,
    input.role,
    input.isEntityMeeting,
  );
}

export default { runCognitivePipeline };
