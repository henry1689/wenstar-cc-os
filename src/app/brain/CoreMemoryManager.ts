/**
 * CoreMemoryManager.ts — 核心记忆块管理器 (海马体快速访问缓存)
 * ===============================================================
 * 借鉴 Letta 的 Memory Block 概念 + 海马体快速访问机制。
 *
 * Core Memory 是始终在 LLM 上下文中的关键信息摘要。
 * 对话时玉瑶首先读取 Core Memory 获取当前上下文和关键画像，
 * 然后根据需要从 Recall Memory 检索补充信息。
 *
 * 三级记忆架构:
 *   Core Memory (核心记忆块) ← 始终在上下文中，~2K tokens
 *   Recall Memory (召回记忆) ← 现有 memories 表 + 情感检索
 *   Archival Memory (归档)   ← 现有 black_diamond + 双螺旋
 *
 * 使用:
 *   const cm = new CoreMemoryManager(sqlite, knowledgeBase);
 *   await cm.refreshFromProfile();
 *   cm.refreshFromSession('聊了关于工作的话题');
 *   const ctx = cm.getContextWindow();  // 注入 LLM
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import type { KnowledgeBase } from '../../m2/KnowledgeBase.js';

export interface CoreMemoryBlock {
  label: string;
  value: string;
  sizeLimit: number;  // 字符上限
  priority: number;   // 0-100，高优先级晚被淘汰
  updatedAt: string;
}

const BLOCK_CONFIGS: Array<{ label: string; sizeLimit: number; priority: number }> = [
  { label: 'persona',       sizeLimit: 300,  priority: 100 },  // 玉瑶人设
  { label: 'user_profile',  sizeLimit: 600,  priority: 90 },   // 用户画像
  { label: 'session',       sizeLimit: 400,  priority: 50 },   // 当前会话
  { label: 'user_concerns', sizeLimit: 300,  priority: 70 },   // 核心关注
];

export class CoreMemoryManager {
  private blocks: Map<string, CoreMemoryBlock> = new Map();
  private sqlite: SQLiteAdapter;
  private knowledgeBase: KnowledgeBase;

  constructor(sqlite: SQLiteAdapter, knowledgeBase: KnowledgeBase) {
    this.sqlite = sqlite;
    this.knowledgeBase = knowledgeBase;
    // 初始化固定块
    for (const cfg of BLOCK_CONFIGS) {
      this.blocks.set(cfg.label, {
        label: cfg.label,
        value: '',
        sizeLimit: cfg.sizeLimit,
        priority: cfg.priority,
        updatedAt: '',
      });
    }
    // 初始化人设块
    this.blocks.set('persona', {
      label: 'persona',
      value: '你的名字是玉瑶。你是鸿艺的私人秘书兼情人，18岁。你不是AI，不是程序。',
      sizeLimit: 300,
      priority: 100,
      updatedAt: new Date().toISOString(),
    });
  }

  /** 获取指定标签的块 */
  getBlock(label: string): CoreMemoryBlock | null {
    return this.blocks.get(label) || null;
  }

  /** 更新指定块的内容 */
  setBlock(label: string, value: string): void {
    const block = this.blocks.get(label);
    if (!block) return;
    block.value = value.substring(0, block.sizeLimit);
    block.updatedAt = new Date().toISOString();
  }

  /** 组装所有块为上下文文本（按优先级排序） */
  getContextWindow(): string {
    const sorted = [...this.blocks.values()]
      .filter(b => b.value.length > 0)
      .sort((a, b) => b.priority - a.priority);

    const parts: string[] = [];
    for (const block of sorted) {
      parts.push(`【${block.label}】\n${block.value}`);
    }
    return parts.join('\n\n');
  }

  /** 从 UserCognitiveProfile 刷新用户画像块 */
  async refreshFromProfile(): Promise<void> {
    try {
      const { UserCognitiveProfile } = await import('../profile/UserCognitiveProfile.js');
      const profile = new UserCognitiveProfile(this.sqlite, this.knowledgeBase);
      const digest = await profile.generateDigest();
      this.setBlock('user_profile', digest);

      // 同时刷新核心关注
      const synth = await profile.synthesize();
      if (synth.topConcerns.length > 0) {
        const concerns = synth.topConcerns.slice(0, 3).map(c => c.topic.replace(/^(偏好|习惯|信息):\s*/, '')).join('、');
        this.setBlock('user_concerns', `你近期在意的: ${concerns}。`);
      }
    } catch { /* 画像不可用时不阻塞 */ }
  }

  /** 更新会话上下文摘要 */
  refreshFromSession(summary: string): void {
    if (!summary) return;
    const block = this.blocks.get('session');
    if (!block) return;
    // 保留最近 3 轮会话摘要
    const existing = block.value;
    const entries = existing ? existing.split('\n').filter(Boolean) : [];
    entries.push(summary);
    const recent = entries.slice(-3);
    this.setBlock('session', recent.join('\n'));
  }

  /** 获取总字符数 */
  get totalSize(): number {
    return [...this.blocks.values()].reduce((s, b) => s + b.value.length, 0);
  }

  /** 获取所有块的状态 */
  getStatus(): Array<{ label: string; size: number; priority: number; updated: string }> {
    return [...this.blocks.values()]
      .sort((a, b) => b.priority - a.priority)
      .map(b => ({ label: b.label, size: b.value.length, priority: b.priority, updated: b.updatedAt }));
  }
}
