// ============================================================
// Agent CNC Harness — risk-router.ts 单元测试
// 覆盖: routeRisks（风险分类 + Workflow 触发 + Meter 聚合）
// ============================================================

import { describe, it, expect } from 'vitest';
import { routeRisks } from '../risk-router.js';
import type { RiskMapConfig, HarnessConfig, ScanResult } from '../types.js';

// ---- 共享的内联测试配置 ----
// 精简自真实 risk-map.yaml + harness.yaml，聚焦关键路由场景

const TEST_RISK_MAP: RiskMapConfig = {
  risk_map: {
    version: '0.1',
    high_risk: {
      severity: 'S',
      require_plan: true,
      require_human_approval: true,
      files: [
        { path: 'src/webui/chat.ts', reason: '聊天中枢，22 注入点' },
        { path: 'src/m5/DeepSeekLLMProvider.ts', reason: 'LLM 输出清洁性' },
      ],
    },
    medium_risk: {
      severity: 'A',
      require_plan: 'recommended',
      files: [
        'src/m3/PerceptionAnalyzer.ts',
        'src/m4/MemoryRetriever.ts',
      ],
    },
    low_risk: {
      severity: 'B',
      allow_direct_patch: true,
      path_patterns: [
        '**/__tests__/**',
        'src/config/**',
        'src/types/**',
      ],
    },
  },
};

const TEST_HARNESS: HarnessConfig = {
  agent_cnc_harness: {
    version: '0.1',
    project: 'WenStarOS',
    commands: {
      typecheck: 'npx tsc --noEmit',
      test_all: 'npx vitest run',
      health_check: 'npx tsx src/cli/health-check.ts',
      sandbox: 'npx tsx src/cli/sandbox.ts',
    },
    trigger_workflows: [
      {
        id: 'chat_ts_change',
        when_any_changed: [
          'src/webui/chat.ts',
          'src/webui/chat/**',
          'src/engine/tianquan/prefrontal/PrefrontalCortex.ts',
        ],
        workflow: 'workflows/chat-ts-change.yaml',
        meters: ['prompt-meter', 'meeting-mode-meter', 'behavior-meter'],
      },
      {
        id: 'roleplay_change',
        when_any_changed: [
          'src/app/role/**',
          'src/app/persona/**',
          'src/**/RoleplayPromptBuilder.ts',
          'src/**/PromptAssembler.ts',
        ],
        workflow: 'workflows/roleplay-change.yaml',
        meters: ['roleplay-isolation-meter', 'fg-meter', 'behavior-meter'],
      },
      {
        id: 'sqlite_change',
        when_any_changed: [
          'src/m2/SQLiteAdapter.ts',
          'src/**/ConversationDB.ts',
          'scripts/**',
        ],
        workflow: 'workflows/sqlite-change.yaml',
        meters: ['persist-meter', 'uuid-meter'],
      },
    ],
    gates: {
      block_on: ['s_severity_meter_failed', 'high_risk_without_plan'],
    },
    autonomy: {
      default_level: 'A2',
      max_level: 'A4',
      allow_auto_patch_for: ['docs', 'tests', 'config'],
      require_human_approval_for: ['chat_ts_change', 'sqlite_change'],
    },
  },
};

// ---- 辅助断言 ----

/** 快速获取单个文件的结果 */
function singleFile(file: string): ScanResult {
  return routeRisks([file], TEST_RISK_MAP, TEST_HARNESS);
}

// ============================================================
// 风险分类
// ============================================================

describe('routeRisks — 风险分类', () => {
  it('A. 高风险文件精确匹配 → overallRisk=high, requirePlan=true', () => {
    const result = singleFile('src/webui/chat.ts');
    expect(result.overallRisk).toBe('high');
    expect(result.requirePlan).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toBe('聊天中枢，22 注入点');
  });

  it('B. 中风险文件精确匹配 → overallRisk=medium, requirePlan=false', () => {
    const result = singleFile('src/m3/PerceptionAnalyzer.ts');
    expect(result.overallRisk).toBe('medium');
    expect(result.requirePlan).toBe(false);
    expect(result.files[0].risk).toBe('medium');
    expect(result.files[0].reason).toBe('中风险区域文件');
  });

  it('C. 低风险 glob 匹配 → overallRisk=low', () => {
    const result = singleFile('src/types/settings.ts');
    expect(result.overallRisk).toBe('low');
    expect(result.files[0].risk).toBe('low');
    expect(result.files[0].reason).toContain('src/types/**');
  });

  it('C2. 测试文件 glob 匹配 → low', () => {
    const result = singleFile('src/m4/__tests__/FamilyGraph.test.ts');
    expect(result.overallRisk).toBe('low');
    expect(result.files[0].risk).toBe('low');
    expect(result.files[0].reason).toContain('**/__tests__/**');
  });

  it('D. 未匹配文件 → 默认 medium', () => {
    const result = singleFile('src/unknown/new-file.ts');
    expect(result.overallRisk).toBe('medium');
    expect(result.files[0].risk).toBe('medium');
    expect(result.files[0].reason).toBe('未匹配任何风险规则，默认为中风险');
  });
});

