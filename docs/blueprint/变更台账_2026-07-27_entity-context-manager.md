# WenStarOS 变更台账 — EntityContextManager 多角色上下文隔离模块

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低

## 设计

独立模块 `src/app/entity/` — 作为 conversationHistory → enrichedHistory 之间的透明过滤层。不改变任何已有 pipeline。

## 修改

| 文件 | 改动 |
|:---|:---|
| `src/app/entity/EntityContextManager.ts` | **新建** — getContextWindow / groupByEntity / mergeThreads |
| `src/app/entity/EntityIndexMaintainer.ts` | **新建** — 三表UUID索引维护 |
| `src/app/entity/index.ts` | **新建** — 统一导出 |
| `src/m2/SQLiteAdapter.ts` | +3条UUID索引 (CREATE INDEX IF NOT EXISTS) |
| `src/webui/chat.ts` | enrichedHistory 1行替换 (slice→getContextWindow) |
| `src/webui/server.ts` | 2处HC硬编码→fg.getAllPersonNames() |

## 效果

- 正常模式：enrichedHistory = slice(-40)，行为不变
- 会晤模式：enrichedHistory = 按实体名过滤后取最近40条，不交叉污染
- HC列表：动态从FG获取，不再硬编码

## S4: 全部预存 | S5: 809/815 | FG红线: ❌
