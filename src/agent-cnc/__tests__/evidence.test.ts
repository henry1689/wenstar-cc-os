// ============================================================
// Agent CNC Harness — Evidence / Report 单元测试
// 覆盖: buildReport, renderMarkdown, computeDeviation,
//        saveReport, saveScanResult
// 注: 任务书称此模块为 evidence.ts，实际文件为 report.ts
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildReport,
  renderMarkdown,
  computeDeviation,
  saveReport,
  saveScanResult,
} from '../report.js';
import type {
  EvidenceReport,
  MeterResult,
  CommandResult,
  FileRiskInfo,
  DeviationVector,
} from '../types.js';
import { zeroDeviation } from '../types.js';

// ---- 临时目录工具 ----

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-evidence-'));
}

// ---- 共享测试 Fixture ----

function makePassCommand(): CommandResult {
  return {
    command: 'npx tsc --noEmit',
    exitCode: 0,
    stdout: 'TypeScript compilation passed.',
    stderr: '',
    durationMs: 1234,
  };
}

function makeFailCommand(): CommandResult {
  return {
    command: 'npx tsc --noEmit',
    exitCode: 2,
    stdout: '',
    stderr: 'error TS2304: Cannot find name "foo".',
    durationMs: 567,
  };
}

function makeChangedFiles(): FileRiskInfo[] {
  return [
    { path: 'src/webui/chat.ts', risk: 'high', reason: '聊天中枢，22 注入点' },
    { path: 'src/m4/MemoryRetriever.ts', risk: 'medium', reason: '中风险区域文件' },
  ];
}

function makePassMeter(id: string, title: string): MeterResult {
  return {
    id,
    title,
    severity: 'S',
    status: 'pass',
    score: 100,
    evidence: [`${title}: 全部检查通过`],
    warnings: [],
    failures: [],
  };
}

function makeFailMeter(id: string, title: string): MeterResult {
  return {
    id,
    title,
    severity: 'S',
    status: 'fail',
    score: 0,
    evidence: [],
    warnings: [],
    failures: [`${title}: 结构性断链`],
  };
}

function makeWarnMeter(id: string, title: string): MeterResult {
  return {
    id,
    title,
    severity: 'A',
    status: 'warn',
    score: 50,
    evidence: [],
    warnings: [`${title}: 建议人工审查`],
    failures: [],
  };
}

// ---- 最小合法 buildReport 参数 ----

function minimalParams(overrides: Partial<Parameters<typeof buildReport>[0]> = {}) {
  return {
    project: 'WenStarOS',
    mode: 'auto',
    result: 'PASS' as const,
    overallRisk: 'medium',
    changedFiles: [] as FileRiskInfo[],
    triggeredWorkflows: [] as string[],
    commandResults: [] as CommandResult[],
    meterResults: [] as MeterResult[],
    deviation: zeroDeviation(),
    gateDecision: 'PASS' as const,
    requiredHumanReview: [] as string[],
    nextSteps: [] as string[],
    ...overrides,
  };
}

// ============================================================
// buildReport
// ============================================================

