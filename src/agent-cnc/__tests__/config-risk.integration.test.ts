// ============================================================
// Agent CNC Harness — YAML → RouteRisks 全链路集成测试
// 验证: validateConfig → load → routeRisks 完整路径
// 策略: 临时 .agent-cnc/ 目录 + 真实 YAML 文件
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateConfig } from '../validators.js';
import { loadHarnessConfig, loadRiskMap } from '../config.js';
import { routeRisks } from '../risk-router.js';
import type { HarnessConfig, RiskMapConfig, ScanResult } from '../types.js';

// ---- 临时目录工具 ----

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-int-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---- YAML 内容 ----

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
    user_managed_api_key: true
    providers: []
    policy:
      allow_source_code_upload: false
      allow_docs_upload: true
      redact_secrets_before_send: true
      max_tokens_per_run: 200000
  privacy:
    level: "strict"
    allow_network: false
    allow_source_code_upload: false
    allow_docs_upload: true
    redact_secrets: true
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
      - path: "src/m5/DeepSeekLLMProvider.ts"
        reason: "LLM 输出清洁性"
  medium_risk:
    severity: "A"
    require_plan: "recommended"
    files:
      - "src/m3/PerceptionAnalyzer.ts"
      - "src/m4/MemoryRetriever.ts"
  low_risk:
    severity: "B"
    allow_direct_patch: true
    path_patterns:
      - "**/__tests__/**"
      - "src/config/**"
