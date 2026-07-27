/**
 * PromptAssembler — 结构化 Prompt 组装器 (V12.0)
 * ================================================
 * 替代 chat.ts 中的 finalKnowledgeText 线性拼接链。
 * 所有模块提交 PromptBlock，组装器统一完成收集→去重→冲突检测→排序→渲染。
 *
 * 设计原则（蓝皮书级硬约束）:
 *   - 顺序不再决定语义: priority + type 决定注入顺序和冲突策略
 *   - 模式感知: 每个 block 声明自己适用于哪些 ChatMode
 *   - 可测试: 每种模式输出可快照对比
 */

// ── 会话模式（简化版，完整 ChatMode 在 P0-2 中定义） ──
export type ChatModeKind = 'normal' | 'entity_meeting' | 'roleplay' | 'secretary' | 'task';

export type BlockType =
  | 'hard_rule'    // 强制约束，违反则身份错乱/数据污染
  | 'safety'       // 安全边界，防止不当内容
  | 'identity'     // 身份定义，定义"我是谁"
  | 'memory'       // 记忆片段，情感背景参考
  | 'knowledge'    // 知识库信息，事实性参考
  | 'persona'      // 人设风格，说话方式
  | 'emotion'      // 情感状态，情绪基调
  | 'task';        // 任务指令，当前要做什么

export interface PromptBlock {
  /** 唯一标识，用于去重和冲突检测 */
  id: string;
  /** 块类型，决定优先级和排序位置 */
  type: BlockType;
  /** 优先级（0-1000），越高越靠前注入。同优先级按 type 默认排序 */
  priority: number;
  /** 来源模块标识，用于审计 */
  source: string;
  /** 适用的会话模式 */
  modeScope: ChatModeKind[];
  /** 注入的文本内容 */
  content: string;
  /** 冲突策略: override 覆盖同id旧块, merge 拼接, drop_if_conflict 有冲突时丢弃 */
  conflictPolicy?: 'override' | 'merge' | 'drop_if_conflict';
}

// ── type 默认优先级排序 ──
const TYPE_ORDER: Record<BlockType, number> = {
  hard_rule: 0,   // 最先 — 底层约束
  safety: 1,
  identity: 2,
  task: 3,
  emotion: 4,
  memory: 5,
  knowledge: 6,
  persona: 7,     // 最后 — 风格在约束之后
};

export interface AssemblyOptions {
  /** 当前会话模式 */
  mode: ChatModeKind;
  /** 总字符上限（默认 8000） */
  maxChars?: number;
  /** 是否启用冲突日志 */
  logConflicts?: boolean;
}

export interface AssemblyResult {
  /** 最终渲染文本 */
  text: string;
  /** 注入的块列表（按渲染顺序） */
  blocks: PromptBlock[];
  /** 被过滤/冲突丢弃的块 */
  dropped: Array<{ block: PromptBlock; reason: string }>;
  /** 总字符数 */
  charCount: number;
}

/**
 * Prompt 组装器 — 单例，全局共享同一个 block 注册表
 */
export class PromptAssembler {
  private blocks: PromptBlock[] = [];

  /** 提交一个注入块 */
  add(block: PromptBlock): this {
    // 去重: 同 id 视为同一来源的更新
    const existing = this.blocks.findIndex(b => b.id === block.id);
    if (existing >= 0) {
      if (block.conflictPolicy === 'override') {
        this.blocks[existing] = block;
      } else if (block.conflictPolicy === 'merge') {
        this.blocks[existing].content += '\n' + block.content;
      }
      // drop_if_conflict: 不添加
    } else {
      this.blocks.push(block);
    }
    return this;
  }

  /** 批量提交 */
  addAll(blocks: PromptBlock[]): this {
    for (const b of blocks) this.add(b);
    return this;
  }

