// ============================================================
// Agent CNC Harness — 证据报告生成
// 生成 Markdown + JSON 报告
// ============================================================

import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  EvidenceReport,
  MeterResult,
  CommandResult,
  DeviationVector,
  FileRiskInfo,
} from './types.js';
import { timestamp, ensureDir } from './utils.js';

/**
 * 构建完整的 Evidence Report
 */
export function buildReport(params: {
  project: string;
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
}): EvidenceReport {
  return {
    project: params.project,
    time: new Date().toISOString(),
    mode: params.mode,
    result: params.result,
    overallRisk: params.overallRisk,
    changedFiles: params.changedFiles,
    triggeredWorkflows: params.triggeredWorkflows,
    commandResults: params.commandResults,
    meterResults: params.meterResults,
    deviation: params.deviation,
    gateDecision: params.gateDecision,
    requiredHumanReview: params.requiredHumanReview,
    nextSteps: params.nextSteps,
  };
}

/**
 * 生成 Markdown 报告内容
 */
export function renderMarkdown(report: EvidenceReport): string {
  const lines: string[] = [];

  lines.push('# Agent CNC Evidence Report');
  lines.push('');

  // 1. Summary
  lines.push('## 1. Summary');
  lines.push('');
  lines.push(`- **Project:** ${report.project}`);
  lines.push(`- **Time:** ${report.time}`);
  lines.push(`- **Mode:** ${report.mode}`);
  lines.push(`- **Result:** ${report.result}`);
  lines.push(`- **Overall Risk:** ${report.overallRisk}`);
  lines.push(`- **Gate Decision:** ${report.gateDecision}`);
  lines.push('');

  // 2. Changed Files
  lines.push('## 2. Changed Files');
  lines.push('');
  if (report.changedFiles.length === 0) {
    lines.push('_(无变更文件)_');
  } else {
    lines.push('| File | Risk | Reason |');
    lines.push('|:---|:---|:---|');
    for (const f of report.changedFiles) {
      lines.push(`| ${f.path} | ${f.risk} | ${f.reason} |`);
    }
  }
  lines.push('');

  // 3. Triggered Workflows
  lines.push('## 3. Triggered Workflows');
  lines.push('');
  if (report.triggeredWorkflows.length === 0) {
    lines.push('_(无触发工作流)_');
  } else {
    for (const wf of report.triggeredWorkflows) {
      lines.push(`- ${wf}`);
    }
  }
  lines.push('');

  // 4. Commands
  lines.push('## 4. Commands');
  lines.push('');
  if (report.commandResults.length === 0) {
    lines.push('_(无执行命令)_');
  } else {
    lines.push('| Command | Exit Code | Duration | Result |');
    lines.push('|:---|:---|:---|:---|');
    for (const c of report.commandResults) {
      const status = c.exitCode === 0 ? '✅ PASS' : '❌ FAIL';
      lines.push(
        `| ${c.command} | ${c.exitCode} | ${c.durationMs}ms | ${status} |`,
      );
    }
    lines.push('');
    // stdout/stderr 摘要
    for (const c of report.commandResults) {
      if (c.stdout.length > 0) {
        lines.push(`### \`${c.command}\` stdout`);
        lines.push('');
        lines.push('```');
        lines.push(c.stdout.slice(0, 2000));
        if (c.stdout.length > 2000) lines.push('...(truncated)');
        lines.push('```');
        lines.push('');
      }
      if (c.stderr.length > 0) {
        lines.push(`### \`${c.command}\` stderr`);
        lines.push('');
        lines.push('```');
        lines.push(c.stderr.slice(0, 2000));
        if (c.stderr.length > 2000) lines.push('...(truncated)');
        lines.push('```');
        lines.push('');
      }
    }
  }

  // 5. Meter Results
  lines.push('## 5. Meter Results');
  lines.push('');
  if (report.meterResults.length === 0) {
    lines.push('_(无 Meter 结果)_');
  } else {
    lines.push('| Meter | Status | Score | Severity |');
    lines.push('|:---|:---|:---|:---|');
    for (const m of report.meterResults) {
      const icon =
        m.status === 'pass'
          ? '✅'
          : m.status === 'warn'
            ? '⚠️'
            : m.status === 'fail'
              ? '❌'
              : '⏭️';
      lines.push(`| ${icon} ${m.title} | ${m.status} | ${m.score} | ${m.severity} |`);
    }

    // 详细结果
    for (const m of report.meterResults) {
      if (m.status === 'pass') continue;
      lines.push('');
      lines.push(`### ${m.title}`);
      for (const f of m.failures) {
        lines.push(`- ❌ ${f}`);
      }
      for (const w of m.warnings) {
        lines.push(`- ⚠️ ${w}`);
      }
      for (const e of m.evidence) {
        lines.push(`- ℹ️ ${e}`);
      }
    }
  }
  lines.push('');

  // 6. Deviation Vector
  lines.push('## 6. Deviation Vector');
  lines.push('');
  lines.push('```yaml');
  const dv = report.deviation;
  lines.push(`prompt_injection_order_risk: ${dv.prompt_injection_order_risk}`);
  lines.push(`meeting_identity_leakage: ${dv.meeting_identity_leakage}`);
  lines.push(`roleplay_fg_pollution: ${dv.roleplay_fg_pollution}`);
  lines.push(`role_state_residue: ${dv.role_state_residue}`);
  lines.push(`uuid_misownership: ${dv.uuid_misownership}`);
  lines.push(`uuid_annotation_rate_drop: ${dv.uuid_annotation_rate_drop}`);
  lines.push(`familygraph_schema_drift: ${dv.familygraph_schema_drift}`);
  lines.push(`sqlite_persistence_loss: ${dv.sqlite_persistence_loss}`);
  lines.push(`llm_reasoning_content_leak: ${dv.llm_reasoning_content_leak}`);
  lines.push(`behavior_regression: ${dv.behavior_regression}`);
  lines.push(`python_domain_isolation_break: ${dv.python_domain_isolation_break}`);
  lines.push(`globalbus_protocol_violation: ${dv.globalbus_protocol_violation}`);
  lines.push('```');
  lines.push('');

  // 7. Gate Decision
  lines.push('## 7. Gate Decision');
  lines.push('');
  lines.push(`**GATE: ${report.gateDecision}**`);
  lines.push('');

  // 8. Required Human Review
  lines.push('## 8. Required Human Review');
  lines.push('');
  if (report.requiredHumanReview.length === 0) {
    lines.push('_(无)_');
  } else {
    for (const item of report.requiredHumanReview) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');

  // 9. Next Steps
  lines.push('## 9. Next Steps');
  lines.push('');
  if (report.nextSteps.length === 0) {
    lines.push('_(无)_');
  } else {
    for (const item of report.nextSteps) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * 保存报告到文件
 */
export function saveReport(
  rootDir: string,
  report: EvidenceReport,
): { mdPath: string; jsonPath: string } {
  const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
  ensureDir(reportsDir);

  const ts = timestamp();

  // Markdown 报告
  const mdContent = renderMarkdown(report);
  const mdFileName = `evidence-report-${ts}.md`;
  const mdPath = path.join(reportsDir, mdFileName);
  fs.writeFileSync(mdPath, mdContent, 'utf-8');

  // latest.md
  const latestMdPath = path.join(reportsDir, 'latest.md');
  fs.writeFileSync(latestMdPath, mdContent, 'utf-8');

  // JSON 报告
  const jsonFileName = `evidence-report-${ts}.json`;
  const jsonPath = path.join(reportsDir, jsonFileName);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  // latest-result.json
  const latestJsonPath = path.join(reportsDir, 'latest-result.json');
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2), 'utf-8');

  return { mdPath, jsonPath };
}

/**
 * 保存 scan 结果
 */
export function saveScanResult(
  rootDir: string,
  data: unknown,
): string {
  const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
  ensureDir(reportsDir);
  const filePath = path.join(reportsDir, 'latest-scan.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

/**
 * 计算 Deviation Vector
 */
export function computeDeviation(
  meterResults: MeterResult[],
): DeviationVector {
  const dv: DeviationVector = {
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

  for (const m of meterResults) {
    const val = m.status === 'fail' ? 1 : m.status === 'warn' ? 0.5 : 0;
    switch (m.id) {
      case 'prompt-meter':
        dv.prompt_injection_order_risk = val;
        break;
      case 'meeting-mode-meter':
        dv.meeting_identity_leakage = val;
        break;
      case 'roleplay-isolation-meter':
        dv.roleplay_fg_pollution = val;
        dv.role_state_residue = val;
        break;
      case 'uuid-meter':
        // Calibration Patch 1: 结构性断链(FAIL) → 两条都为 1
        // 历史标注率低(WARN) → misownership=0, rate_drop=0.5
        if (m.status === 'fail') {
          dv.uuid_misownership = 1;
          dv.uuid_annotation_rate_drop = 1;
        } else if (m.status === 'warn') {
          dv.uuid_misownership = 0;
          dv.uuid_annotation_rate_drop = 0.5;
        }
        break;
      case 'fg-meter':
        dv.familygraph_schema_drift = val;
        break;
      case 'persist-meter':
        dv.sqlite_persistence_loss = val;
        break;
      case 'llm-meter':
        dv.llm_reasoning_content_leak = val;
        break;
      case 'behavior-meter':
        dv.behavior_regression = val;
        break;
      case 'python-domain-meter':
        dv.python_domain_isolation_break = val;
        dv.globalbus_protocol_violation = val;
        break;
    }
  }

  return dv;
}