describe('buildReport', () => {
  it('场景 1: 最小合法输入 → 返回 EvidenceReport 包含全部必需字段', () => {
    const report = buildReport(minimalParams());

    expect(report.project).toBe('WenStarOS');
    expect(report.mode).toBe('auto');
    expect(report.result).toBe('PASS');
    expect(report.overallRisk).toBe('medium');
    expect(report.gateDecision).toBe('PASS');
    // time 应为 ISO 8601 格式
    expect(report.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // 数组字段存在且为空
    expect(Array.isArray(report.changedFiles)).toBe(true);
    expect(Array.isArray(report.triggeredWorkflows)).toBe(true);
    expect(Array.isArray(report.commandResults)).toBe(true);
    expect(Array.isArray(report.meterResults)).toBe(true);
    expect(Array.isArray(report.requiredHumanReview)).toBe(true);
    expect(Array.isArray(report.nextSteps)).toBe(true);
    // deviation 包含全零向量
    expect(report.deviation.prompt_injection_order_risk).toBe(0);
  });

  it('场景 2: 所有 command exitCode=0 → result=PASS, gateDecision=PASS', () => {
    const report = buildReport(
      minimalParams({
        commandResults: [
          { command: 'npx tsc --noEmit', exitCode: 0, stdout: 'ok', stderr: '', durationMs: 100 },
        ],
        gateDecision: 'PASS',
      }),
    );

    expect(report.result).toBe('PASS');
    expect(report.gateDecision).toBe('PASS');
    expect(report.commandResults).toHaveLength(1);
    expect(report.commandResults[0].exitCode).toBe(0);
  });

  it('场景 3: 任一 command exitCode≠0 → result=FAIL, gateDecision=FAIL', () => {
    const report = buildReport(
      minimalParams({
        result: 'FAIL',
        commandResults: [
          makePassCommand(),
          makeFailCommand(),
        ],
        gateDecision: 'FAIL',
      }),
    );

    expect(report.result).toBe('FAIL');
    expect(report.gateDecision).toBe('FAIL');
    // 两个 command 都在
    expect(report.commandResults).toHaveLength(2);
    // 第二个是失败的命令
    expect(report.commandResults[1].exitCode).toBe(2);
    expect(report.commandResults[1].stderr).toContain('TS2304');
  });

  it('场景 4: changedFiles / workflows / meters 被正确传递到报告', () => {
    const files = makeChangedFiles();
    const meters = [makePassMeter('prompt-meter', 'Prompt注入顺序检查')];

    const report = buildReport(
      minimalParams({
        changedFiles: files,
        triggeredWorkflows: ['chat_ts_change'],
        meterResults: meters,
      }),
    );

    // changedFiles
    expect(report.changedFiles).toHaveLength(2);
    expect(report.changedFiles[0].path).toBe('src/webui/chat.ts');
    expect(report.changedFiles[0].risk).toBe('high');
    expect(report.changedFiles[0].reason).toBe('聊天中枢，22 注入点');
    expect(report.changedFiles[1].path).toBe('src/m4/MemoryRetriever.ts');

    // triggeredWorkflows
    expect(report.triggeredWorkflows).toContain('chat_ts_change');

    // meterResults
    expect(report.meterResults).toHaveLength(1);
    expect(report.meterResults[0].id).toBe('prompt-meter');
    expect(report.meterResults[0].status).toBe('pass');
  });
});

// ============================================================
// renderMarkdown
// ============================================================

describe('renderMarkdown', () => {
  it('场景 5: 完整报告 → 生成包含 9 个章节标题的 Markdown', () => {
    const report = buildReport(
      minimalParams({
        changedFiles: makeChangedFiles(),
        triggeredWorkflows: ['chat_ts_change'],
        commandResults: [makePassCommand()],
        meterResults: [makePassMeter('prompt-meter', 'Prompt注入顺序检查')],
      }),
    );

    const md = renderMarkdown(report);

    // 主标题
    expect(md).toContain('# Agent CNC Evidence Report');
    // 9 个章节标题
    expect(md).toContain('## 1. Summary');
    expect(md).toContain('## 2. Changed Files');
    expect(md).toContain('## 3. Triggered Workflows');
    expect(md).toContain('## 4. Commands');
    expect(md).toContain('## 5. Meter Results');
    expect(md).toContain('## 6. Deviation Vector');
    expect(md).toContain('## 7. Gate Decision');
    expect(md).toContain('## 8. Required Human Review');
    expect(md).toContain('## 9. Next Steps');
    // Summary 中包含关键信息
    expect(md).toContain('**Project:** WenStarOS');
    expect(md).toContain('**Result:** PASS');
    expect(md).toContain('**Gate Decision:** PASS');
    // Changed Files 表格
    expect(md).toContain('src/webui/chat.ts');
    expect(md).toContain('high');
    expect(md).toContain('聊天中枢');
  });

  it('场景 6: FAIL 命令 → Markdown 显示 ❌ FAIL', () => {
    const report = buildReport(
      minimalParams({
        result: 'FAIL',
        gateDecision: 'FAIL',
        commandResults: [makeFailCommand()],
      }),
    );

    const md = renderMarkdown(report);

    // Gate Decision 行
    expect(md).toContain('**GATE: FAIL**');
    // Command Result 表格
    expect(md).toContain('❌ FAIL');
    // stderr 摘要
    expect(md).toContain('error TS2304');
  });

  it('场景 7: 空 changedFiles / workflows → 显示 "(无)" 占位符', () => {
    const report = buildReport(minimalParams());

    const md = renderMarkdown(report);

    expect(md).toContain('_(无变更文件)_');
    expect(md).toContain('_(无触发工作流)_');
    expect(md).toContain('_(无执行命令)_');
    expect(md).toContain('_(无 Meter 结果)_');
    expect(md).toContain('_(无)_'); // Required Human Review + Next Steps
  });

  it('场景 7b: stdout 超 2000 字符 → 截断标记出现', () => {
    const longStdout = 'x'.repeat(2500);
    const report = buildReport(
      minimalParams({
        commandResults: [
          { command: 'long-cmd', exitCode: 0, stdout: longStdout, stderr: '', durationMs: 100 },
        ],
      }),
    );

    const md = renderMarkdown(report);

    expect(md).toContain('...(truncated)');
    // 截断后不应包含完整 2500 字符
    expect(md).not.toContain(longStdout);
  });
});

// ============================================================
// computeDeviation
// ============================================================

describe('computeDeviation', () => {
  it('场景 8: 所有 meter status=pass → 零向量', () => {
    const meters: MeterResult[] = [
      makePassMeter('prompt-meter', 'Prompt检查'),
      makePassMeter('uuid-meter', 'UUID检查'),
      makePassMeter('fg-meter', 'FG检查'),
    ];

    const dv = computeDeviation(meters);

    // 全零
    expect(dv.prompt_injection_order_risk).toBe(0);
    expect(dv.meeting_identity_leakage).toBe(0);
    expect(dv.roleplay_fg_pollution).toBe(0);
    expect(dv.uuid_misownership).toBe(0);
    expect(dv.uuid_annotation_rate_drop).toBe(0);
    expect(dv.familygraph_schema_drift).toBe(0);
    expect(dv.sqlite_persistence_loss).toBe(0);
    expect(dv.llm_reasoning_content_leak).toBe(0);
    expect(dv.behavior_regression).toBe(0);
    expect(dv.python_domain_isolation_break).toBe(0);
    expect(dv.globalbus_protocol_violation).toBe(0);
  });

  it('场景 9a: uuid-meter fail → misownership=1, rate_drop=1', () => {
    const meters: MeterResult[] = [
      makeFailMeter('uuid-meter', 'UUID归属检查'),
    ];

    const dv = computeDeviation(meters);

    expect(dv.uuid_misownership).toBe(1);
    expect(dv.uuid_annotation_rate_drop).toBe(1);
  });

  it('场景 9b: uuid-meter warn → misownership=0, rate_drop=0.5 (校准补丁)', () => {
    const meters: MeterResult[] = [
      makeWarnMeter('uuid-meter', 'UUID归属检查'),
    ];

    const dv = computeDeviation(meters);

    expect(dv.uuid_misownership).toBe(0);
    expect(dv.uuid_annotation_rate_drop).toBe(0.5);
  });

  it('场景 9c: roleplay meter fail → fg_pollution=1, state_residue=1', () => {
    const meters: MeterResult[] = [
      makeFailMeter('roleplay-isolation-meter', '角色隔离'),
    ];

    const dv = computeDeviation(meters);

    expect(dv.roleplay_fg_pollution).toBe(1);
    expect(dv.role_state_residue).toBe(1);
  });

  it('场景 9d: python-domain-meter warn → isolation_break=0.5, protocol_violation=0.5', () => {
    const meters: MeterResult[] = [
      makeWarnMeter('python-domain-meter', 'Python三域'),
    ];

    const dv = computeDeviation(meters);

    expect(dv.python_domain_isolation_break).toBe(0.5);
    expect(dv.globalbus_protocol_violation).toBe(0.5);
  });

  it('场景 9e: 未知 meter id → 不影响 deviation', () => {
    const dv = computeDeviation([
      { id: 'unknown-meter', title: '未知', severity: 'B', status: 'fail', score: 0, evidence: [], warnings: [], failures: ['fail'] },
    ]);

    // 所有字段仍为零
    expect(dv.prompt_injection_order_risk).toBe(0);
    expect(dv.uuid_misownership).toBe(0);
  });
});

// ============================================================
// saveReport
// ============================================================

describe('saveReport', () => {
  it('场景 10: 写入临时目录 → .md 和 .json 文件存在且内容正确', () => {
    const rootDir = makeTempDir();
    const meterResults = [makeFailMeter('uuid-meter', 'UUID检查')];
    const deviation = computeDeviation(meterResults);
    // saveReport 需要 .agent-cnc/reports/ 目录（由 ensureDir 自动创建）
    const report = buildReport(
      minimalParams({
        changedFiles: makeChangedFiles(),
        commandResults: [makeFailCommand()],
        meterResults,
        deviation,
        result: 'FAIL',
        gateDecision: 'FAIL',
        requiredHumanReview: ['uuid-meter: UUID结构性断链，人工确认'],
        nextSteps: ['修复UUID归属链路', '重新运行 guard'],
      }),
    );

    const { mdPath, jsonPath } = saveReport(rootDir, report);

    // 文件存在
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(true);

    // ----- Markdown 内容断言 -----
    const mdContent = fs.readFileSync(mdPath, 'utf-8');

    // 标题
    expect(mdContent).toContain('# Agent CNC Evidence Report');
    // FAIL 状态
    expect(mdContent).toContain('**Result:** FAIL');
    expect(mdContent).toContain('**GATE: FAIL**');
    // 变更文件
    expect(mdContent).toContain('src/webui/chat.ts');
    // 失败命令
    expect(mdContent).toContain('❌ FAIL');
    expect(mdContent).toContain('TS2304');
    // Meter 失败
    expect(mdContent).toContain('UUID检查');
    // Deviation Vector
    expect(mdContent).toContain('uuid_misownership: 1');
    // Human Review
    expect(mdContent).toContain('UUID结构性断链');
    // Next Steps
    expect(mdContent).toContain('重新运行 guard');

    // ----- JSON 内容断言 -----
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(jsonContent) as EvidenceReport;

    expect(parsed.project).toBe('WenStarOS');
    expect(parsed.result).toBe('FAIL');
    expect(parsed.gateDecision).toBe('FAIL');
    expect(parsed.changedFiles).toHaveLength(2);
    expect(parsed.changedFiles[0].path).toBe('src/webui/chat.ts');
    expect(parsed.commandResults).toHaveLength(1);
    expect(parsed.commandResults[0].exitCode).toBe(2);
    expect(parsed.meterResults).toHaveLength(1);
    expect(parsed.meterResults[0].id).toBe('uuid-meter');
    expect(parsed.deviation.uuid_misownership).toBe(1);
    expect(parsed.requiredHumanReview).toHaveLength(1);
    expect(parsed.nextSteps).toHaveLength(2);

    // ----- latest.md / latest-result.json 也存在 -----
    const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
    expect(fs.existsSync(path.join(reportsDir, 'latest.md'))).toBe(true);
    expect(fs.existsSync(path.join(reportsDir, 'latest-result.json'))).toBe(true);
  });
});

// ============================================================
// saveScanResult
// ============================================================

describe('saveScanResult', () => {
  it('场景 10b: 写 scan JSON 到临时目录 → 文件存在且内容可解析', () => {
    const rootDir = makeTempDir();
    const scanData = {
      overallRisk: 'high',
      files: [
        { path: 'src/webui/chat.ts', risk: 'high', reason: '聊天中枢' },
      ],
      triggeredWorkflows: ['chat_ts_change'],
      requiredMeters: ['prompt-meter'],
      requirePlan: true,
    };

    const filePath = saveScanResult(rootDir, scanData);

    // 文件存在
    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain('latest-scan.json');

    // 内容可解析
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.overallRisk).toBe('high');
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].path).toBe('src/webui/chat.ts');
    expect(parsed.triggeredWorkflows).toContain('chat_ts_change');
    expect(parsed.requirePlan).toBe(true);
  });
});
