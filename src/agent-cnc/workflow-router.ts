// ============================================================
// Agent CNC Harness — 工作流路由
// 根据风险等级选择对应工作流
// ============================================================

import * as path from 'node:path';
import type { ScanResult, WorkflowDef } from './types.js';
import { loadWorkflow } from './config.js';

/**
 * 根据 scan 结果加载对应的工作流定义
 */
export function routeWorkflows(
  rootDir: string,
  scanResult: ScanResult,
): WorkflowDef[] {
  const workflows: WorkflowDef[] = [];

  // 加载每个触发的工作流
  for (const wfId of scanResult.triggeredWorkflows) {
    const wfPath = `workflows/${wfId.replace(/_change$/, '-change')}.yaml`;
    const wf = loadWorkflow(rootDir, wfPath);
    if (wf) {
      workflows.push(wf);
    }
  }

  // 如果没有触发任何特定工作流，根据整体风险加载通用工作流
  if (workflows.length === 0) {
    let wfPath: string;
    switch (scanResult.overallRisk) {
      case 'high':
        wfPath = 'workflows/high-risk-change.yaml';
        break;
      case 'medium':
        wfPath = 'workflows/medium-risk-change.yaml';
        break;
      case 'low':
      default:
        wfPath = 'workflows/low-risk-change.yaml';
        break;
    }
    const wf = loadWorkflow(rootDir, wfPath);
    if (wf) {
      workflows.push(wf);
    }
  }

  return workflows;
}

/**
 * 聚合所有工作流要求的 redlines、meters、commands、evidence
 */
export function aggregateRequirements(workflows: WorkflowDef[]): {
  allRedlines: string[];
  allMeters: string[];
  allCommands: string[];
  allEvidence: string[];
} {
  const allRedlines: string[] = [];
  const allMeters: string[] = [];
  const allCommands: string[] = [];
  const allEvidence: string[] = [];

  for (const wf of workflows) {
    for (const r of wf.workflow.required_redlines) {
      if (!allRedlines.includes(r)) allRedlines.push(r);
    }
    for (const m of wf.workflow.required_meters) {
      if (!allMeters.includes(m)) allMeters.push(m);
    }
    for (const c of wf.workflow.required_commands) {
      if (!allCommands.includes(c)) allCommands.push(c);
    }
    for (const e of wf.workflow.required_evidence) {
      if (!allEvidence.includes(e)) allEvidence.push(e);
    }
  }

  return { allRedlines, allMeters, allCommands, allEvidence };
}
