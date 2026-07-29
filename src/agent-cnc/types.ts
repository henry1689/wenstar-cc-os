// ============================================================
// Agent CNC Harness — 类型定义
// 所有接口和类型集中定义
// ============================================================

// ---- Meter ----

export interface MeterResult {
  /** 必须使用配置中的 ID（如 uuid-meter, fg-meter, persist-meter, llm-meter） */
  id: string;
  title: string;
  severity: 'S' | 'A' | 'B' | 'C';
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  score: number;
  evidence: string[];
  warnings: string[];
  failures: string[];
}

// ---- Deviation Vector ----

export interface DeviationVector {
  prompt_injection_order_risk: number;
  meeting_identity_leakage: number;
  roleplay_fg_pollution: number;
  role_state_residue: number;
  uuid_misownership: number;
  uuid_annotation_rate_drop: number;
  familygraph_schema_drift: number;
  sqlite_persistence_loss: number;
  llm_reasoning_content_leak: number;
  behavior_regression: number;
  python_domain_isolation_break: number;
  globalbus_protocol_violation: number;
}

/** 零向量 */
export function zeroDeviation(): DeviationVector {
  return {
    prompt_injection_order_risk: 0,
    meeting_identity_leakage: 0,
    roleplay_fg_pollution: 0,
    role_state_residue: 0,
    uuid_misownership: 0,
    uuid_annotation_rate_drop: 0,
    familygraph_schema_drift: 0,
    sqlite_persistence_loss: 0,
    llm_reasoning_content_leak: 0,
    behavior_regression: 0,
    python_domain_isolation_break: 0,
    globalbus_protocol_violation: 0,
  };
}

// ---- Command ----

export interface CommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

// ---- Scan / Risk ----

export interface FileRiskInfo {
  path: string;
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

export interface ScanResult {
  overallRisk: 'low' | 'medium' | 'high';
  files: FileRiskInfo[];
  triggeredWorkflows: string[];
  requiredMeters: string[];
  requirePlan: boolean;
}

// ---- Harness Context（传给每个 Meter） ----

export interface HarnessContext {
  rootDir: string;
  changedFiles: string[];
  riskResult: ScanResult;
  dbAvailable: boolean;
  dbPath: string;
  wenstarOsRoot: string | null;
}

// ---- Config 类型 ----

export interface LlmProviderConfig {
  id: string;
  type: string;
  base_url_env: string;
  api_key_env: string;
  model_env: string;
}

export interface LlmPolicyConfig {
  allow_source_code_upload: boolean;
  allow_docs_upload: boolean;
  redact_secrets_before_send: boolean;
  max_tokens_per_run: number;
}

export interface LlmConfig {
  enabled: boolean;
  user_managed_api_key: boolean;
  providers: LlmProviderConfig[];
  policy: LlmPolicyConfig;
}

export interface RuntimeConfig {
  mode: string;
  offline_deterministic_guard: boolean;
  online_llm_enhanced: boolean;
  fallback_to_offline: boolean;
}

export interface AgentCncConfig {
  agent_cnc: {
    version: string;
    project: string;
    runtime: RuntimeConfig;
    llm: LlmConfig;
    privacy: {
      level: string;
      allow_network: boolean;
      allow_source_code_upload: boolean;
      allow_docs_upload: boolean;
      redact_secrets: boolean;
    };
  };
}

// ---- Risk Map ----

export interface HighRiskEntry {
  path: string;
  reason: string;
}

export interface RiskMapConfig {
  risk_map: {
    version: string;
    high_risk: {
      severity: string;
      require_plan: boolean;
      require_human_approval: boolean;
      files: HighRiskEntry[];
    };
    medium_risk: {
      severity: string;
      require_plan: string;
      files: string[];
    };
    low_risk: {
      severity: string;
      allow_direct_patch: boolean;
      path_patterns: string[];
    };
  };
}

// ---- Harness ----

export interface TriggerWorkflow {
  id: string;
  when_any_changed: string[];
  workflow: string;
  meters: string[];
}

export interface HarnessConfig {
  agent_cnc_harness: {
    version: string;
    project: string;
    commands: {
      typecheck: string;
      test_all: string;
      health_check: string;
      sandbox: string;
    };
    trigger_workflows: TriggerWorkflow[];
    gates: {
      block_on: string[];
    };
    autonomy: {
      default_level: string;
      max_level: string;
      allow_auto_patch_for: string[];
      require_human_approval_for: string[];
    };
  };
}

// ---- Workflow ----

export interface WorkflowDef {
  workflow: {
    id: string;
    title: string;
    risk_level: string;
    require_plan: boolean | string;
    required_redlines: string[];
    required_meters: string[];
    required_commands: string[];
    required_evidence: string[];
    gate: {
      block_on_fail: boolean;
    };
  };
}

// ---- Report ----

export interface EvidenceReport {
  project: string;
  time: string;
  mode: string;
  result: 'PASS' | 'FAIL' | 'WARN';
  overallRisk: string;
  changedFiles: FileRiskInfo[];
  triggeredWorkflows: string[];
  commandResults: CommandResult[];
  meterResults: MeterResult[];
  deviation: DeviationVector;
  gateDecision: 'PASS' | 'FAIL';
  requiredHumanReview: string[];
  nextSteps: string[];
}

// ---- Doctor ----

export interface DoctorResult {
  nodeVersion: string;
  projectRoot: boolean;
  agentCncExists: boolean;
  configExists: boolean;
  harnessExists: boolean;
  riskMapExists: boolean;
  tscAvailable: boolean;
  vitestAvailable: boolean;
  tsxAvailable: boolean;
  gitAvailable: boolean;
  llmConfigured: 'configured' | 'disabled' | 'unavailable';
  mode: string;
  overall: 'PASS' | 'FAIL';
}

// ---- Validation ----

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  missingFiles: string[];
  invalidYaml: string[];
  missingFields: string[];
  missingMeterImplementations: string[];
}

// ---- Gate ----

export interface GateResult {
  passed: boolean;
  blockReasons: string[];
  warnings: string[];
}

// ---- Meter Registry Entry ----

export interface MeterRegistryEntry {
  id: string;
  run: (context: HarnessContext) => Promise<MeterResult>;
}
