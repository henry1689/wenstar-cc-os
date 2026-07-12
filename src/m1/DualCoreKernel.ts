/**
 * DualCoreKernel.ts — BIOS核 / Mind核 双核接口约束
 * ====================================================
 * 适配: 天权底座 V1.0 / 白皮书 V2.0 §5.3 / 蓝皮书 §1.1
 *
 * 铁律 (蓝皮书 §1.1):
 *   BIOS核 (实时): DNA编码 / 32D校验 / 安全阈值判定 / 五级闸门过滤
 *                  🔴 永不调用 LLM
 *   Mind核 (推理): 语义理解 / 上下文组装 / LLM 生成 / 策略选择
 *                  🔴 永不直接操作存储
 *
 * TypeScript 编译期强制:
 *   BIOS: 接收 BIOSContext (无 LLM 引用), 返回 BIOSOutput
 *   Mind: 接收 MindContext (无 Storage 引用), 返回 MindOutput
 *
 * 使用:
 *   class YourBIOSModule implements BIOSKernel { ... }
 *   class YourMindModule implements MindKernel { ... }
 */

import type { LLMProvider } from '../m5/types/index.js';
import type { FusionStorageAdapter } from '../m2/FusionStorageAdapter.js';

// ══════════════════════════════════════════════════════
// §1 — BIOS 核接口
// ══════════════════════════════════════════════════════

/** BIOS 核允许接收的依赖 (无 LLM) */
export interface BIOSContext {
  /** DNA 编码器 */
  encoder?: unknown;
  /** 存储访问: 仅允许写入侧 (只读查询走 Mind核→Gate→BIOS反馈) */
  storage?: { writeOnly: boolean; _internal: never };
  /** 感知分析器 (规则引擎, 无 LLM) */
  perceptionAnalyzer?: unknown;
  /** 安全阈值注册表 */
  thresholdRegistry?: unknown;
  /** 五级闸门实例 */
  fiveStageGate?: unknown;
}

/** BIOS 核输出 */
export interface BIOSOutput {
  /** 编码后的 DNA */
  dna?: unknown;
  /** 32D 校验结果 */
  vectorValidation?: { valid: boolean; errors: string[] };
  /** 安全阈值判定 */
  safetyVerdict?: { safe: boolean; violations: Array<{ dimension: number; reason: string }> };
  /** 闸门过滤结果 */
  gateResult?: { passed: unknown[]; suppressed: number };
}

/** BIOS 核契约 */
export interface BIOSKernel {
  readonly type: 'BIOS';
  readonly biosContext: BIOSContext;
  /**
   * 执行 BIOS 级操作。
   * 🔴 编译期保证: 不接受 LLM 引用 — 无法在此函数内调用 LLM
   */
  execute(context: BIOSContext): Promise<BIOSOutput>;
}

// ══════════════════════════════════════════════════════
// §2 — Mind 核接口
// ══════════════════════════════════════════════════════

/** Mind 核允许接收的依赖 (无 Storage 直接操作) */
export interface MindContext {
  /** LLM 提供者 (唯一允许调用 LLM 的地方) */
  llmProvider: LLMProvider;
  /** 上下文组装数据 (BIOS 核已过滤好的记忆/知识) */
  assembledContext: {
    memories: Array<{ content: string; calcium_score: number }>;
    knowledge: string;
    familyContext: string;
    selfModel: string;
  };
  /** 角色信息 */
  persona?: { name: string; traits: Record<string, number> };
}

/** Mind 核输出 */
export interface MindOutput {
  /** 生成的回复文本 */
  reply: string;
  /** 策略信息 */
  strategy: { id: string; tone: string; depth: string };
}

/** Mind 核契约 */
export interface MindKernel {
  readonly type: 'MIND';
  readonly mindContext: MindContext;

  /**
   * 执行 Mind 级推理。
   * 🔴 编译期保证: 不接受 Storage 引用 — 无法在此函数内直接操作存储
   * 🔴 需写存储: 返回 MindOutput 中的元数据由上层 BIOS 核写入
   */
  generate(context: MindContext): Promise<MindOutput>;
}

// ══════════════════════════════════════════════════════
// §3 — 双核注册表
// ══════════════════════════════════════════════════════

export class DualCoreRegistry {
  private _biosModules: Map<string, BIOSKernel> = new Map();
  private _mindModules: Map<string, MindKernel> = new Map();

  registerBIOS(name: string, module: BIOSKernel): void {
    if (module.type !== 'BIOS') throw new Error(`${name}: 不是 BIOS 核模块`);
    this._biosModules.set(name, module);
  }

  registerMIND(name: string, module: MindKernel): void {
    if (module.type !== 'MIND') throw new Error(`${name}: 不是 Mind 核模块`);
    this._mindModules.set(name, module);
  }

  getBIOS(name: string): BIOSKernel | undefined { return this._biosModules.get(name); }
  getMIND(name: string): MindKernel | undefined { return this._mindModules.get(name); }

  async runBIOSPipeline(context: BIOSContext): Promise<BIOSOutput> {
    let output: BIOSOutput = {};
    for (const [name, bios] of this._biosModules) {
      try {
        const result = await bios.execute(context);
        output = { ...output, ...result };
      } catch (err) {
        console.warn(`[DualCore] BIOS:${name} 失败:`, (err as Error).message);
      }
    }
    return output;
  }

  async runMindGeneration(context: MindContext): Promise<MindOutput> {
    for (const [, mind] of this._mindModules) {
      return await mind.generate(context); // 只取第一个 Mind 核
    }
    throw new Error('无已注册的 Mind 核模块');
  }

  get stats(): { bios: number; mind: number } {
    return { bios: this._biosModules.size, mind: this._mindModules.size };
  }
}

// ── 全局单例 ──
const _dualCoreRegistry = new DualCoreRegistry();
export function getDualCoreRegistry(): DualCoreRegistry { return _dualCoreRegistry; }
