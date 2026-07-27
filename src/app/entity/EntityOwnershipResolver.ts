/**
 * EntityOwnershipResolver — 统一实体归属解析器 (V12.0 P0-4)
 * =============================================================
 * 替代分散在 persistence-stage 和 SQLiteAdapter 回填中的独立 resolveBelongUUID 逻辑。
 * 所有 belong_entity_uuid 标注必须经过此解析器。
 *
 * 设计原则:
 *   - 单一真相源: 全部写入路径使用同一个解析器
 *   - 分级解析: 显式指名 > entity_genes 匹配 > 自称检测 > null
 *   - 可审计: 每次解析记录来源（src字段），供 UUID Health Report 统计
 */

import type { EntityGene } from '../../m1/types/dna.js';

export interface OwnershipResult {
  /** 解析出的实体 UUID，null 表示无法归属 */
  uuid: string | null;
  /** 解析来源（用于审计） */
  src: 'explicit_mention' | 'entity_genes' | 'self_ref' | 'fallback_name' | 'none';
  /** 关联的实体名 */
  entityName?: string;
}

/** 自称检测模式 */
const SELF_REF_PATTERNS = [
  /我是([一-龥]{2,4})[，。！？\s]/,
  /我就是([一-龥]{2,4})/,
  /我叫([一-龥]{2,4})/,
  /([一-龥]{2,4})来了[，。！？\s]/,
  /([一-龥]{2,4})在呢/,
  /是([一-龥]{2,4})呀[，。！？\s]/,
];

/**
 * 解析一段文本所属的实体 UUID。
 *
 * @param text     要归属的文本（用户消息或助手回复）
 * @param genes    M1 DNA entity_genes（当前消息提到的实体列表）
 * @param fg       FamilyGraph 实例（需有 getUUIDByName 方法）
 * @param role     文本角色（'user' | 'assistant'）— 助手回复额外做自称检测
 * @returns 归属结果
 */
export function resolveOwnership(
  text: string,
  genes: EntityGene[],
  fg: any,
  role: 'user' | 'assistant' = 'user',
): OwnershipResult {
  // ① entity_genes 匹配：取第一个 person 类型实体
  const firstPerson = genes?.find(
    (g: any) => g.type === 'person' && g.name && g.name !== '我' && g.name.length >= 2,
  );
  if (firstPerson) {
    try {
      const uuid = fg?.getUUIDByName?.(firstPerson.name);
      if (uuid) return { uuid, src: 'entity_genes', entityName: firstPerson.name };
    } catch { /* fall through */ }
  }

  // ② 助手回复自称检测
  if (role === 'assistant') {
    for (const pattern of SELF_REF_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const name = match[1];
        if (name && name.length >= 2) {
          try {
            const uuid = fg?.getUUIDByName?.(name);
            if (uuid) return { uuid, src: 'self_ref', entityName: name };
          } catch { /* fall through */ }
        }
      }
    }
  }

  // ③ 显式指名：文本中直接包含已知实体名前缀
  if (fg?.getAllPersonNames) {
    try {
      const allNames: string[] = fg.getAllPersonNames();
      for (const name of allNames) {
        if (name.length >= 2 && text.includes(name)) {
          try {
            const uuid = fg.getUUIDByName?.(name);
            if (uuid) return { uuid, src: 'explicit_mention', entityName: name };
          } catch { /* continue */ }
        }
      }
    } catch { /* fall through */ }
  }

  // ④ 无法归属
  return { uuid: null, src: 'none' };
}

/**
 * 批量解析 — 对多条文本返回各自的归属结果
 */
export function resolveBatch(
  items: Array<{ text: string; genes: EntityGene[]; role: 'user' | 'assistant' }>,
  fg: any,
): OwnershipResult[] {
  return items.map(item => resolveOwnership(item.text, item.genes, fg, item.role));
}

export default { resolveOwnership, resolveBatch };
