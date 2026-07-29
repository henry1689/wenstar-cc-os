# Agent CNC Change Plan

## 修改目标

为 WenStarOS 项目新增 Agent CNC Harness Guard MVP，用于提供离线确定性工程风险控制、红线提醒、风险路由、Meter 检查、Gate 放行和 Evidence Report 生成能力。

本次修改不改变 WenStarOS 业务运行逻辑，只新增 `.agent-cnc/` 配置体系与 `src/agent-cnc/` CLI 工具。

## 涉及文件

主要新增：

- `.agent-cnc/**`
- `src/agent-cnc/**`

修改：

- `package.json`

当前工作区如包含既有高风险业务文件变更，例如：

- `src/m5/DeepSeekLLMProvider.ts`

则本 Plan 只覆盖 Harness 引入对这些文件的检测，不主动修改其业务逻辑。

## 风险分析

本次风险主要来自：

1. 新增 CLI 可能与 TypeScript strict mode 冲突。
2. 新增 package scripts 可能影响现有 npm 脚本。
3. YAML 配置结构不一致可能导致 validate 失败。
4. Meter ID 不一致可能导致 required meter missing。
5. Windows 路径分隔符可能导致风险路由失效。
6. 工作区已有高风险业务文件变更会触发 high risk gate。

控制措施：

1. 不修改 chat.ts、FamilyGraph.ts、SQLiteAdapter.ts 等业务核心逻辑。
2. 所有 Harness 逻辑离线确定性运行，不依赖 LLM。
3. 所有路径统一 normalize 为 POSIX 风格。
4. validate 检查 YAML、workflow、redline、meter registry。
5. guard 默认执行 tsc --noEmit。
6. report 输出 Markdown 与 JSON 双格式证据。

## 验证计划

执行：

```bash
npm run agent-cnc -- doctor
npm run agent-cnc -- validate
npm run agent-cnc -- scan
npm run agent-cnc -- guard --no-test
npm run agent-cnc -- report
```

验证目标：

1. doctor PASS。
2. validate PASS。
3. scan 能识别 changed files 与风险等级。
4. guard 能执行 tsc 与 required meters。
5. report 能生成 latest.md 与 latest-result.json。
6. high_risk_without_plan 不再出现。
7. UUID 历史标注率低只作为 WARN，不阻断本次 Harness 部署。

## 回滚方案

如 Harness 引入导致问题，可回滚：

1. 删除 `.agent-cnc/` 目录。
2. 删除 `src/agent-cnc/` 目录。
3. 从 `package.json` 移除 agent-cnc 相关 scripts。
4. 如无需 YAML 解析，移除 `yaml` 依赖。
5. 重新运行 `npm install`。
6. 执行 `npx tsc --noEmit` 确认业务代码恢复原状态。

## 人工确认

- [x] 我已确认本计划
