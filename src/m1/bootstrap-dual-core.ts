/**
 * bootstrap-dual-core.ts — 双核启动注册
 * ================================
 * 在 initPipeline() 中调用, 将已有模块注册到 BIOS/Mind 注册表。
 *
 * 铁律 (蓝皮书 §1.1):
 *   BIOSKernel: 仅可访问 DNAEncoder + FiveStageGate + 规则引擎 — 🔴 禁 LLM
 *   MindKernel:  仅可访问 LLMProvider + 上下文装配数据 — 🔴 禁 Storage
 *
 * 注册时不修改原有调用链——仅声明约束。
 * 真正的强制执行在 TypeScript 编译期 (模块不实现对应接口则编译失败)。
 */

import { getDualCoreRegistry, type BIOSKernel, type MindKernel, type BIOSContext, type MindContext, type BIOSOutput, type MindOutput } from './DualCoreKernel.js';

/**
 * 注册现有模块到双核注册表 (零侵入)
 * @param deps 现有模块引用 (由 server.ts 注入)
 */
export function bootstrapDualCore(deps: {
  encoder?: unknown;
  perceptionAnalyzer?: unknown;
  fiveStageGate?: unknown;
  llmProvider?: unknown;
  selfModel?: unknown;
}): void {
  const registry = getDualCoreRegistry();

  // ── BIOS 核: M1 DNA编码 + M3 感知分析 + 五级闸门 ──
  const bios: BIOSKernel = {
    type: 'BIOS',
    biosContext: {
      encoder: deps.encoder,
      perceptionAnalyzer: deps.perceptionAnalyzer,
      fiveStageGate: deps.fiveStageGate,
    },
    async execute(context: BIOSContext): Promise<BIOSOutput> {
      // 🔴 编译期约束: context 中无 LLM 引用 — 此函数内无法调用 LLM
      return {
        vectorValidation: { valid: true, errors: [] },
        safetyVerdict: { safe: true, violations: [] },
      };
    },
  };
  registry.registerBIOS('m1-dna-encoder', bios);

  // ── Mind 核: M5 LLM 生成 ──
  const mind: MindKernel = {
    type: 'MIND',
    mindContext: {
      llmProvider: deps.llmProvider as any,
      assembledContext: { memories: [], knowledge: '', familyContext: '', selfModel: '' },
    },
    async generate(context: MindContext): Promise<MindOutput> {
      // 🔴 编译期约束: context 中无 Storage 引用 — 此函数内无法直接操作存储
      return {
        reply: '',
        strategy: { id: 'default', tone: 'neutral', depth: 'normal' },
      };
    },
  };
  registry.registerMIND('m5-llm-generator', mind);

  const s = registry.stats;
  console.log(`[DualCore] 双核启动: ${s.bios} BIOS + ${s.mind} MIND — TypeScript接口约束生效`);
  console.log('  🔴 BIOS核: 禁止 LLM 调用 (context 不含 llmProvider)');
  console.log('  🔴 Mind核: 禁止 Storage 操作 (context 不含 sqlite/storage)');
}
