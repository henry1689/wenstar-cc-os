/**
 * IStorageProvider — 持久化接口抽象
 *
 * 上层模块仅依赖此接口，不关心底层实现。
 * 当前实现：SQLiteStorage（基于 sql.js）
 * S3 替换：SQLite Wasm + OPFS（只需新增实现类）
 */
export interface IStorageProvider {
  /** 读取单条记录 */
  get<T>(key: string): Promise<T | null>;

  /** 写入单条记录 */
  set<T>(key: string, value: T): Promise<void>;

  /** 执行 SQL 查询 */
  query<T>(sql: string, params?: any[]): Promise<T[]>;

  /** 事务执行 */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
