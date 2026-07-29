// ============================================================
// Agent CNC Harness — Meter 注册中心 + 调度器
// ============================================================

import type { HarnessContext, MeterResult, MeterRegistryEntry } from '../types.js';
import { runPromptMeter } from './prompt-meter.js';
import { runMeetingModeMeter } from './meeting-mode-meter.js';
import { runRoleplayIsolationMeter } from './roleplay-isolation-meter.js';
import { runUuidOwnershipMeter } from './uuid-ownership-meter.js';
import { runFgIntegrityMeter } from './fg-integrity-meter.js';
import { runSqlitePersistMeter } from './sqlite-persist-meter.js';
import { runLlmProviderMeter } from './llm-provider-meter.js';
import { runBehaviorMeter } from './behavior-meter.js';
import { runPythonDomainMeter } from './python-domain-meter.js';

/**
 * 所有已注册的 Meter
 * key = meter ID（必须与 harness.yaml 中的 meter id 一致）
 */
const registry: MeterRegistryEntry[] = [
  { id: 'prompt-meter', run: runPromptMeter },
  { id: 'meeting-mode-meter', run: runMeetingModeMeter },
  { id: 'roleplay-isolation-meter', run: runRoleplayIsolationMeter },
  { id: 'uuid-meter', run: runUuidOwnershipMeter },
  { id: 'fg-meter', run: runFgIntegrityMeter },
  { id: 'persist-meter', run: runSqlitePersistMeter },
  { id: 'llm-meter', run: runLlmProviderMeter },
  { id: 'behavior-meter', run: runBehaviorMeter },
  { id: 'python-domain-meter', run: runPythonDomainMeter },
];

/**
 * 获取所有已注册的 meter id
 */
export function getRegisteredMeterIds(): string[] {
  return registry.map((r) => r.id);
}

/**
 * 运行指定的 meter（按 id）
 */
export async function runMeter(
  id: string,
  context: HarnessContext,
): Promise<MeterResult | null> {
  const entry = registry.find((r) => r.id === id);
  if (!entry) return null;
  try {
    return await entry.run(context);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      id,
      title: `Meter ${id}`,
      severity: 'C',
      status: 'fail',
      score: 0,
      evidence: [],
      warnings: [],
      failures: [`Meter 运行异常: ${message}`],
    };
  }
}

/**
 * 批量运行指定的 meter
 */
export async function runMeters(
  ids: string[],
  context: HarnessContext,
): Promise<MeterResult[]> {
  const results: MeterResult[] = [];
  for (const id of ids) {
    const result = await runMeter(id, context);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

/**
 * 运行所有已注册的 meter
 */
export async function runAllMeters(
  context: HarnessContext,
): Promise<MeterResult[]> {
  return runMeters(
    registry.map((r) => r.id),
    context,
  );
}
