#!/usr/bin/env tsx
// ============================================================
// Agent CNC Harness — CLI 入口
// 命令路由: doctor | scan | validate | guard | report
// ============================================================

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  loadConfig,
  loadRiskMap,
  loadHarnessConfig,
  checkConfigFiles,
  checkLlmConfigured,
} from './config.js';
import {
  getChangedFilesSafe,
  getChangedFilesSince,
  isGitAvailable,
  isGitRepo,
} from './git.js';
import { routeRisks } from './risk-router.js';
import { routeWorkflows, aggregateRequirements } from './workflow-router.js';
import { runTypeCheck, runVitest, runCommand } from './command-runner.js';
import { validateConfig, checkMeterRegistry } from './validators.js';
import {
  buildReport,
  saveReport,
  saveScanResult,
  computeDeviation,
} from './report.js';
import { runMeters, getRegisteredMeterIds } from './meters/index.js';
import { fileExists, readTextFile, getNodeVersion, normalizePath } from './utils.js';
import type {
  ScanResult,
  CommandResult,
  MeterResult,
  DeviationVector,
  HarnessContext,
  FileRiskInfo,
} from './types.js';

// ---- 参数解析 ----

interface CliArgs {
  command: string;
  noTest: boolean;
  test: boolean;
  strict: boolean;
  offline: boolean;
  planPath: string | null;
  baseRef: string | null;
  files: string[] | null;
}

export function parseArgs(raw: string[]): CliArgs {
  const args: CliArgs = {
    command: raw.length > 0 ? raw[0] : 'doctor',
    noTest: false,
    test: false,
    strict: false,
    offline: false,
    planPath: null,
    baseRef: null,
    files: null,
  };

  let i = 1;
  while (i < raw.length) {
    const a = raw[i];
    switch (a) {
      case '--no-test':
        args.noTest = true;
        break;
      case '--test':
        args.test = true;
        break;
      case '--strict':
        args.strict = true;
        break;
      case '--offline':
        args.offline = true;
        break;
      case '--plan':
        if (i + 1 < raw.length) {
          args.planPath = raw[i + 1];
          i++;
        }
        break;
      case '--base':
        if (i + 1 < raw.length) {
          args.baseRef = raw[i + 1];
          i++;
        }
        break;
      case '--files':
        if (i + 1 < raw.length) {
          args.files = raw[i + 1].split(',').map((f: string) => f.trim());
          i++;
        }
        break;
      default:
        // 可能是子命令
        if (!a.startsWith('--')) {
          args.command = a;
        }
    }
    i++;
  }

  return args;
}

// ---- Runtime（可注入，支持测试） ----

export interface CliRuntime {
  cwd(): string;
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  exit(code: number): never;
}

export const defaultRuntime: CliRuntime = {
  cwd: () => process.cwd(),
  log: (...args: unknown[]) => console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
  exit: (code: number): never => process.exit(code),
};

// ---- 辅助 ----

const ROOT_DIR = process.cwd();

function getRunMode(): string {
  return 'offline_deterministic_guard';
}

export function hasLine(content: string, search: string): boolean {
  return content.split('\n').some((line) => line.includes(search));
}

// ---- doctor ----

