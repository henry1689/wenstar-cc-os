// ============================================================
// Agent CNC Harness — 配置校验器
// 校验 .agent-cnc/ 下所有配置文件的结构完整性
// ============================================================

import * as path from 'node:path';
import * as fs from 'node:fs';
import YAML from 'yaml';
import { fileExists, readTextFile, normalizePath } from './utils.js';
import type { ValidationResult } from './types.js';

/**
 * 校验 .agent-cnc 关键 YAML 是否可解析 + 必要字段是否存在
 */
export function validateConfig(rootDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFiles: string[] = [];
  const invalidYaml: string[] = [];
  const missingFields: string[] = [];
  const missingMeterImplementations: string[] = [];

  const agentCncDir = path.join(rootDir, '.agent-cnc');

  // ---- 目录存在性 ----
  if (!fs.existsSync(agentCncDir)) {
    errors.push('.agent-cnc/ 目录不存在');
    return {
      passed: false,
      errors,
      warnings,
      missingFiles,
      invalidYaml,
      missingFields,
      missingMeterImplementations,
    };
  }

  // ---- 关键 YAML 文件可解析性 ----
  const keyFiles = [
    'config.yaml',
    'harness.yaml',
    'risk-map.yaml',
    'project-genome.yaml',
    'precision-spec.yaml',
    'inspection-matrix.yaml',
  ];

  for (const f of keyFiles) {
    const fullPath = path.join(agentCncDir, f);
    if (!fileExists(fullPath)) {
      missingFiles.push(f);
      continue;
    }
    const content = readTextFile(fullPath);
    if (!content) {
      invalidYaml.push(`${f}: 文件为空或无法读取`);
      continue;
    }
    try {
      YAML.parse(content);
    } catch {
      invalidYaml.push(`${f}: YAML 解析失败`);
    }
  }

  // ---- 校验 harness.yaml 必要字段 ----
  const harnessPath = path.join(agentCncDir, 'harness.yaml');
  const harnessContent = readTextFile(harnessPath);
  if (harnessContent) {
    try {
      const harness = YAML.parse(harnessContent) as Record<string, unknown>;
      const acnh = harness?.agent_cnc_harness as Record<string, unknown> | undefined;
      if (!acnh) {
        missingFields.push('harness.yaml: 缺少 agent_cnc_harness 根字段');
      } else {
        if (!acnh.commands) missingFields.push('harness.yaml: 缺少 commands');
        if (!acnh.trigger_workflows) missingFields.push('harness.yaml: 缺少 trigger_workflows');
        if (!acnh.gates) missingFields.push('harness.yaml: 缺少 gates');
      }
    } catch {
      // YAML parse error already captured above
    }
  }

  // ---- 校验 redlines/ 目录存在 ----
  const redlinesDir = path.join(agentCncDir, 'redlines');
  if (!fs.existsSync(redlinesDir)) {
    missingFiles.push('redlines/');
  } else {
    const expected = [
      'fg-roleplay-redlines.yaml',
      'chat-injection-points.yaml',
      'meeting-propagation-chain.yaml',
      'uuid-ownership-rules.yaml',
      'sqlite-persistence-rules.yaml',
      'llm-provider-rules.yaml',
      'python-three-domain-rules.yaml',
    ];
    for (const rf of expected) {
      if (!fileExists(path.join(redlinesDir, rf))) {
        missingFiles.push(`redlines/${rf}`);
      }
    }
  }

  // ---- 校验 workflows/ 目录 ----
  const workflowsDir = path.join(agentCncDir, 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    missingFiles.push('workflows/');
  } else {
    const expectedWorkflows = [
      'low-risk-change.yaml',
      'medium-risk-change.yaml',
      'high-risk-change.yaml',
      'chat-ts-change.yaml',
      'familygraph-change.yaml',
      'uuid-chain-change.yaml',
      'meeting-mode-change.yaml',
      'roleplay-change.yaml',
      'sqlite-change.yaml',
      'llm-provider-change.yaml',
      'python-domain-change.yaml',
    ];
    for (const wf of expectedWorkflows) {
      if (!fileExists(path.join(workflowsDir, wf))) {
        missingFiles.push(`workflows/${wf}`);
      }
    }
  }

  // ---- 校验 meters/ 目录 ----
  const metersDir = path.join(agentCncDir, 'meters');
  if (!fs.existsSync(metersDir)) {
    missingFiles.push('meters/');
  }

  // ---- 校验 harness.yaml 中的 meter 引用与代码 registry 一致 ----
  // 这一步在 guard 阶段由 CLI 调用 checkMeterRegistry 完成

  // ---- 校验 golden/ 目录 ----
  const goldenDir = path.join(agentCncDir, 'golden');
  if (!fs.existsSync(goldenDir)) {
    missingFiles.push('golden/');
  }

  // ---- 校验 workflow YAML 引用完整性 ----
  if (harnessContent) {
    try {
      const harness = YAML.parse(harnessContent) as Record<string, unknown>;
      const tws = (harness?.agent_cnc_harness as Record<string, unknown>)?.trigger_workflows as Array<Record<string, unknown>> | undefined;
      if (tws) {
        for (const tw of tws) {
          const wfFile = tw.workflow as string | undefined;
          if (wfFile && !fileExists(path.join(agentCncDir, wfFile))) {
            missingFiles.push(`引用的 workflow 不存在: ${wfFile}`);
          }
        }
      }
    } catch {
      // pass
    }
  }

  // ---- 结论 ----
  const hasCritical = errors.length > 0 || missingFiles.length > 0 || invalidYaml.length > 0 || missingFields.length > 0;
  const passed = !hasCritical;

  return {
    passed,
    errors,
    warnings,
    missingFiles,
    invalidYaml,
    missingFields,
    missingMeterImplementations,
  };
}

/**
 * 校验 meter registry：确保 harness.yaml 中的 meter id 都有对应实现
 */
export function checkMeterRegistry(
  rootDir: string,
  registeredMeterIds: string[],
): string[] {
  const missing: string[] = [];

  const harnessPath = path.join(rootDir, '.agent-cnc', 'harness.yaml');
  const content = readTextFile(harnessPath);
  if (!content) return missing;

  try {
    const harness = YAML.parse(content) as Record<string, unknown>;
    const tws = (harness?.agent_cnc_harness as Record<string, unknown>)?.trigger_workflows as Array<Record<string, unknown>> | undefined;
    if (tws) {
      const allMeterIds = new Set<string>();
      for (const tw of tws) {
        const meters = tw.meters as string[] | undefined;
        if (meters) {
          for (const m of meters) {
            allMeterIds.add(m);
          }
        }
      }
      for (const mid of allMeterIds) {
        if (!registeredMeterIds.includes(mid)) {
          missing.push(`meter "${mid}" 在 harness.yaml 中引用但未在代码 registry 中注册`);
        }
      }
    }
  } catch {
    // pass
  }

  return missing;
}
