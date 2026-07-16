/**
 * UUIDGatekeeper — 动态门阀白名单过滤器
 *
 * 定位：挂载于天权海马体检索入口的逻辑隔离闸门。
 * 不与存储层交互——不复制数据、不创建索引——仅在检索结果返回后进行过滤。
 *
 * 架构原则：
 * - 门阀未激活（whitelist 为 null）→ 全部放行（兼容旧模式）
 * - 门阀激活（whitelist 非空数组）→ 仅放行白名单 UUID + PUBLIC 级数据
 * - 会话结束 → clearSession() → 白名单置 null
 *
 * 安全声明（见 fg-kinship-redlines.md §18.5）：
 * ① 门阀仅拦截检索，不修改存储
 * ② 门阀逻辑不可被任何模块绕过
 * ③ 临时跨 UUID 授权在会话结束时全部失效
 */

import type { FamilyGraph } from './FamilyGraph.js';

/** 会话统计 */
interface SessionStats {
  total: number;
  allowed: number;
  blocked: number;
}

/** family_context / social_context 成员结构 */
interface FGMember {
  entity: string;
  relation?: string;
  [key: string]: any;
}

export class UUIDGatekeeper {
  /** null = 门阀未激活（全部放行），Set = 门阀激活 */
  private whitelist: Set<string> | null = null;
  private familyGraph: FamilyGraph;
  private sessionStats: SessionStats = { total: 0, allowed: 0, blocked: 0 };

  /** 缓存：人名 → UUID，避免反复查库 */
  private nameToUUIDCache = new Map<string, string | null>();

  constructor(familyGraph: FamilyGraph) {
    this.familyGraph = familyGraph;
  }

  // ═══════════════════════════════════════════════════════════════
  // 会话白名单管理
  // ═══════════════════════════════════════════════════════════════

  /** 设定会话白名单（覆盖旧值） */
  setSessionWhitelist(uuids: string[]): void {
    if (!uuids || uuids.length === 0) {
      this.whitelist = null;
      return;
    }
    this.whitelist = new Set(uuids.filter(Boolean));
    this.sessionStats = { total: 0, allowed: 0, blocked: 0 };
    this.nameToUUIDCache.clear();
  }

  /** 追加单个 UUID 到白名单（多人同框场景） */
  addToWhitelist(uuid: string): void {
    if (!uuid) return;
    if (!this.whitelist) this.whitelist = new Set();
    this.whitelist.add(uuid);
  }

  /** 从白名单移除单个 UUID */
  removeFromWhitelist(uuid: string): void {
    if (this.whitelist) {
      this.whitelist.delete(uuid);
      if (this.whitelist.size === 0) this.whitelist = null;
    }
  }

  /** 清空会话白名单（门阀停用） */
  clearSession(): void {
    this.whitelist = null;
    this.sessionStats = { total: 0, allowed: 0, blocked: 0 };
    this.nameToUUIDCache.clear();
  }

  /** 获取当前白名单（null = 未激活） */
  getWhitelist(): string[] | null {
    if (!this.whitelist) return null;
    return [...this.whitelist];
  }

  /** 门阀是否激活 */
  isActive(): boolean {
    return this.whitelist !== null && this.whitelist.size > 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // 核心过滤方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 检查逗号分隔的实体名列表中是否有白名单内的 UUID。
   *
   * @param entityNamesStr - fg_entity_names 字段值，如 "徐诗雨,林土锋"
   * @returns 是否应放行
   */
  filterByEntityNames(entityNamesStr: string | null | undefined): boolean {
    if (!this.isActive()) return true;
    if (!entityNamesStr) return true; // 无实体标记的记忆放行

    const names = entityNamesStr.split(',').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return true;

    for (const name of names) {
      const uuid = this._resolveUUID(name);
      if (uuid && this.whitelist!.has(uuid)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 过滤记忆列表（DNA[] 类型）
   * 依赖 fg_entity_names 字段进行过滤。
   */
  filterMemories<T extends { fg_entity_names?: string; entity_genes?: any; raw_input?: string }>(
    memories: T[]
  ): T[] {
    if (!this.isActive()) return memories;

    const allowed: T[] = [];
    for (const m of memories) {
      // 先查 fg_entity_names（逗号分隔的人名）
      const fgNames = (m as any).fg_entity_names || '';
      if (this.filterByEntityNames(fgNames)) {
        allowed.push(m);
        this.sessionStats.allowed++;
      } else {
        // 次级检查：entity_genes JSON 中的 entity name
        let entityNames: string[] = [];
        try {
          const genes = typeof (m as any).entity_genes === 'string'
            ? JSON.parse((m as any).entity_genes)
            : (m as any).entity_genes;
          if (Array.isArray(genes)) {
            entityNames = genes.map((g: any) => g.name).filter(Boolean);
          }
        } catch { /* 解析失败不影响过滤 */ }

        const hasMatch = entityNames.some(name => {
          const uuid = this._resolveUUID(name);
          return uuid && this.whitelist!.has(uuid);
        });

        if (hasMatch) {
          allowed.push(m);
          this.sessionStats.allowed++;
        } else {
          this.sessionStats.blocked++;
        }
      }
    }
    return allowed;
  }

  /**
   * 过滤 FG 成员列表（family_context / social_context 中的 {entity: string} 数组）
   */
  filterFGMembers<T extends { entity: string }>(members: T[]): T[] {
    if (!this.isActive()) return members;

    return members.filter(m => {
      const uuid = this._resolveUUID(m.entity);
      const allowed = !uuid || this.whitelist!.has(uuid);
      if (allowed) this.sessionStats.allowed++;
      else this.sessionStats.blocked++;
      return allowed;
    });
  }

  /**
   * 限制实体名列表为白名单内的人物。
   * 用于 KnowledgeContextBuilder 的 entity overlap 搜索。
   */
  restrictEntityNames(entityNames: string[]): string[] {
    if (!this.isActive()) return entityNames;
    if (!entityNames || entityNames.length === 0) return [];

    return entityNames.filter(name => {
      const uuid = this._resolveUUID(name);
      return !uuid || this.whitelist!.has(uuid);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 统计
  // ═══════════════════════════════════════════════════════════════

  getSessionStats(): SessionStats {
    return { ...this.sessionStats };
  }

  resetSessionStats(): void {
    this.sessionStats = { total: 0, allowed: 0, blocked: 0 };
  }

  // ═══════════════════════════════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════════════════════════════

  /** 人名 → UUID（带缓存） */
  private _resolveUUID(name: string): string | null {
    if (!name) return null;
    const cached = this.nameToUUIDCache.get(name);
    if (cached !== undefined) return cached;

    let uuid: string | null = null;
    try {
      uuid = (this.familyGraph as any).getUUIDByName?.(name) || null;
    } catch {
      uuid = null;
    }
    this.nameToUUIDCache.set(name, uuid);
    return uuid;
  }
}

export default UUIDGatekeeper;