function cmdDoctor(): void {
  console.log('[Agent CNC] Doctor');
  console.log('');

  const configFiles = checkConfigFiles(ROOT_DIR);
  const nodeVersion = getNodeVersion();
  const llmStatus = checkLlmConfigured();

  // 检查 tsc/vitest/tsx
  const pkgJsonPath = path.join(ROOT_DIR, 'package.json');
  let tscAvailable = false;
  let vitestAvailable = false;
  let tsxAvailable = false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    tscAvailable = !!(pkg.devDependencies?.typescript || pkg.dependencies?.typescript);
    vitestAvailable = !!(pkg.devDependencies?.vitest || pkg.dependencies?.vitest);
    tsxAvailable = !!(pkg.devDependencies?.tsx || pkg.dependencies?.tsx);
  } catch {
    // skip
  }

  // 检查脚本自身
  const cliExists = fileExists(path.join(ROOT_DIR, 'src', 'agent-cnc', 'cli.ts'));
  const harnessExists = fileExists(path.join(ROOT_DIR, '.agent-cnc', 'harness.yaml'));
  const riskMapExists = fileExists(path.join(ROOT_DIR, '.agent-cnc', 'risk-map.yaml'));

  console.log(`Project: WenStarOS`);
  console.log(`Mode: ${getRunMode()}`);
  console.log(`LLM: ${llmStatus}`);
  console.log(`Config: ${configFiles.exists ? 'OK' : `MISSING: ${configFiles.missing.join(', ')}`}`);
  console.log(`Git: ${isGitAvailable() ? 'OK' : 'NOT FOUND'}`);
  console.log(`Node: ${nodeVersion}`);
  console.log(`TypeScript: ${tscAvailable ? 'OK' : 'MISSING'}`);
  console.log(`Vitest: ${vitestAvailable ? 'OK' : 'MISSING'}`);
  console.log(`tsx: ${tsxAvailable ? 'OK' : 'MISSING'}`);
  console.log(`CLI Entry: ${cliExists ? 'OK' : 'MISSING'}`);
  console.log(`harness.yaml: ${harnessExists ? 'OK' : 'MISSING'}`);
  console.log(`risk-map.yaml: ${riskMapExists ? 'OK' : 'MISSING'}`);

  const allOk = configFiles.exists && tscAvailable && vitestAvailable && tsxAvailable;
  console.log(`Result: ${allOk ? 'PASS' : 'WARN'}`);
}

// ---- scan ----

export function cmdScan(args: CliArgs, rt: CliRuntime): void {
  const rootDir = rt.cwd();
  rt.log('[Agent CNC] Scan');
  rt.log('');

  // 获取变更文件
  let changedFiles: string[];

  if (args.files) {
    // 用户指定文件
    changedFiles = args.files.map(normalizePath);
    rt.log(`Using --files: ${changedFiles.length} file(s)`);
  } else if (args.baseRef) {
    // 指定 base ref
    if (!isGitAvailable() || !isGitRepo()) {
      rt.log('Git 不可用，无法使用 --base。请使用 --files 指定文件。');
      changedFiles = [];
    } else {
      changedFiles = getChangedFilesSince(args.baseRef);
      rt.log(`Changed files since ${args.baseRef}: ${changedFiles.length}`);
    }
  } else {
    // 默认 git diff
    changedFiles = getChangedFilesSafe();
    if (changedFiles.length === 0 && !isGitAvailable()) {
      rt.log('Git 不可用且未指定 --files。');
      rt.log('提示: 使用 --files 手动指定变更文件');
    }
    rt.log(`Changed files: ${changedFiles.length}`);
  }

  // 如果没有变更文件
  if (changedFiles.length === 0) {
    rt.log('No changed files. Clean state.');
    const emptyResult: ScanResult = {
      overallRisk: 'low',
      files: [],
      triggeredWorkflows: [],
      requiredMeters: [],
      requirePlan: false,
    };
    saveScanResult(rootDir, emptyResult);
    return;
  }

  // 加载配置
  const riskMap = loadRiskMap(rootDir);
  const harnessConfig = loadHarnessConfig(rootDir);

  if (!riskMap) {
    rt.error('ERROR: 无法加载 risk-map.yaml');
    rt.exit(1);
  }
  if (!harnessConfig) {
    rt.error('ERROR: 无法加载 harness.yaml');
    rt.exit(1);
  }

  // 风险路由
  const scanResult = routeRisks(changedFiles, riskMap, harnessConfig);

  // 输出
  rt.log(`Overall Risk: ${scanResult.overallRisk.toUpperCase()}`);
  rt.log(`Require Plan: ${scanResult.requirePlan ? 'YES' : 'No'}`);
  rt.log(`Triggered Workflows: ${scanResult.triggeredWorkflows.length > 0 ? scanResult.triggeredWorkflows.join(', ') : '(none)'}`);
  rt.log(`Required Meters: ${scanResult.requiredMeters.length > 0 ? scanResult.requiredMeters.join(', ') : '(none)'}`);
  rt.log('');

  rt.log('Files:');
  for (const f of scanResult.files) {
    const icon = f.risk === 'high' ? '🔴' : f.risk === 'medium' ? '🟡' : '🟢';
    rt.log(`  ${icon} [${f.risk.toUpperCase()}] ${f.path}`);
    rt.log(`      ${f.reason}`);
  }

  // 保存
  saveScanResult(rootDir, { changedFiles, scanResult });
  rt.log('');
  rt.log('Report saved: .agent-cnc/reports/latest-scan.json');
}