  /** 渲染最终 Prompt */
  render(opts: AssemblyOptions): AssemblyResult {
    const { mode, maxChars = 8000, logConflicts = false } = opts;

    // ① 过滤: 只保留匹配当前 mode 的块
    const applicable = this.blocks.filter(b => b.modeScope.includes(mode));
    const dropped: AssemblyResult['dropped'] = [];

    // ② 检测冲突
    const seenIds = new Set<string>();
    const resolved: PromptBlock[] = [];
    for (const b of applicable) {
      if (seenIds.has(b.id)) {
        if (b.conflictPolicy === 'override') {
          const idx = resolved.findIndex(r => r.id === b.id);
          if (idx >= 0) resolved[idx] = b;
        } else {
          dropped.push({ block: b, reason: `duplicate id "${b.id}" with conflictPolicy=${b.conflictPolicy || 'drop_if_conflict'}` });
        }
        if (logConflicts) console.warn(`[PromptAssembler] 冲突: ${b.id} (${b.source})`);
        continue;
      }
      seenIds.add(b.id);
      resolved.push(b);
    }

    // ③ 排序: priority DESC, then type_order ASC
    resolved.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    });

    // ④ 渲染 + 截断
    let text = '';
    let charCount = 0;
    const rendered: PromptBlock[] = [];

    for (const b of resolved) {
      const content = b.content.trim();
      if (!content) continue;
      if (charCount + content.length > maxChars) {
        dropped.push({ block: b, reason: `超过字符上限 (${charCount}+${content.length} > ${maxChars})` });
        continue;
      }
      text += (text ? '\n\n' : '') + content;
      charCount += content.length + 2;
      rendered.push(b);
    }

    return { text, blocks: rendered, dropped, charCount };
  }

  /** 清空所有块 */
  clear(): void {
    this.blocks = [];
  }

  /** 获取当前注册的块数量（用于调试） */
  get size(): number {
    return this.blocks.length;
  }
}

// ── 块工厂函数 — 减少样板代码 ──

/** 创建 hard_rule 块 */
export function hardRule(id: string, content: string, modes: ChatModeKind[] = ['normal', 'entity_meeting'], priority = 1000): PromptBlock {
  return { id, type: 'hard_rule', priority, source: 'chat.ts', modeScope: modes, content, conflictPolicy: 'override' };
}

/** 创建 safety 块 */
export function safetyBlock(id: string, content: string, modes: ChatModeKind[] = ['normal', 'entity_meeting', 'roleplay'], priority = 900): PromptBlock {
  return { id, type: 'safety', priority, source: 'chat.ts', modeScope: modes, content, conflictPolicy: 'override' };
}

/** 创建 identity 块 */
export function identityBlock(id: string, content: string, modes: ChatModeKind[] = ['normal', 'secretary'], priority = 800): PromptBlock {
  return { id, type: 'identity', priority, source: 'chat.ts', modeScope: modes, content, conflictPolicy: 'override' };
}

/** 创建 memory 块 */
export function memoryBlock(id: string, content: string, modes: ChatModeKind[] = ['normal'], priority = 500): PromptBlock {
  return { id, type: 'memory', priority, source: 'MemoryInjector', modeScope: modes, content, conflictPolicy: 'override' };
}

/** 创建 knowledge 块 */
export function knowledgeBlock(id: string, content: string, modes: ChatModeKind[] = ['normal', 'entity_meeting'], priority = 400): PromptBlock {
  return { id, type: 'knowledge', priority, source: 'KnowledgeEngine', modeScope: modes, content, conflictPolicy: 'merge' };
}

/** 创建 persona 块 */
export function personaBlock(id: string, content: string, modes: ChatModeKind[] = ['normal'], priority = 300): PromptBlock {
  return { id, type: 'persona', priority, source: 'chat.ts', modeScope: modes, content, conflictPolicy: 'override' };
}

// ── 预定义 type→优先级默认值 ──
export const DEFAULT_PRIORITY: Record<BlockType, number> = {
  hard_rule: 1000,
  safety: 900,
  identity: 800,
  task: 700,
  emotion: 600,
  memory: 500,
  knowledge: 400,
  persona: 300,
};

export default PromptAssembler;
