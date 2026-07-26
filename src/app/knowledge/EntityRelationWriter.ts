/**
 * EntityRelationWriter — 实体关系写入专用服务
 *
 * 🔴 C-2: 将 chat.ts L384-406 中 sqlite.writeRaw(...) 实体关系操作
 * 迁移到已有模块 RelationshipExtractor 所在的服务层。
 *
 * 🚨 全局规则 5: SQLiteAdapter 为唯一持久写入通道
 *    — EntityRelationWriter 通过注入的 sqlite 实例写入，不绕过 SQLiteAdapter
 */

export interface SQLiteLike {
  queryAll(sql: string, params?: any[]): any[];
  writeRaw(sql: string, params?: any[]): any;
}

export class EntityRelationWriter {
  private sqlite: SQLiteLike;

  constructor(sqlite: SQLiteLike) {
    this.sqlite = sqlite;
  }

  /**
   * 确保实体存在于 entities 表中，返回实体 ID。
   * 如果已存在则返回已有 ID，否则创建后返回新 ID。
   */
  ensureEntity(name: string, type: string = 'object'): number | null {
    // 清洗名为标准格式（去除程度副词前缀）
    const cleaned = name.replace(/^(很|比较|非常|有点)+/, '').substring(0, 20);
    const exist = this.sqlite.queryAll('SELECT id FROM entities WHERE name = ? AND type = ?', [cleaned, type]);
    if (exist.length > 0) {
      return (exist[0] as any).id;
    }
    this.sqlite.writeRaw('INSERT INTO entities (name, type) VALUES (?, ?)', [cleaned, type]);
    const newRows = this.sqlite.queryAll('SELECT id FROM entities WHERE name = ? AND type = ?', [cleaned, type]);
    return (newRows[0] as any)?.id ?? null;
  }

  /**
   * 添加人物与特征的关系边
   * 🔴 "只增不删"铁律: INSERT OR IGNORE
   */
  addFeatureRelation(personName: string, featureName: string, featureType: string = 'object'): void {
    const featId = this.ensureEntity(featureName, featureType);
    if (!featId) return;

    const personEntity = this.sqlite.queryAll(
      "SELECT id FROM entities WHERE name = ? AND type = 'person'",
      [personName]
    );
    if (personEntity.length === 0) return;

    this.sqlite.writeRaw(
      "INSERT OR IGNORE INTO entity_relations (entity_a_id, entity_b_id, relation, strength, updated_at) VALUES (?, ?, 'has_feature', 0.5, ?)",
      [personEntity[0].id, featId, new Date().toISOString()]
    );
  }
}

/**
 * 从 StorageAdapter 创建 EntityRelationWriter
 */
export function createEntityRelationWriter(storage?: { getSQLite?: () => SQLiteLike }): EntityRelationWriter | null {
  if (!storage) return null;
  const sqlite = storage.getSQLite?.();
  if (!sqlite) return null;
  return new EntityRelationWriter(sqlite);
}
