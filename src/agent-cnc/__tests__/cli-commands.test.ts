// ============================================================
// Agent CNC Harness — CLI 子命令 单元测试
// 覆盖: cmdValidate（配置校验）, cmdScan（变更扫描）
// 策略: TestRuntime 注入 + temp dir fixture
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { cmdValidate, cmdScan, parseArgs } from '../cli.js';
import type { CliRuntime } from '../cli.js';

// ============================================================
// TestRuntime — 捕获所有输出，取代 process.exit
// ============================================================

class TestRuntime implements CliRuntime {
  logs: string[] = [];
  errors: string[] = [];
  exitCode: number | null = null;

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

  /** 把所有 log 行拼接为一个字符串，方便断言 */
  logText(): string {
    return this.logs.join('\n');
  }
}

// ============================================================
// Fixture — 完整最小 .agent-cnc/
// ============================================================

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-cmds-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

const CONFIG_YAML = `agent_cnc:
  version: "0.1"
  project: "WenStarOS"
  runtime:
    mode: "auto"
    offline_deterministic_guard: true
    online_llm_enhanced: false
    fallback_to_offline: true
  llm:
    enabled: false
    providers: []
  privacy:
    level: "strict"
`;

const RISK_MAP_YAML = `risk_map:
  version: "0.1"
  high_risk:
    severity: "S"
    require_plan: true
    require_human_approval: true
    files:
      - path: "src/webui/chat.ts"
        reason: "聊天中枢，22 注入点"
  medium_risk:
    severity: "A"
    require_plan: "recommended"
    files:
      - "src/m3/PerceptionAnalyzer.ts"
  low_risk:
    severity: "B"
    allow_direct_patch: true
    path_patterns:
      - "**/__tests__/**"
`;

function harnessYaml(): string {
  return [
    'agent_cnc_harness:',
    '  version: "0.1"',
    '  project: "test"',
    '  commands:',
    '    typecheck: "npx tsc --noEmit"',
    '    test_all: "npx vitest run"',
    '    health_check: "echo ok"',
    '    sandbox: "echo ok"',
    '  trigger_workflows:',
    '    - id: "chat_ts_change"',
    '      when_any_changed:',
    '        - "src/webui/chat.ts"',
    '        - "src/webui/chat/**"',
    '      workflow: "workflows/chat-ts-change.yaml"',
    '      meters:',
    '        - "prompt-meter"',
    '        - "meeting-mode-meter"',
    '    - id: "roleplay_change"',
    '      when_any_changed:',
    '        - "src/app/role/**"',
    '        - "src/**/RoleplayPromptBuilder.ts"',
    '        - "src/**/PromptAssembler.ts"',
    '      workflow: "workflows/roleplay-change.yaml"',
    '      meters:',
    '        - "roleplay-isolation-meter"',
    '        - "fg-meter"',
    '    - id: "sqlite_change"',
    '      when_any_changed:',
    '        - "src/m2/SQLiteAdapter.ts"',
    '        - "src/**/ConversationDB.ts"',
    '      workflow: "workflows/sqlite-change.yaml"',
    '      meters:',
    '        - "persist-meter"',
    '  gates:',
    '    block_on:',
    '      - "schema_invalid"',
    '      - "high_risk_without_plan"',
  ].join('\n');
}

const PROJECT_GENOME = 'project_genome:\n  schema_version: "0.1"\n  project:\n    name: "test"\n';
const PRECISION_SPEC = 'precision_spec:\n  version: "0.1"\n  specs: []\n';
const INSPECTION_MATRIX = 'inspection_matrix:\n  version: "0.1"\n  rows: []\n';
const REDLINE_YAML = 'redlines:\n  id: "test"\n  severity: "S"\n  rules: []\n';
const WORKFLOW_YAML = 'workflow:\n  id: "test"\n  title: "test"\n  risk_level: "low"\n  require_plan: false\n  required_redlines: []\n  required_meters: []\n  required_commands: []\n  required_evidence: []\n  gate:\n    block_on_fail: false\n';

const REDLINE_NAMES = [
  'fg-roleplay-redlines', 'chat-injection-points', 'meeting-propagation-chain',
  'uuid-ownership-rules', 'sqlite-persistence-rules', 'llm-provider-rules',
  'python-three-domain-rules',
];

const WORKFLOW_NAMES = [
  'low-risk-change', 'medium-risk-change', 'high-risk-change',
  'chat-ts-change', 'familygraph-change', 'uuid-chain-change',
  'meeting-mode-change', 'roleplay-change', 'sqlite-change',
  'llm-provider-change', 'python-domain-change',
];

