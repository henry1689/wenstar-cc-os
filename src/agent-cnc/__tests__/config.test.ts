// ============================================================
// Agent CNC Harness — config.ts 单元测试
// 覆盖: loadConfig, loadRiskMap, loadHarnessConfig, loadWorkflow,
//        checkConfigFiles
// 策略: 临时目录 + YAML 文件模拟 .agent-cnc/ 结构
// 注: 任务书称此模块为 config-loader.ts，实际文件为 config.ts
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadConfig,
  loadRiskMap,
  loadHarnessConfig,
  loadWorkflow,
  checkConfigFiles,
} from '../config.js';

// ---- 临时目录工具 ----

/** 创建临时子目录 */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-config-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function setupCncDir(rootDir: string): string {
  const d = path.join(rootDir, '.agent-cnc');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ---- 合法 YAML 内容 ----

const VALID_CONFIG = `agent_cnc:
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

const VALID_RISK_MAP = `risk_map:
  version: "0.1"
  high_risk:
    severity: "S"
    require_plan: true
    require_human_approval: true
    files:
      - path: "src/webui/chat.ts"
        reason: "聊天中枢"
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
      - "src/config/**"
`;

const VALID_HARNESS = `agent_cnc_harness:
  version: "0.1"
  project: "WenStarOS"
  commands:
    typecheck: "npx tsc --noEmit"
    test_all: "npx vitest run"
    health_check: "npx tsx src/cli/health-check.ts"
    sandbox: "npx tsx src/cli/sandbox.ts"
  trigger_workflows:
    - id: "chat_ts_change"
      when_any_changed:
        - "src/webui/chat.ts"
      workflow: "workflows/chat-ts-change.yaml"
      meters:
        - "prompt-meter"
        - "meeting-mode-meter"
    - id: "roleplay_change"
      when_any_changed:
        - "src/**/RoleplayPromptBuilder.ts"
      workflow: "workflows/roleplay-change.yaml"
      meters:
        - "roleplay-isolation-meter"
        - "behavior-meter"
  gates:
    block_on:
      - "schema_invalid"
      - "high_risk_without_plan"
  autonomy:
    default_level: "A2"
    max_level: "A4"
    allow_auto_patch_for:
      - "docs"
      - "tests"
    require_human_approval_for:
      - "chat_ts_change"
`;

const VALID_WORKFLOW = `workflow:
  id: "high-risk-change"
  title: "高风险变更工作流"
  risk_level: "high"
  require_plan: true
  required_redlines:
    - "chat-injection-points"
  required_meters:
    - "prompt-meter"
  required_commands:
    - "typecheck"
  required_evidence:
    - "tsc_compile_pass"
    - "change_plan_exists"
  gate:
    block_on_fail: true
`;

// 简单的 project-genome / precision-spec / inspection-matrix（checkConfigFiles 用）
const MINIMAL_YAML = 'project_genome:\n  schema_version: "0.1"\n  project:\n    name: "test"\n';
const MINIMAL_PRECISION = 'precision_spec:\n  version: "0.1"\n  specs: []\n';
const MINIMAL_INSPECTION = 'inspection_matrix:\n  version: "0.1"\n  rows: []\n';

// ============================================================
// loadConfig
// ============================================================

describe('loadConfig', () => {
  it('场景 1: 合法 config.yaml → 返回 AgentCncConfig 对象', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    writeFile(path.join(cncDir, 'config.yaml'), VALID_CONFIG);

    const result = loadConfig(rootDir);
    expect(result).not.toBeNull();
    expect(result!.agent_cnc.version).toBe('0.1');
    expect(result!.agent_cnc.project).toBe('WenStarOS');
    expect(result!.agent_cnc.runtime.offline_deterministic_guard).toBe(true);
    expect(result!.agent_cnc.privacy.level).toBe('strict');
  });

  it('文件缺失 → 返回 null（不抛异常）', () => {
    const rootDir = makeTempDir();
    setupCncDir(rootDir);
    // 不创建 config.yaml
    const result = loadConfig(rootDir);
    expect(result).toBeNull();
  });

  it('.agent-cnc/ 目录本身不存在 → 返回 null', () => {
    const rootDir = makeTempDir();
    // 不创建任何文件
    const result = loadConfig(rootDir);
    expect(result).toBeNull();
  });
});

// ============================================================
// loadRiskMap
// ============================================================

describe('loadRiskMap', () => {
  it('场景 2: 合法 risk-map.yaml → 含 high_risk.files', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    writeFile(path.join(cncDir, 'risk-map.yaml'), VALID_RISK_MAP);

    const result = loadRiskMap(rootDir);
    expect(result).not.toBeNull();
    expect(result!.risk_map.version).toBe('0.1');
    expect(Array.isArray(result!.risk_map.high_risk.files)).toBe(true);
    expect(result!.risk_map.high_risk.files).toHaveLength(1);
    expect(result!.risk_map.high_risk.files[0].path).toBe('src/webui/chat.ts');
    expect(result!.risk_map.medium_risk.files).toContain('src/m3/PerceptionAnalyzer.ts');
    expect(result!.risk_map.low_risk.path_patterns).toContain('**/__tests__/**');
  });

  it('文件缺失 → 返回 null', () => {
    const rootDir = makeTempDir();
    setupCncDir(rootDir);
    expect(loadRiskMap(rootDir)).toBeNull();
  });
});

// ============================================================
// loadHarnessConfig
// ============================================================

describe('loadHarnessConfig', () => {
  it('场景 3: 合法 harness.yaml → 含 trigger_workflows', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    writeFile(path.join(cncDir, 'harness.yaml'), VALID_HARNESS);

    const result = loadHarnessConfig(rootDir);
    expect(result).not.toBeNull();
    expect(result!.agent_cnc_harness.version).toBe('0.1');
    expect(result!.agent_cnc_harness.trigger_workflows).toHaveLength(2);
    expect(result!.agent_cnc_harness.trigger_workflows[0].id).toBe('chat_ts_change');
    expect(result!.agent_cnc_harness.trigger_workflows[0].meters).toContain('prompt-meter');
    // roleplay_change 使用了 prefix/**/suffix 模式
    expect(result!.agent_cnc_harness.trigger_workflows[1].id).toBe('roleplay_change');
    expect(result!.agent_cnc_harness.trigger_workflows[1].when_any_changed).toContain(
      'src/**/RoleplayPromptBuilder.ts',
    );
    // gates
    expect(result!.agent_cnc_harness.gates.block_on).toContain('high_risk_without_plan');
    // autonomy
    expect(result!.agent_cnc_harness.autonomy.require_human_approval_for).toContain(
      'chat_ts_change',
    );
  });

  it('场景 6: YAML 语法错误 → 返回 null（不抛异常）', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    writeFile(path.join(cncDir, 'harness.yaml'), '{{{broken yaml ::: !!!');

    const result = loadHarnessConfig(rootDir);
    expect(result).toBeNull();
  });

  it('文件缺失 → 返回 null', () => {
    const rootDir = makeTempDir();
    setupCncDir(rootDir);
    expect(loadHarnessConfig(rootDir)).toBeNull();
  });
});

// ============================================================
// loadWorkflow
// ============================================================

describe('loadWorkflow', () => {
  it('场景 4: 合法 workflow YAML → 返回 WorkflowDef', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    const wfDir = path.join(cncDir, 'workflows');
    writeFile(path.join(wfDir, 'high-risk-change.yaml'), VALID_WORKFLOW);

    const result = loadWorkflow(rootDir, 'workflows/high-risk-change.yaml');
    expect(result).not.toBeNull();
    expect(result!.workflow.id).toBe('high-risk-change');
    expect(result!.workflow.risk_level).toBe('high');
    expect(result!.workflow.require_plan).toBe(true);
    expect(result!.workflow.required_redlines).toContain('chat-injection-points');
    expect(result!.workflow.gate.block_on_fail).toBe(true);
  });

  it('workflow 文件不存在 → 返回 null', () => {
    const rootDir = makeTempDir();
    setupCncDir(rootDir);
    const result = loadWorkflow(rootDir, 'workflows/ghost.yaml');
    expect(result).toBeNull();
  });
});

// ============================================================
// checkConfigFiles
// ============================================================

describe('checkConfigFiles', () => {
  it('场景 7: 6 个核心 YAML 全部存在 → exists=true, missing=[]', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    writeFile(path.join(cncDir, 'config.yaml'), VALID_CONFIG);
    writeFile(path.join(cncDir, 'harness.yaml'), VALID_HARNESS);
    writeFile(path.join(cncDir, 'risk-map.yaml'), VALID_RISK_MAP);
    writeFile(path.join(cncDir, 'project-genome.yaml'), MINIMAL_YAML);
    writeFile(path.join(cncDir, 'precision-spec.yaml'), MINIMAL_PRECISION);
    writeFile(path.join(cncDir, 'inspection-matrix.yaml'), MINIMAL_INSPECTION);

    const result = checkConfigFiles(rootDir);
    expect(result.exists).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('场景 8: 缺失 config.yaml + harness.yaml → exists=false + 列出缺失', () => {
    const rootDir = makeTempDir();
    const cncDir = setupCncDir(rootDir);
    // 只创建 4 个，缺 config.yaml 和 harness.yaml
    writeFile(path.join(cncDir, 'risk-map.yaml'), VALID_RISK_MAP);
    writeFile(path.join(cncDir, 'project-genome.yaml'), MINIMAL_YAML);
    writeFile(path.join(cncDir, 'precision-spec.yaml'), MINIMAL_PRECISION);
    writeFile(path.join(cncDir, 'inspection-matrix.yaml'), MINIMAL_INSPECTION);

    const result = checkConfigFiles(rootDir);
    expect(result.exists).toBe(false);
    expect(result.missing).toContain('.agent-cnc/config.yaml');
    expect(result.missing).toContain('.agent-cnc/harness.yaml');
    expect(result.missing).toHaveLength(2);
  });

  it('.agent-cnc/ 目录不存在 → exists=false + missing 含 .agent-cnc/', () => {
    const rootDir = makeTempDir();
    const result = checkConfigFiles(rootDir);
    expect(result.exists).toBe(false);
    expect(result.missing).toContain('.agent-cnc/');
  });
});