`;

/** 返回包含 roleplay 和 sqlite 触发规则的 harness.yaml */
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
    '        - "behavior-meter"',
    '    - id: "roleplay_change"',
    '      when_any_changed:',
    '        - "src/app/role/**"',
    '        - "src/**/RoleplayPromptBuilder.ts"',
    '        - "src/**/PromptAssembler.ts"',
    '      workflow: "workflows/roleplay-change.yaml"',
    '      meters:',
    '        - "roleplay-isolation-meter"',
    '        - "fg-meter"',
    '        - "behavior-meter"',
    '    - id: "sqlite_change"',
    '      when_any_changed:',
    '        - "src/m2/SQLiteAdapter.ts"',
    '        - "src/**/ConversationDB.ts"',
    '        - "scripts/**"',
    '      workflow: "workflows/sqlite-change.yaml"',
    '      meters:',
    '        - "persist-meter"',
    '        - "uuid-meter"',
    '  gates:',
    '    block_on:',
    '      - "schema_invalid"',
    '      - "high_risk_without_plan"',
    '  autonomy:',
    '    default_level: "A2"',
    '    max_level: "A4"',
    '    allow_auto_patch_for: ["docs", "tests", "config"]',
    '    require_human_approval_for:',
    '      - "chat_ts_change"',
    '      - "sqlite_change"',
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

// ---- Setup：创建完整最小 .agent-cnc/ 目录 ----

interface IntegrationFixture {
  rootDir: string;
  cncDir: string;
  harnessConfig: HarnessConfig;
  riskMap: RiskMapConfig;
}

/**
 * 创建集成测试 Fixture：临时 .agent-cnc/ + 加载验证 + 类型绑定
 * 返回可直接用于 routeRisks 的配置对象
 */
function setupIntegrationFixture(): IntegrationFixture {
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

  // redlines/
  const rlDir = path.join(cncDir, 'redlines');
  fs.mkdirSync(rlDir, { recursive: true });
  for (const name of REDLINE_NAMES) {
    writeFile(path.join(rlDir, `${name}.yaml`), REDLINE_YAML);
  }

  // workflows/
  const wfDir = path.join(cncDir, 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  for (const name of WORKFLOW_NAMES) {
    writeFile(path.join(wfDir, `${name}.yaml`), WORKFLOW_YAML);
  }

  // directories
  fs.mkdirSync(path.join(cncDir, 'meters'), { recursive: true });
  fs.mkdirSync(path.join(cncDir, 'golden'), { recursive: true });

  // validate → load → 断言
  const valResult = validateConfig(rootDir);
  if (!valResult.passed) {
    throw new Error(
      `Fixture setup failed: validateConfig returned passed=false. ` +
      `Missing: ${valResult.missingFiles.join(', ')}. ` +
      `Errors: ${valResult.errors.join(', ')}.`
    );
  }

  const harnessConfig = loadHarnessConfig(rootDir);
  if (!harnessConfig) {
    throw new Error('Fixture setup failed: loadHarnessConfig returned null');
  }

  const riskMap = loadRiskMap(rootDir);
  if (!riskMap) {
    throw new Error('Fixture setup failed: loadRiskMap returned null');
  }

  return { rootDir, cncDir, harnessConfig, riskMap };
}

// ---- 测试 ----

describe('集成: YAML → validate → load → routeRisks', () => {
  let fixture: IntegrationFixture;

  beforeAll(() => {
    fixture = setupIntegrationFixture();
  });

  it('场景 1: validateConfig 通过 + 两个 loader 返回非 null 配置对象', () => {
    // beforeAll 中已执行并断言
    expect(fixture.harnessConfig).not.toBeNull();
    expect(fixture.riskMap).not.toBeNull();
    expect(fixture.harnessConfig.agent_cnc_harness.trigger_workflows).toHaveLength(3);
    expect(fixture.riskMap.risk_map.high_risk.files).toHaveLength(2);
  });

  // ---- roleplay workflow ----

  it('场景 2: RoleplayPromptBuilder.ts → 触发 roleplay_change', () => {
    const result: ScanResult = routeRisks(
      ['src/m5/RoleplayPromptBuilder.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toContain('roleplay_change');
    expect(result.requiredMeters).toContain('roleplay-isolation-meter');
    expect(result.requiredMeters).toContain('fg-meter');
    expect(result.requiredMeters).toContain('behavior-meter');
    // 该文件不在 high/medium risk 列表 → medium（默认）
    expect(result.overallRisk).toBe('medium');
    expect(result.requirePlan).toBe(false);
  });

  it('场景 3: PromptAssembler.ts (prefix/**/suffix) → 触发 roleplay_change', () => {
    const result = routeRisks(
      ['src/m5/PromptAssembler.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toContain('roleplay_change');
  });

  it('场景 3b: src/app/role/** → 触发 roleplay_change', () => {
    const result = routeRisks(
      ['src/app/role/some-file.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toContain('roleplay_change');
  });

  // ---- sqlite workflow ----

  it('场景 4: ConversationDB.ts (src/**/ConversationDB.ts) → 触发 sqlite_change', () => {
    const result = routeRisks(
      ['src/m2/ConversationDB.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toContain('sqlite_change');
    expect(result.requiredMeters).toContain('persist-meter');
    expect(result.requiredMeters).toContain('uuid-meter');
  });

  it('场景 4b: scripts/** → 触发 sqlite_change', () => {
    const result = routeRisks(
      ['scripts/migrate-db.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toContain('sqlite_change');
  });

  // ---- 不触发 ----

  it('场景 5: 不相关文件 docs/readme.md → 不触发任何 workflow', () => {
    const result = routeRisks(
      ['docs/readme.md'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toHaveLength(0);
    expect(result.requiredMeters).toHaveLength(0);
    expect(result.requirePlan).toBe(false);
  });

  // ---- Windows 路径 ----

  it('场景 6: Windows 反斜杠路径 → normalizePath 后正确匹配 roleplay WF', () => {
    const result = routeRisks(
      ['src\\m5\\RoleplayPromptBuilder.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    expect(result.triggeredWorkflows).toContain('roleplay_change');
  });

  // ---- 多文件 + 多 WF ----

  it('场景 7: chat.ts → high risk + requirePlan, ConversationDB.ts → sqlite WF', () => {
    const result = routeRisks(
      ['src/webui/chat.ts', 'src/m2/ConversationDB.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    // chat.ts → high risk
    expect(result.overallRisk).toBe('high');
    expect(result.requirePlan).toBe(true);

    // 两个 workflow 都触发
    expect(result.triggeredWorkflows).toContain('chat_ts_change');
    expect(result.triggeredWorkflows).toContain('sqlite_change');

    // Meter 聚合
    expect(result.requiredMeters).toContain('prompt-meter');
    expect(result.requiredMeters).toContain('meeting-mode-meter');
    expect(result.requiredMeters).toContain('persist-meter');
    expect(result.requiredMeters).toContain('uuid-meter');

    // behavior-meter 在两个 WF 中都出现，应只保留一次
    const behaviorCount = result.requiredMeters.filter(
      (m) => m === 'behavior-meter',
    ).length;
    expect(behaviorCount).toBe(1);

    // risk 分类
    const chatFile = result.files.find((f) => f.path === 'src/webui/chat.ts');
    expect(chatFile).toBeDefined();
    expect(chatFile!.risk).toBe('high');
    expect(chatFile!.reason).toContain('聊天中枢');

    const sqliteFile = result.files.find(
      (f) => f.path === 'src/m2/ConversationDB.ts',
    );
    expect(sqliteFile).toBeDefined();
    expect(sqliteFile!.risk).toBe('medium');
  });

  // ---- Meter 去重 ----

  it('两个 WF 共享 behavior-meter → requiredMeters 中只出现一次', () => {
    // chat_ts_change 和 roleplay_change 都有 behavior-meter
    const result = routeRisks(
      ['src/webui/chat.ts', 'src/m5/RoleplayPromptBuilder.ts'],
      fixture.riskMap,
      fixture.harnessConfig,
    );

    const behaviorCount = result.requiredMeters.filter(
      (m) => m === 'behavior-meter',
    ).length;
    expect(behaviorCount).toBe(1);
  });
});
