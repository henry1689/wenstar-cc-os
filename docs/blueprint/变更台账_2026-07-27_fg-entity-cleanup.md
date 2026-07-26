# WenStarOS 变更台账 — FG 噪声节点清理 & HC 名单统一

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低

## 诊断

FG nodes 表 29 个 person 节点中 6 个为噪声（"快乐"/"老家"/"那你再" 等误分类），污染 `getAllPersonNames()` 输出。代码中有 4 处 HC 硬编码名单不一致，邱工/刘云新/陈工/李工 不在 FG 中，会晤触发时无法获取 UUID。

## 修复

| 文件 | 改动 |
|:---|:---|
| `EntityContextBuilder.ts` | GARBAGE_NAMES +3（快乐/老家/那你再） |
| `server.ts` | HC2 统一为 FG 有效实体集（去幽灵，对齐 HC1） |
| `server-chat-routes.ts` | HC 统一为 FG 有效实体集 |
| `process-stages.ts` | fallback _safeNames 去幽灵/泛称，对齐 FG 实体 |

## 验证

- 编译: 零错误
- 测试: 809/815（6 预存失败，无关）