// ---- validate ----

export function cmdValidate(rt: CliRuntime): void {
  const rootDir = rt.cwd();
  rt.log('[Agent CNC] Validate');
  rt.log('');

  const result = validateConfig(rootDir);

  if (result.missingFiles.length > 0) {
    rt.log('Missing files:');
    for (const f of result.missingFiles) {
      rt.log(`  ❌ ${f}`);
    }
    rt.log('');
  }

  if (result.invalidYaml.length > 0) {
    rt.log('Invalid YAML:');
    for (const f of result.invalidYaml) {
      rt.log(`  ❌ ${f}`);
    }
    rt.log('');
  }

  if (result.missingFields.length > 0) {
    rt.log('Missing fields:');
    for (const f of result.missingFields) {
      rt.log(`  ❌ ${f}`);
    }
    rt.log('');
  }

  if (result.errors.length > 0) {
    rt.log('Errors:');
    for (const e of result.errors) {
      rt.log(`  ❌ ${e}`);
    }
    rt.log('');
  }

  if (result.warnings.length > 0) {
    rt.log('Warnings:');
    for (const w of result.warnings) {
      rt.log(`  ⚠️ ${w}`);
    }
    rt.log('');
  }

  // 校验 meter registry
  const registeredIds = getRegisteredMeterIds();
  const missingMeters = checkMeterRegistry(rootDir, registeredIds);
  if (missingMeters.length > 0) {
    rt.log('Missing meter implementations:');
    for (const m of missingMeters) {
      rt.log(`  ❌ ${m}`);
    }
    // 加到结果中
    result.missingMeterImplementations.push(...missingMeters);
    result.passed = false;
  }

  rt.log(`Validation: ${result.passed ? 'PASS' : 'FAIL'}`);
  if (!result.passed) {
    rt.exit(1);
  }
}

// ---- guard ----

