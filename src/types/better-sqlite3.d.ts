declare module 'better-sqlite3' {
  interface Statement {
    get(...params: any[]): any;
    all(...params: any[]): any[];
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  }

  interface Database {
    pragma(sql: string): unknown;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }

  interface Options {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (...messages: any[]) => void;
    nativeBinding?: string | undefined;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Options): Database;
  }

  const Database: DatabaseConstructor;

  namespace Database {
    export { Database, Statement, Options };
  }

  export default Database;
}