// ============================================================
// Workflow 触发
// ============================================================

describe('routeRisks — Workflow 触发', () => {
  it('E. roleplay_change: src/**/RoleplayPromptBuilder.ts → 触发 roleplay WF', () => {
    const result = singleFile('src/m5/RoleplayPromptBuilder.ts');
    expect(result.triggeredWorkflows).toContain('roleplay_change');
    expect(result.requiredMeters).toContain('roleplay-isolation-meter');
    expect(result.requiredMeters).toContain('fg-meter');
    expect(result.requiredMeters).toContain('behavior-meter');
  });

  it('E2. roleplay_change: src/**/PromptAssembler.ts → 触发 roleplay WF', () => {
    const result = singleFile('src/m5/PromptAssembler.ts');
    expect(result.triggeredWorkflows).toContain('roleplay_change');
  });

  it('E3. roleplay_change: src/app/role/** → 触发', () => {
    const result = singleFile('src/app/role/some-file.ts');
    expect(result.triggeredWorkflows).toContain('roleplay_change');
  });

  it('F. sqlite_change: src/**/ConversationDB.ts → 触发 sqlite WF', () => {
    const result = singleFile('src/m2/ConversationDB.ts');
    expect(result.triggeredWorkflows).toContain('sqlite_change');
    expect(result.requiredMeters).toContain('persist-meter');
    expect(result.requiredMeters).toContain('uuid-meter');
  });

  it('F2. sqlite_change: scripts/** → 触发 sqlite WF', () => {
    const result = singleFile('scripts/migrate.ts');
    expect(result.triggeredWorkflows).toContain('sqlite_change');
  });

  it('G. 不相关文件不触发任何 Workflow', () => {
    const result = singleFile('docs/readme.md');
    expect(result.triggeredWorkflows).toHaveLength(0);
    expect(result.requiredMeters).toHaveLength(0);
  });
});

// ============================================================
// 多文件变更 + 边界情况
// ============================================================

describe('routeRisks — 多文件变更', () => {
  it('H. high + low 混合 → overallRisk=high', () => {
    const result = routeRisks(
      ['src/webui/chat.ts', 'src/types/settings.ts'],
      TEST_RISK_MAP,
      TEST_HARNESS,
    );
    expect(result.overallRisk).toBe('high');
    expect(result.files).toHaveLength(2);
    expect(result.files[0].risk).toBe('high');
    expect(result.files[1].risk).toBe('low');
  });

  it('H2. 两个文件触发不同 Workflow → 两个 WF 都在 + Meter 去重', () => {
    // chat.ts → chat_ts_change; RoleplayPromptBuilder.ts → roleplay_change
    // 两个 WF 共享 behavior-meter
    const result = routeRisks(
      ['src/webui/chat.ts', 'src/m5/RoleplayPromptBuilder.ts'],
      TEST_RISK_MAP,
      TEST_HARNESS,
    );
    expect(result.triggeredWorkflows).toContain('chat_ts_change');
    expect(result.triggeredWorkflows).toContain('roleplay_change');
    // behavior-meter 在两个 WF 中都出现，但应只出现一次
    const behaviorCount = result.requiredMeters.filter(
      (m) => m === 'behavior-meter',
    ).length;
    expect(behaviorCount).toBe(1);
  });

  it('I. Windows 反斜杠路径 → normalize 后正确匹配', () => {
    const result = singleFile('src\\webui\\chat.ts');
    expect(result.overallRisk).toBe('high');
    expect(result.files[0].risk).toBe('high');
    expect(result.triggeredWorkflows).toContain('chat_ts_change');
  });

  it('I2. Windows 路径 + roleplay prefix/**/suffix', () => {
    const result = singleFile('src\\m5\\RoleplayPromptBuilder.ts');
    expect(result.triggeredWorkflows).toContain('roleplay_change');
  });

  it('K. 空文件列表 → 全部默认值，不崩溃', () => {
    const result = routeRisks([], TEST_RISK_MAP, TEST_HARNESS);
    expect(result.overallRisk).toBe('low');
    expect(result.files).toHaveLength(0);
    expect(result.triggeredWorkflows).toHaveLength(0);
    expect(result.requiredMeters).toHaveLength(0);
    expect(result.requirePlan).toBe(false);
  });

  it('仅 low risk 文件 → overallRisk=low, requirePlan=false', () => {
    const result = routeRisks(
      ['src/types/a.ts', 'src/types/b.ts'],
      TEST_RISK_MAP,
      TEST_HARNESS,
    );
    expect(result.overallRisk).toBe('low');
    expect(result.requirePlan).toBe(false);
  });
});

