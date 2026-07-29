# Agent CNC Harness Guard — WenStarOS 工程门禁系统

## 这是什么

Agent CNC Harness 是 WenStarOS 的**离线确定性工程风险控制系统**。它不依赖 LLM，通过静态分析 + 规则匹配 + 数据库查询，在每次代码修改时自动执行：

- 🩺 **环境检查**（doctor）
- 🔍 **变更影响面扫描**（scan）
- ✅ **配置文件校验**（validate）
- 🛡️ **门禁检查**（guard）
- 📋 **证据报告生成**（report）

## 核心理念

```
Core 不依赖 LLM。
LLM 只作为未来增强层。
离线也必须能监管。
高风险先 Plan。
S 级无证不放行。
创造可以概率化，放行必须确定化。
```

## 快速使用

```bash
# 环境检查
npm run agent-cnc -- doctor

# 配置校验
npm run agent-cnc -- validate

# 扫描变更文件
npm run agent-cnc -- scan
npm run agent-cnc -- scan --files src/webui/chat.ts src/m2/SQLiteAdapter.ts
npm run agent-cnc -- scan --base HEAD~1

# 门禁检查（默认不跑 vitest）
npm run agent-cnc -- guard --no-test

# 严格模式（强制跑 vitest）
npm run agent-cnc -- guard --strict

# 指定 Plan 文件
npm run agent-cnc -- guard --plan .agent-cnc/reports/current-plan.md

# 生成报告
npm run agent-cnc -- report
```

## 风险等级

| 等级 | 含义 | Plan 要求 | Gate 行为 |
|:---|:---|:---|:---|
| **high** (S) | 修改了核心业务文件 | 必须有 Plan | 无 Plan 直接 FAIL |
| **medium** (A) | 修改了重要业务文件 | 建议有 Plan | WARN |
| **low** (B) | 测试/配置/类型文件 | 不需要 | PASS |

## 高风险文件

以下文件修改需要 Plan 才能通过 Gate：

| 文件 | 原因 |
|:---|:---|
| `src/webui/chat.ts` | 聊天中枢，22 个注入点 |
| `src/m4/household/FamilyGraph.ts` | FG 户籍唯一源 |
| `src/m2/SQLiteAdapter.ts` | SQLite 写入唯一通道 |
| `src/m5/DeepSeekLLMProvider.ts` | LLM 输出清洁性 |
| `src/engine/tianquan/prefrontal/PrefrontalCortex.ts` | PFC 上下文门控 |
| `src/webui/server.ts` | 服务启动中枢 |

## Plan 文件

高风险修改前，创建 Plan 文件：

```bash
cp .agent-cnc/PLAN_TEMPLATE.md .agent-cnc/reports/current-plan.md
```

Plan 必须包含以下章节：

- `## 修改目标`
- `## 涉及文件`
- `## 风险分析`
- `## 验证计划`
- `## 回滚方案`

缺少任一章节 = Gate FAIL。

## 报告位置

所有报告输出到 `.agent-cnc/reports/` 目录：

| 文件 | 内容 |
|:---|:---|
| `latest-scan.json` | 最近一次 scan 结果 |
| `latest-result.json` | 最近一次 guard 完整结果（JSON） |
| `latest.md` | 最近一次 guard 人类可读报告 |
| `evidence-report-YYYYMMDD-HHmmss.md` | 带时间戳的完整报告 |
| `current-plan.md` | 当前 Plan 文件 |

## 离线模式

Agent CNC 默认运行在 `offline_deterministic_guard` 模式，完全不依赖网络和 LLM。

## LLM 增强（预留）

如需启用 LLM 增强，设置环境变量：

```bash
export AGENT_CNC_LLM_BASE_URL="https://your-llm-api.com/v1"
export AGENT_CNC_LLM_API_KEY="sk-xxx"
export AGENT_CNC_LLM_MODEL="your-model"
```

当前 MVP 版本不要求 LLM，离线模式已可完成全部监管。

## 常见 Gate 失败处理

| 失败原因 | 处理方法 |
|:---|:---|
| `high_risk_without_plan` | 创建 Plan 文件，填写 5 个必需章节 |
| `s_severity_meter_failed` | 查看 Meter 结果中的 failures 字段，修复对应问题 |
| `missing_required_evidence` | 执行对应 workflow 要求的验证步骤 |
| `tsc failed` | 修复 TypeScript 编译错误 |

## 目录结构

```
.agent-cnc/
├── config.yaml              # 全局配置
├── project-genome.yaml      # 项目基因组定义
├── risk-map.yaml            # 文件风险映射
├── harness.yaml             # 工作流触发 + Gate
├── precision-spec.yaml      # S 级资产精度规格
├── inspection-matrix.yaml   # 检查矩阵
├── redlines/                # 红线规则（7 个领域）
├── workflows/               # 工作流定义（11 个）
├── meters/                  # Meter 配置（9 个）
├── golden/                  # Golden Case（8 个）
└── reports/                 # 输出报告
```
