# WenStarOS 变更台账 — P0-1 PromptAssembler 结构化

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟡 中（Prompt 组装重构）

## S1 审计：finalKnowledgeText 12 注入点全线性拼接

当前 chat.ts 从 1280 到 1613 行共 ~330 行 prompt 组装代码。12 个注入点全部通过 `finalKnowledgeText +=` / `= ... + finalKnowledgeText` 拼接，顺序即语义。无优先级协议、无冲突检测、无模式过滤。

## S2 方案

建立 PromptAssembler 基础设施，保留旧拼接链并行运行。新块从 assembler 渲染后前置到 finalKnowledgeText 顶部，旧块继续追加。

迁移策略：渐进式——先迁移 6 个最高风险块（familyConstraint / unknownGuard / intimacyFilter / roleHint / memoryText / M6），后续逐步将 PFC、entityContext、knowledgeBase 迁移入 assembler。

## S3 实施

| # | 改动 | 文件 | 风险 |
|:--:|:---|:---|:--:|
| 1 | 新建 `PromptAssembler` 类 + `PromptBlock` 接口 + 块工厂函数 | `src/m5/prompts/PromptAssembler.ts` 新建 200行 | 🟡 |
| 2 | chat.ts 在 M5 orchestrator 调用前插入 assembler 渲染 | `chat.ts` +50行 | 🟡 |
| 3 | 迁移 6 个块: familyConstraint→hardRule, unknownGuard+intimacyFilter→safety, roleHint→identity, memoryText→memory, M6→persona | `chat.ts`（内嵌在 +50行中） | 🟡 |

### PromptBlock 类型系统

| type | 默认 priority | 说明 |
|:---|:--:|:---|
| hard_rule | 1000 | 强制约束，违反则身份错乱/数据污染 |
| safety | 900 | 安全边界，防止不当内容 |
| identity | 800 | 身份定义 |
| task | 700 | 任务指令 |
| emotion | 600 | 情感状态 |
| memory | 500 | 记忆片段 |
| knowledge | 400 | 知识库信息 |
| persona | 300 | 人设风格 |

### PromptAssembler 能力

- 收集 → 去重（id 冲突）→ 模式过滤（modeScope）→ priority 排序 → token 截断 → 渲染
- conflictPolicy: override/merge/drop_if_conflict
- 旧拼接链保留为 fallback

## S4 编译: 零错误 | S5 测试: 840/854 (0新增) | FG 红线: ❌

## 影响分析

- assembler 仅在有 ≥2 个块时生效（避免空块渲染覆盖旧文本）
- 会晤模式下 family_constraint 和 unknown_guard 通过 modeScope 自动过滤
- M6 persona 块通过 modeScope ['normal','secretary'] 自动在会晤/角色扮演中跳过
- 降级安全：PromptAssembler 不可用时不阻塞，回退到旧 finalKnowledgeText 拼接链