async function cmdGuard(args: CliArgs): Promise<void> {
  console.log('[Agent CNC] Guard');
  console.log('');

  const commandResults: CommandResult[] = [];
  const meterResults: MeterResult[] = [];
  const gateFailReasons: string[] = [];
  const gateWarnings: string[] = [];
  let scanResult: ScanResult | null = null;

  // 1. 执行 scan
  let changedFiles: string[];
  if (args.files) {
    changedFiles = args.files.map(normalizePath);
  } else {
    changedFiles = getChangedFilesSafe();
  }

  if (changedFiles.length === 0 && !args.files) {
    console.log('No changed files. Running validation only.');
  }

  // 2. 执行 validate
  console.log('--- Validating config ---');
  const validation = validateConfig(ROOT_DIR);
  const registeredIds = getRegisteredMeterIds();
  const missingMeters = checkMeterRegistry(ROOT_DIR, registeredIds);
  if (missingMeters.length > 0) {
    validation.passed = false;
    validation.missingMeterImplementations.push(...missingMeters);
  }

  if (!validation.passed) {
    gateFailReasons.push('validate 失败');
    console.log('Validation: FAIL');
    for (const e of validation.missingFiles) console.log(`  ❌ Missing: ${e}`);
    for (const e of validation.invalidYaml) console.log(`  ❌ Invalid: ${e}`);
    for (const e of validation.missingFields) console.log(`  ❌ Missing field: ${e}`);
    for (const e of validation.missingMeterImplementations) console.log(`  ❌ ${e}`);
  } else {
    console.log('Validation: PASS');
  }

  // 3. 加载配置 + 风险路由
  const riskMap = loadRiskMap(ROOT_DIR);
  const harnessConfig = loadHarnessConfig(ROOT_DIR);

  if (!riskMap || !harnessConfig) {
    console.error('ERROR: 配置文件加载失败');
    process.exit(1);
  }

  if (changedFiles.length > 0) {
    scanResult = routeRisks(changedFiles, riskMap, harnessConfig);
    console.log(`\n--- Risk Assessment ---`);
    console.log(`Overall Risk: ${scanResult.overallRisk.toUpperCase()}`);
    console.log(`Require Plan: ${scanResult.requirePlan ? 'YES' : 'No'}`);
    console.log(`Files: ${scanResult.files.length}`);
    for (const f of scanResult.files) {
      if (f.risk !== 'low') {
        console.log(`  ${f.risk.toUpperCase()} ${f.path}`);
      }
    }

    // 4. 高风险 Plan 检查
    if (scanResult.overallRisk === 'high') {
      // 检查 Plan 是否存在
      const defaultPlanPath = path.join(
        ROOT_DIR,
        '.agent-cnc',
        'reports',
        'current-plan.md',
      );
      const planPath = args.planPath || defaultPlanPath;
      const planExists = fileExists(planPath);

      if (!planExists) {
        gateFailReasons.push('high_risk_without_plan');
        console.log('\n❌ HIGH RISK but no Plan found!');
        console.log(`   Expected: ${planPath}`);
        console.log('   Use --plan <path> to specify plan, or create current-plan.md');
      } else {
        // 检查 Plan 必须包含的章节
        const planContent = readTextFile(planPath) || '';
        const requiredSections = [
          '## 修改目标',
          '## 涉及文件',
          '## 风险分析',
          '## 验证计划',
          '## 回滚方案',
        ];
        const missingSections: string[] = [];
        for (const section of requiredSections) {
          if (!planContent.includes(section)) {
            missingSections.push(section);
          }
        }
        if (missingSections.length > 0) {
          gateFailReasons.push('plan_missing_sections');
          console.log(`\n❌ Plan 缺少必需章节: ${missingSections.join(', ')}`);
        } else {
          console.log(`\n✅ Plan found: ${planPath}`);
          console.log('   All required sections present.');
        }
      }

      // 高风险无 Plan 直接 FAIL
      if (!planExists) {
        // 但仍执行 typecheck 收集证据
      }
    }
  }

  // 5. 执行 TypeScript 编译检查（默认必须）
  console.log('\n--- TypeScript Compile Check ---');
  const tscResult = runTypeCheck(ROOT_DIR);
  commandResults.push(tscResult);
  if (tscResult.exitCode !== 0) {
    gateFailReasons.push('tsc --noEmit 失败');
    console.log(`❌ tsc --noEmit FAILED (${tscResult.durationMs}ms)`);
  } else {
    console.log(`✅ tsc --noEmit PASSED (${tscResult.durationMs}ms)`);
  }

  // 6. Vitest（仅在 --test 或 --strict 时跑）
  if (args.test || args.strict) {
    console.log('\n--- Vitest ---');
    const vitestResult = runVitest(ROOT_DIR);
    commandResults.push(vitestResult);
    if (vitestResult.exitCode !== 0) {
      if (args.strict) {
        gateFailReasons.push('vitest 失败 (strict mode)');
      } else {
        gateWarnings.push('vitest 失败（非 strict 模式）');
      }
      console.log(`❌ vitest FAILED (${vitestResult.durationMs}ms)`);
    } else {
      console.log(`✅ vitest PASSED (${vitestResult.durationMs}ms)`);
    }
  }

  // 7. 执行 Meter
  if (scanResult && scanResult.requiredMeters.length > 0) {
    console.log('\n--- Meter Execution ---');

    // 构建 HarnessContext
    const context: HarnessContext = {
      rootDir: ROOT_DIR,
      changedFiles,
      riskResult: scanResult,
      dbAvailable: fileExists(path.join(ROOT_DIR, 'data', 'webui', 'fusion_memory.db')),
      dbPath: path.join(ROOT_DIR, 'data', 'webui', 'fusion_memory.db'),
      wenstarOsRoot: process.env['WENSTAR_OS_ROOT'] || null,
    };

    const results = await runMeters(scanResult.requiredMeters, context);
    meterResults.push(...results);

    for (const m of results) {
      const icon =
        m.status === 'pass'
          ? '✅'
          : m.status === 'warn'
            ? '⚠️'
            : m.status === 'fail'
              ? '❌'
              : '⏭️';
      console.log(`  ${icon} ${m.title}: ${m.status} (score: ${m.score})`);

      if (m.status === 'fail' && m.severity === 'S') {
        gateFailReasons.push(`S severity meter failed: ${m.id}`);
      }
    }

    // 检查 required meter 是否都执行了
    const executedIds = results.map((r) => r.id);
    for (const requiredId of scanResult.requiredMeters) {
      if (!executedIds.includes(requiredId)) {
        gateFailReasons.push(`required meter missing: ${requiredId}`);
      }
    }
  }

  // 8. Gate 判定
  console.log('\n--- Gate Decision ---');
  const gatePassed = gateFailReasons.length === 0;

  if (gatePassed) {
    console.log('GATE: PASS');
    if (gateWarnings.length > 0) {
      console.log('Warnings:');
      for (const w of gateWarnings) console.log(`  ⚠️ ${w}`);
    }
  } else {
    console.log('GATE: FAIL');
    console.log('Reasons:');
    for (const r of gateFailReasons) console.log(`  ❌ ${r}`);
  }

  // 9. 生成报告
  const deviation = computeDeviation(meterResults);

  const report = buildReport({
    project: 'WenStarOS',
    mode: getRunMode(),
    result: gatePassed ? (gateWarnings.length > 0 ? 'WARN' : 'PASS') : 'FAIL',
    overallRisk: scanResult?.overallRisk || 'low',
    changedFiles: scanResult?.files || [],
    triggeredWorkflows: scanResult?.triggeredWorkflows || [],
    commandResults,
    meterResults,
    deviation,
    gateDecision: gatePassed ? 'PASS' : 'FAIL',
    requiredHumanReview: [
      ...gateFailReasons.map((r) => `修复: ${r}`),
      ...gateWarnings.map((w) => `注意: ${w}`),
    ],
    nextSteps: gatePassed
      ? ['Gate 已通过，可继续开发']
      : ['修复以上 FAIL 项后重新运行 guard'],
  });

  const { mdPath, jsonPath } = saveReport(ROOT_DIR, report);
  console.log(`\nReport saved:`);
  console.log(`  MD:  ${mdPath}`);
  console.log(`  JSON: ${jsonPath}`);

  if (!gatePassed) {
    process.exit(1);
  }
}

