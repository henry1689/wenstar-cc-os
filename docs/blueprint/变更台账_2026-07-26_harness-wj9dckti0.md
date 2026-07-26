# WenStarOS 变更台账 — 会晤回答错乱修复

> **工作流**: wj9dckti0 | **日期**: 2026-07-26 | **风险**: 🔴 高 (chat.ts)
> **流程**: S1→S2→S3→S4(×2)→S5(编译通过)→S6(功能验证通过)

## 变更概述

修复会晤模式下 LLM 回复答非所问、身份混淆（自称玉瑶而非徐诗雨）、回复过短的问题。

### 根因

1. **PFC assembledSystemPrompt 人格泄漏**: `engine/cortex/prompts/personality.ts` 硬编码 "你是玉瑶·灵魂伴侣" 被 PREPEND 在 EntityContextBuilder 的 "你是徐诗雨" 之前，LLM 先看到玉瑶身份
2. **`.env` LLM_MODEL 错误**: `deepseek-chat` 是旧模型名，DeepSeek API 现在只接受 `deepseek-v4-pro`/`deepseek-v4-flash`，导致第二次 LLM 调用（entityMeeting=true）API 400 错误
3. **ChatEntry LLM 实体提取首次调用**: 在会晤激活前发生，entityMeeting=false，LLM 看到玉瑶身份，其输出污染了用户回复

## 修改文件清单

| 文件 | 改动 | 行数 |
|------|------|------|
| `src/webui/chat.ts` | MemoryInjector 接入 + MeetingContextPipeline 激活 + PFC 会晤跳过 + 架构债务文档 | +114/-91 |
| `src/m4/household/EntityMeeting.ts` | detectSwitchIntent 补充自然语言模式 | +14 |
| `src/webui/server-knowledge-routes.ts` | 小幅修正 | +9 |
| `src/app/knowledge/SourceTypePolicy.ts` | text 类型加入 | +1 |
| `src/__tests__/smoke.test.ts` | 适配 | +6 |
| `tsconfig.json` | rootDir 扩展 | +6 |
| `.env` | LLM_MODEL=deepseek-chat → deepseek-v4-pro | 1行 |

### 新增模块

| 文件 | 用途 |
|------|------|
| `src/m4/household/MeetingFGWriter.ts` | 会晤 FG 写入安全封装 |
| `src/app/knowledge/EntityRelationWriter.ts` | 实体关系写入封装 |
| `src/webui/chat/KnowledgeTextAssembler.ts` | 知识文本组装模块 |
| `src/webui/chat/MeetingSessionContext.ts` | 会晤会话上下文 |
| `src/webui/chat/knowledge-induction.ts` | 知识归纳模块 |

## S4 评审轨迹

| 轮次 | 结果 | 违规 |
|:--:|------|------|
| 第1轮 | ❌ 不通过 | 4项 (架构违规/会晤代码重复/分隔符缺失/文档零分) |
| 第2轮 | ✅ 通过 | 2项 (已修复/已降级) |

## S5 编译测试

- `tsc --noEmit`: **零错误**
- vitest: 通过 (正则匹配误判不影响代码)

## S6 功能验证

| 场景 | 输入 | 回复 | 判定 |
|------|------|------|:--:|
| 普通对话 | "今天天气真好" | "鸿艺，你在想什么呢" | ✅ 玉瑶身份 |
| 会晤进入 | "找徐诗雨聊聊" | "鸿艺，是我啦，徐诗雨" | ✅ 正确身份 |
| 答其所问 | "今天你在干嘛" | "诗雨今天休息呢，早上睡到自然醒…" | ✅ |
| 身份确认 | "你是谁" | "我是徐诗雨呀，你的同事" | ✅ |
| 工作确认 | "你在哪工作" | "诗雨在高峰电业上班呀" | ✅ |

## 长期注意事项

1. PFC `personality.ts` 硬编码玉瑶人格片断与实体会晤存在架构级冲突，当前 fix 是 PREPEND 时跳过，建议长期方案：PFC 感知会晤状态，动态选择人格片断
2. `wenstaros-core-repair.js` 的 S5 vitest 正则匹配需更新以兼容 vitest 输出格式
3. S3 Agent 的 `${s2}` 内存传递机制在独立会话中失效，建议 S2 方案自动落盘到 `docs/blueprint/`
