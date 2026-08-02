// ============================================================
// Agent CNC Harness — 共享 Fixture / Helper
// 用于 CLI 子命令测试：创建 temp project + .agent-cnc/ + plan/report 文件
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import type { MeterResult } from '../../../types.js';

// ---- 临时目录 ----

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-cmds-'));
}

export function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---- YAML 常量 ----

export const CONFIG_YAML = `agent_cnc:
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

export const RISK_MAP_YAML = `risk_map:
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

export function harnessYaml(): string {
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

// ---- Fixture Setup ----

/** 创建完整最小合法 .agent-cnc/，返回 rootDir */
export function setupValidFixture(): string {
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

// ---- Plan / Report helpers ----

/** 写一个包含所有必需章节的合法 Plan 文件，返回文件路径 */
export function writeValidPlan(rootDir: string, fileName = 'current-plan.md'): string {
  const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const planPath = path.join(reportsDir, fileName);
  fs.writeFileSync(
    planPath,
    [
      '## 修改目标',
      '修复 chat.ts 注入点安全问题',
      '',
      '## 涉及文件',
      '- src/webui/chat.ts',
      '',
      '## 风险分析',
      '- S 级资产，22 个注入点需逐点审查',
      '',
      '## 验证计划',
      '- 运行全量测试',
      '- 人工 review diff',
      '',
      '## 回滚方案',
      '- git revert 提交',
    ].join('\n'),
    'utf-8',
  );
  return planPath;
}

/** 在 temp dir 中写入一个合法的 latest-result.json */
export function writeLatestResult(rootDir: string, overrides: Record<string, unknown> = {}): void {
  const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const data = {
    project: 'WenStarOS',
    mode: 'offline_deterministic_guard',
    result: 'PASS',
    overallRisk: 'low',
    changedFiles: [],
    triggeredWorkflows: [],
    commandResults: [],
    meterResults: [],
    deviation: {},
    gateDecision: 'PASS',
    requiredHumanReview: [],
    nextSteps: [],
    ...overrides,
  };
  fs.writeFileSync(
    path.join(reportsDir, 'latest-result.json'),
    JSON.stringify(data, null, 2),
    'utf-8',
  );
}

/** 在 temp dir 写入一个最小 package.json */
export function writePkgJson(rootDir: string): void {
  fs.writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({
      name: 'test',
      devDependencies: {
        typescript: '^5.0',
        vitest: '^3.0',
        tsx: '^4.0',
      },
    }),
    'utf-8',
  );
}

// ---- Git helpers ----

/** 在 temp dir 中初始化 git repo，让 isGitRepo() 返回 true */
export function initGitRepo(rootDir: string): void {
  try {
    execSync('git init', { cwd: rootDir, stdio: 'pipe' });
    execSync('git config user.email "test@test"', { cwd: rootDir, stdio: 'pipe' });
    execSync('git config user.name "test"', { cwd: rootDir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', { cwd: rootDir, stdio: 'pipe' });
  } catch {
    // skip — git 不可用时测试会fallback到"Git不可用"路径
  }
}

// ---- Meter helpers ----

/** 快速构造 PASS MeterResult */
export function meterPass(id: string, title: string, severity: 'S' | 'A' | 'B' | 'C' = 'S'): MeterResult {
  return { id, title, severity, status: 'pass', score: 100, evidence: [], warnings: [], failures: [] };
}

/** 快速构造 WARN MeterResult */
export function meterWarn(id: string, title: string, severity: 'S' | 'A' | 'B' | 'C' = 'A'): MeterResult {
  return { id, title, severity, status: 'warn', score: 50, evidence: [], warnings: [`${title}: 建议人工审查`], failures: [] };
}

/** 快速构造 FAIL MeterResult */
export function meterFail(id: string, title: string, severity: 'S' | 'A' | 'B' | 'C' = 'S'): MeterResult {
  return { id, title, severity, status: 'fail', score: 0, evidence: [], warnings: [], failures: [`${title}: 结构性断链`] };
}
