// ============================================================
// Agent CNC Harness — 风险路由
// 根据变更文件判定风险等级、触发工作流、所需 Meter
// ============================================================

import { normalizePath, simpleGlob } from './utils.js';
import type {
  RiskMapConfig,
  HarnessConfig,
  FileRiskInfo,
  ScanResult,
} from './types.js';

/**
 * Config 文件关键词风险判定。
 * 文件在 config/ 目录下时，根据文件名/路径中的语义关键词识别高风险 config。
 */
const HIGH_CONFIG_KEYWORDS = [
  'llm', 'model', 'provider', 'deepseek', 'openai', 'completion',
  'api', 'token', 'secret', 'auth', 'credential', 'endpoint',
  'database', 'db', 'sqlite', 'storage',
  'memory', 'context', 'pfc', 'prefrontal',
  'prompt', 'policy', 'rule', 'system', 'instruction',
  'agent', 'tool', 'executor', 'runner',
  'safety', 'guard', 'permission',
];

function isHighRiskConfigFile(filePath: string): string | null {
  const configMatch = filePath.match(/(?:^|\/)config\/(.+)$/i);
  if (!configMatch) return null;

  const relative = configMatch[1].toLowerCase();
  for (const kw of HIGH_CONFIG_KEYWORDS) {
    if (relative.includes(kw)) {
      return `config 文件包含治理敏感关键词: ${kw}`;
    }
  }
  return null;
}

/**
 * 对单个文件判定风险等级
 */
function classifyFile(
  filePath: string,
  riskMap: RiskMapConfig,
): FileRiskInfo {
  const normalized = normalizePath(filePath);

  // 1. 精确匹配 high_risk.files
  const highFiles = riskMap.risk_map.high_risk.files;
  for (const entry of highFiles) {
    if (normalized === entry.path) {
      return { path: normalized, risk: 'high', reason: entry.reason };
    }
  }

  // 2. 精确匹配 medium_risk.files
  const mediumFiles = riskMap.risk_map.medium_risk.files;
  for (const entry of mediumFiles) {
    if (normalized === entry || normalized.endsWith('/' + entry)) {
      return { path: normalized, risk: 'medium', reason: '中风险区域文件' };
    }
  }

  // 2.5. Config 文件关键词判定 (calibration patch R21-B1.1)
  const configRisk = isHighRiskConfigFile(normalized);
  if (configRisk) {
    return { path: normalized, risk: 'high', reason: configRisk };
  }

  // 3. glob 匹配 low_risk.path_patterns
  const lowPatterns = riskMap.risk_map.low_risk.path_patterns;
  for (const pattern of lowPatterns) {
    if (simpleGlob(pattern, normalized)) {
      return { path: normalized, risk: 'low', reason: `匹配模式: ${pattern}` };
    }
  }

  // 4. 默认 medium
  return { path: normalized, risk: 'medium', reason: '未匹配任何风险规则，默认为中风险' };
}

/**
 * 根据变更文件触发对应工作流
 */
function findTriggeredWorkflows(
  changedFiles: string[],
  harnessConfig: HarnessConfig,
): { workflowIds: string[]; meterIds: string[] } {
  const workflowIds: string[] = [];
  const meterIds: string[] = [];

  const workflows = harnessConfig.agent_cnc_harness.trigger_workflows;

  for (const tw of workflows) {
    let triggered = false;
    for (const pattern of tw.when_any_changed) {
      for (const file of changedFiles) {
        if (simpleGlob(pattern, file)) {
          triggered = true;
          break;
        }
        // 也支持精确匹配（含目录路径）
        if (file === pattern || file.startsWith(pattern.replace('/**', '/'))) {
          triggered = true;
          break;
        }
      }
      if (triggered) break;
    }

    if (triggered) {
      workflowIds.push(tw.id);
      for (const meterId of tw.meters) {
        if (!meterIds.includes(meterId)) {
          meterIds.push(meterId);
        }
      }
    }
  }

  return { workflowIds, meterIds };
}

/**
 * 风险路由主函数
 */
export function routeRisks(
  changedFiles: string[],
  riskMap: RiskMapConfig,
  harnessConfig: HarnessConfig,
): ScanResult {
  // 对每个文件分类
  const files: FileRiskInfo[] = changedFiles.map((f) =>
    classifyFile(f, riskMap),
  );

  // 整体风险：任一 high → high，否则任一 medium → medium，否则 low
  let overallRisk: 'low' | 'medium' | 'high' = 'low';
  for (const f of files) {
    if (f.risk === 'high') {
      overallRisk = 'high';
      break;
    }
    if (f.risk === 'medium') {
      overallRisk = 'medium';
    }
  }

  // 触发工作流
  const { workflowIds, meterIds } = findTriggeredWorkflows(
    changedFiles,
    harnessConfig,
  );

  // 是否要求 Plan：high risk 必须有 Plan
  const requirePlan = overallRisk === 'high';

  return {
    overallRisk,
    files,
    triggeredWorkflows: workflowIds,
    requiredMeters: meterIds,
    requirePlan,
  };
}