// ---- report ----

function cmdReport(): void {
  console.log('[Agent CNC] Report');
  console.log('');

  const latestJsonPath = path.join(
    ROOT_DIR,
    '.agent-cnc',
    'reports',
    'latest-result.json',
  );

  if (!fileExists(latestJsonPath)) {
    console.log('No previous report found. Run `guard` first to generate a report.');
    return;
  }

  // 读取最近结果
  const data = JSON.parse(fs.readFileSync(latestJsonPath, 'utf-8'));

  // 重新生成时间戳版本
  const report = buildReport({
    project: data.project || 'WenStarOS',
    mode: data.mode || getRunMode(),
    result: data.result || 'PASS',
    overallRisk: data.overallRisk || 'low',
    changedFiles: data.changedFiles || [],
    triggeredWorkflows: data.triggeredWorkflows || [],
    commandResults: data.commandResults || [],
    meterResults: data.meterResults || [],
    deviation: data.deviation || {},
    gateDecision: data.gateDecision || 'PASS',
    requiredHumanReview: data.requiredHumanReview || [],
    nextSteps: data.nextSteps || [],
  });

  const { mdPath } = saveReport(ROOT_DIR, report);
  console.log(`Report generated:`);
  console.log(`  ${mdPath}`);
  console.log(`  .agent-cnc/reports/latest.md`);
}

// ---- Main ----

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  switch (args.command) {
    case 'doctor':
      cmdDoctor();
      break;
    case 'scan':
      cmdScan(args, defaultRuntime);
      break;
    case 'validate':
      cmdValidate(defaultRuntime);
      break;
    case 'guard':
      await cmdGuard(args);
      break;
    case 'report':
      cmdReport();
      break;
    default:
      console.log(`Unknown command: ${args.command}`);
      console.log('Available: doctor | scan | validate | guard | report');
      process.exit(1);
  }
}

// vitest 环境下不自动执行（由测试显式调用）
if (!process.env['VITEST']) {
  main().catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    console.error('FATAL:', message);
    process.exit(1);
  });
}