/** 创建完整最小合法 .agent-cnc/，返回 rootDir */
function setupValidFixture(): string {
  const rootDir = makeTempDir();
  const cncDir = path.join(rootDir, '.agent-cnc');
  fs.mkdirSync(cncDir, { recursive: true });

  // 6 核心 YAML
  writeFile(path.join(cncDir, 'config.yaml'), CONFIG_YAML);
  writeFile(path.join(cncDir, 'harness.yaml'), harnessYaml());
  writeFile(path.join(cncDir, 'risk-map.yaml'), RISK_MAP_YAML);
  writeFile(path.join(cncDir, 'project-genome.yaml'), PROJECT_GENOME);
  writeFile(path.join(cncDir, 'precision-spec.yaml'), PRECISION_SPEC);
  writeFile(path.join(cncDir, 'inspection-matrix.yaml'), INSPECTION_MATRIX);

  // 7 redlines
  const rlDir = path.join(cncDir, 'redlines');
  fs.mkdirSync(rlDir, { recursive: true });
  for (const name of REDLINE_NAMES) {
    writeFile(path.join(rlDir, `${name}.yaml`), REDLINE_YAML);
  }

  // 11 workflows
  const wfDir = path.join(cncDir, 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  for (const name of WORKFLOW_NAMES) {
    writeFile(path.join(wfDir, `${name}.yaml`), WORKFLOW_YAML);
  }

  // 目录
  fs.mkdirSync(path.join(cncDir, 'meters'), { recursive: true });
  fs.mkdirSync(path.join(cncDir, 'golden'), { recursive: true });
  fs.mkdirSync(path.join(cncDir, 'reports'), { recursive: true });

  return rootDir;
}

// ============================================================
// cmdValidate
// ============================================================

describe('cmdValidate', () => {
  it('场景 1: 完整合法 .agent-cnc/ → 日志含 "PASS"，不调用 exit', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);

    // cmdValidate 在失败时才 throw EXIT，这里应正常返回
    expect(() => cmdValidate(rt)).not.toThrow();

    expect(rt.logText()).toContain('Validation: PASS');
    expect(rt.logText()).toContain('[Agent CNC] Validate');
    expect(rt.exitCode).toBeNull();
    expect(rt.errors).toHaveLength(0);
  });

  it('场景 2: .agent-cnc/ 目录不存在 → exitCode=1，日志含 "FAIL"', () => {
    const rootDir = makeTempDir();
    // 不创建 .agent-cnc/
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Validation: FAIL');
    expect(rt.logText()).toContain('不存在');
  });

  it('场景 3: 缺少 harness.yaml → exitCode=1 + 列出缺失项', () => {
    const rootDir = setupValidFixture();
    fs.unlinkSync(path.join(rootDir, '.agent-cnc', 'harness.yaml'));
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Validation: FAIL');
    expect(rt.logText()).toContain('Missing files:');
  });

  it('场景 4: harness.yaml 语法错误 → exitCode=1 + Invalid YAML', () => {
    const rootDir = setupValidFixture();
    fs.writeFileSync(
      path.join(rootDir, '.agent-cnc', 'harness.yaml'),
      '{{{broken!!! yaml',
      'utf-8',
    );
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Invalid YAML:');
  });

  it('场景 5: harness.yaml 缺少 agent_cnc_harness 根字段 → FAIL + Missing fields', () => {
    const rootDir = setupValidFixture();
    fs.writeFileSync(
      path.join(rootDir, '.agent-cnc', 'harness.yaml'),
      'some_other_key:\n  foo: bar\n',
      'utf-8',
    );
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Missing fields:');
  });

  it('场景 6: risk-map.yaml 缺失 → exitCode=1 + 缺失列表', () => {
    const rootDir = setupValidFixture();
    fs.unlinkSync(path.join(rootDir, '.agent-cnc', 'risk-map.yaml'));
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Missing files:');
  });
});

// ============================================================
// cmdScan
// ============================================================

describe('cmdScan', () => {
  it('场景 7: --files 单文件 src/webui/chat.ts → 触发 chat_ts_change workflow', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'src/webui/chat.ts']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('[Agent CNC] Scan');
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('prompt-meter');
    expect(text).toContain('聊天中枢');
  });

  it('场景 8: --files 多文件 → 触发多个 workflow + Meter 聚合', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs([
      'scan',
      '--files',
      'src/webui/chat.ts,src/m5/RoleplayPromptBuilder.ts',
    ]);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('roleplay_change');
    // 两个 WF 的 meters 都有
    expect(text).toContain('prompt-meter');
    expect(text).toContain('roleplay-isolation-meter');

    // chat.ts 是 high risk
    expect(text).toContain('Overall Risk: HIGH');
  });

  it('场景 9: 无风险变更文件 → 不触发 WF，low risk', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'docs/readme.md']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    // 不匹配任何 risk 规则 → 默认 medium
    expect(text).toContain('Overall Risk: MEDIUM');
    expect(text).toContain('Require Plan: No');
    expect(text).toContain('(none)'); // no workflows, no meters
  });

  it('场景 10: --files 多个不触发文件 → 全部分类正确，无 WF', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    // 3 个文件都不匹配任何 risk/WF 规则
    const args = parseArgs(['scan', '--files', 'docs/a.md,scripts/b.sh,tools/c.py']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    // 全部默认 medium
    expect(text).toContain('Overall Risk: MEDIUM');
    expect(text).toContain('Require Plan: No');
    expect(text).toContain('(none)');
    // 3 个文件都列出
    expect(text).toContain('docs/a.md');
    expect(text).toContain('scripts/b.sh');
    expect(text).toContain('tools/c.py');
    expect(text).toContain('Report saved');

    // latest-scan.json 包含 3 个文件
    const scanPath = path.join(rootDir, '.agent-cnc', 'reports', 'latest-scan.json');
    const scan = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
    expect(scan.scanResult.files).toHaveLength(3);
    expect(scan.scanResult.triggeredWorkflows).toHaveLength(0);
  });

  it('场景 11: --files 含高风险文件 → requirePlan=YES 在输出中', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'src/webui/chat.ts,src/m3/PerceptionAnalyzer.ts']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    // 两个文件都列出
    expect(text).toContain('src/webui/chat.ts');
    expect(text).toContain('src/m3/PerceptionAnalyzer.ts');

    // latest-scan.json 写入
    const scanPath = path.join(rootDir, '.agent-cnc', 'reports', 'latest-scan.json');
    expect(fs.existsSync(scanPath)).toBe(true);
    const scan = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
    expect(scan.scanResult.overallRisk).toBe('high');
    expect(scan.scanResult.requirePlan).toBe(true);
    expect(Array.isArray(scan.scanResult.triggeredWorkflows)).toBe(true);
  });
});
