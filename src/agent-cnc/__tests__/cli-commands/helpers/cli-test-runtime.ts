// ============================================================
// Agent CNC Harness — 共享 TestRuntime
// 用于 CLI 子命令测试：捕获输出 + mock 外部依赖
// ============================================================

import type { CliRuntime } from '../../../cli.js';
import type { CommandResult, MeterResult, HarnessContext } from '../../../types.js';

export class TestRuntime implements CliRuntime {
  logs: string[] = [];
  errors: string[] = [];
  exitCode: number | null = null;
  /** Mock tsc 结果。默认 PASS，可注入自定义结果。 */
  mockTscResult: CommandResult | null = null;
  /** Mock vitest 结果。默认 PASS，可注入自定义结果。 */
  mockVitestResult: CommandResult | null = null;
  /** Mock changed files。测试注入避免真实 git 执行。 */
  mockChangedFiles: string[] = [];
  /** Mock --base changed files。测试注入避免真实 git 执行。 */
  mockChangedFilesSince: string[] = [];
  /** 记录 runTypeCheck 调用次数和 cwd */
  typecheckCalls: string[] = [];
  /** 记录 runVitest 调用次数和 cwd */
  vitestCalls: string[] = [];
  /** 记录 getChangedFiles 调用次数和 cwd */
  changedFilesCalls: string[] = [];
  /** 记录 getChangedFilesSince 调用 */
  changedFilesSinceCalls: Array<{ base: string; cwd: string }> = [];
  /** Mock meter 结果。默认空数组（无 meter 执行）。 */
  mockMeterResults: MeterResult[] = [];
  /** 记录 runMeters 调用参数 */
  meterCalls: Array<{ ids: string[]; context: HarnessContext }> = [];

  constructor(private _cwd: string) {}

  cwd(): string {
    return this._cwd;
  }

  log(...args: unknown[]): void {
    this.logs.push(args.join(' '));
  }

  error(...args: unknown[]): void {
    this.errors.push(args.join(' '));
  }

  exit(code: number): never {
    this.exitCode = code;
    throw new Error(`EXIT:${code}`);
  }

  runTypeCheck(_cwd?: string): CommandResult {
    this.typecheckCalls.push(_cwd ?? '');
    return this.mockTscResult ?? {
      command: 'npx tsc --noEmit',
      exitCode: 0,
      stdout: 'mock tsc pass',
      stderr: '',
      durationMs: 10,
    };
  }

  runVitest(_cwd?: string): CommandResult {
    this.vitestCalls.push(_cwd ?? '');
    return this.mockVitestResult ?? {
      command: 'npx vitest run',
      exitCode: 0,
      stdout: 'mock vitest pass',
      stderr: '',
      durationMs: 10,
    };
  }

  getChangedFiles(_cwd?: string): string[] {
    this.changedFilesCalls.push(_cwd ?? '');
    return this.mockChangedFiles;
  }

  getChangedFilesSince(base: string, _cwd?: string): string[] {
    this.changedFilesSinceCalls.push({ base, cwd: _cwd ?? '' });
    return this.mockChangedFilesSince;
  }

  async runMeters(ids: string[], context: HarnessContext): Promise<MeterResult[]> {
    this.meterCalls.push({ ids, context });
    return this.mockMeterResults;
  }

  /** 把所有 log 行拼接为一个字符串，方便断言 */
  logText(): string {
    return this.logs.join('\n');
  }
}