// ============================================================
// Config 文件关键词风险判定 (R21-B1.1 Calibration)
// ============================================================

// 使用精简的 TEST_RISK_MAP（不含 src/config/** 低风险通配符）
const TEST_RISK_MAP_NO_CONFIG_LOW: RiskMapConfig = {
  risk_map: {
    version: '0.1',
    high_risk: {
      severity: 'S',
      require_plan: true,
      require_human_approval: true,
      files: [
        { path: 'src/webui/chat.ts', reason: '聊天中枢' },
      ],
    },
    medium_risk: {
      severity: 'A',
      require_plan: 'recommended',
      files: ['src/m3/PerceptionAnalyzer.ts'],
    },
    low_risk: {
      severity: 'B',
      allow_direct_patch: true,
      path_patterns: ['**/__tests__/**', 'src/types/**'],
    },
  },
};

describe('Config 文件关键词风险判定', () => {
  it('CK1: src/config/model-provider.ts → HIGH (model + provider keywords)', () => {
    const result = routeRisks(
      ['src/config/model-provider.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toContain('config 文件包含治理敏感关键词');
    expect(result.files[0].reason).toContain('model');
    expect(result.overallRisk).toBe('high');
    expect(result.requirePlan).toBe(true);
  });

  it('CK2: src/config/ConfigService.ts → MEDIUM (no keyword, 需显式 HIGH 列表)', () => {
    const result = routeRisks(
      ['src/config/ConfigService.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    // "ConfigService" 文件名不含治理关键词 → 无法通过关键词判定 HIGH
    // 真实 risk-map.yaml 中通过显式 high_risk.files 条目覆盖
    expect(result.files[0].risk).toBe('medium');
    expect(result.files[0].reason).toContain('未匹配');
  });

  it('CK3: src/config/llm-config.ts → HIGH (llm keyword)', () => {
    const result = routeRisks(
      ['src/config/llm-config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toContain('llm');
  });

  it('CK4: src/config/auth-config.ts → HIGH (auth keyword)', () => {
    const result = routeRisks(
      ['src/config/auth-config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toContain('auth');
  });

  it('CK5: src/config/storage-config.ts → HIGH (storage keyword)', () => {
    const result = routeRisks(
      ['src/config/storage-config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toContain('storage');
  });

  it('CK6: src/config/provider-config.ts → HIGH (provider keyword)', () => {
    const result = routeRisks(
      ['src/config/provider-config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toContain('provider');
  });

  it('CK7: src/config/safety-config.ts → HIGH (safety keyword)', () => {
    const result = routeRisks(
      ['src/config/safety-config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toContain('safety');
  });

  it('CK8: src/config/theme-config.ts → MEDIUM (no keywords, default)', () => {
    const result = routeRisks(
      ['src/config/theme-config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('medium');
    expect(result.files[0].reason).toContain('未匹配');
  });

  it('CK9: src/m5/config.ts → MEDIUM (不在 config/ 目录，不触发关键词)', () => {
    const result = routeRisks(
      ['src/m5/config.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    // 路径中没有 "config/"，不触发 config 关键词规则 → 默认 MEDIUM
    expect(result.files[0].risk).toBe('medium');
  });

  it('CK10: 既有 high-risk 不退化为 config medium', () => {
    const result = routeRisks(
      ['src/webui/chat.ts'],
      TEST_RISK_MAP_NO_CONFIG_LOW,
      TEST_HARNESS,
    );
    expect(result.files[0].risk).toBe('high');
    expect(result.files[0].reason).toBe('聊天中枢');
  });
});
