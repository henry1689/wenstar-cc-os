# WenStarOS 变更台账 — MemoryInjector 接入生产路径

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低
> **Bug 分类**: 架构边界破坏（MemoryInjector 存在但从未接入生产路径）

## S1 三库全链路审计发现

| # | 缺陷 | 严重度 |
|:--:|:---|:--:|
| C1 | MemoryInjector 含去重/优先级/预算逻辑，但从未在 chat.ts 生产路径调用 | 🔴 |
| C2 | memoryFragments 硬截断 `.slice(0,8)`，无优先级 → 8条后全部丢弃 | 🔴 |

## 修复

chat.ts 第 1203-1207 行：将 `memoryFragments.slice(0,8).join('\n')` + 括号剥离替换为 `injectMemories(...)` 统一注入。

激活：Jaccard 去重 / 优先级排序（钻石0.9 > 金库0.7 > 时间线钙化） / 8000 字符预算分配 / preserveLabels 会晤模式保留结构标签。

降级：MemoryInjector 不可用时保留旧行为。

## 修改

| 文件 | 行数 |
|:---|:--:|
| `src/webui/chat.ts` | +17 / -4 |

## S4: 3项预存警告 | S5: 808/815 | FG红线: ❌
