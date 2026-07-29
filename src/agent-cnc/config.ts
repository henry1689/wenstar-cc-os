// ============================================================
// Agent CNC Harness — 配置加载
// YAML 解析 + 类型转换
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import type {
  AgentCncConfig,
  RiskMapConfig,
  HarnessConfig,
  WorkflowDef,
} from './types.js';
import { fileExists, readTextFile } from './utils.js';

/**
 * 加载并解析 YAML 文件
 */
function loadYaml<T>(filePath: string): T | null {
  const content = readTextFile(filePath);
  if (!content) return null;
  try {
    return YAML.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * 加载 .agent-cnc/config.yaml
 */
export function loadConfig(rootDir: string): AgentCncConfig | null {
  const filePath = path.join(rootDir, '.agent-cnc', 'config.yaml');
  return loadYaml<AgentCncConfig>(filePath);
}

/**
 * 加载 .agent-cnc/risk-map.yaml
 */
export function loadRiskMap(rootDir: string): RiskMapConfig | null {
  const filePath = path.join(rootDir, '.agent-cnc', 'risk-map.yaml');
  return loadYaml<RiskMapConfig>(filePath);
}

/**
 * 加载 .agent-cnc/harness.yaml
 */
export function loadHarnessConfig(rootDir: string): HarnessConfig | null {
  const filePath = path.join(rootDir, '.agent-cnc', 'harness.yaml');
  return loadYaml<HarnessConfig>(filePath);
}

/**
 * 加载工作流 YAML
 */
export function loadWorkflow(
  rootDir: string,
  workflowPath: string,
): WorkflowDef | null {
  const fullPath = path.join(rootDir, '.agent-cnc', workflowPath);
  return loadYaml<WorkflowDef>(fullPath);
}

/**
 * 加载任意 YAML 文件（用于 redlines/golden 等）
 */
export function loadAnyYaml(rootDir: string, relativePath: string): unknown | null {
  const fullPath = path.join(rootDir, '.agent-cnc', relativePath);
  return loadYaml(fullPath);
}

/**
 * 检查 LLM 是否已配置（环境变量存在即算配置）
 */
export function checkLlmConfigured(): 'configured' | 'disabled' | 'unavailable' {
  const config = loadConfig(process.cwd());
  if (!config || !config.agent_cnc.llm.enabled) {
    return 'disabled';
  }
  const provider = config.agent_cnc.llm.providers[0];
  if (!provider) return 'unavailable';
  const hasUrl = !!process.env[provider.base_url_env];
  const hasKey = !!process.env[provider.api_key_env];
  return hasUrl && hasKey ? 'configured' : 'unavailable';
}

/**
 * 检查关键配置文件是否都存在
 */
export function checkConfigFiles(rootDir: string): {
  exists: boolean;
  missing: string[];
} {
  const agentCncDir = path.join(rootDir, '.agent-cnc');
  if (!fs.existsSync(agentCncDir) || !fs.statSync(agentCncDir).isDirectory()) {
    return { exists: false, missing: ['.agent-cnc/'] };
  }

  const required = [
    '.agent-cnc/config.yaml',
    '.agent-cnc/harness.yaml',
    '.agent-cnc/risk-map.yaml',
    '.agent-cnc/project-genome.yaml',
    '.agent-cnc/precision-spec.yaml',
    '.agent-cnc/inspection-matrix.yaml',
  ];

  const missing: string[] = [];
  for (const f of required) {
    if (!fileExists(path.join(rootDir, f))) {
      missing.push(f);
    }
  }

  return { exists: missing.length === 0, missing };
}
