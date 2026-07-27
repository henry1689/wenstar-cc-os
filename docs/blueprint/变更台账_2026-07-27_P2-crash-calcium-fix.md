# WenStarOS 变更台账 — P2 崩溃窗口 & 钙化解耦修复

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低

## S1 审计

| # | 问题 | 严重度 | 描述 |
|:--:|:---|:--:|:---|
| P2-7 | FG 死备份代码 | 🟡 | `_ensureBackup()` + `_cleanupOldBackups()` 定义但从不调用，约 55 行僵尸代码 + 4 处误导注释 |
| P2-2 | DualHelix 静默失败 | 🟠 | `writeToDualHelix()` 返回 void，三底座写入失败仅 console.warn，调用方无感知 |
| P2-6 | 阈值二重性 | 🟡 | WorkingMemory `shouldGraduate()` 硬编码 0.15，M3_CONFIG 为 0.25，三套阈值体系各自独立 |
| P2-4 | FG 崩溃窗口 | 🟡 | `markDirty()` 500ms 延迟落盘，进程崩溃丢脏数据；addEdge 已用 `markDirty(true)` 但 4 处关键路径未对齐 |
| P2-1 | 钙化双语义 | 🟡 | `calcium_score` 同时承担晋升阈值 + 衰减速率 + 召回优先级三种语义，无法独立调优 |

## S3 实施

| # | 改动 | 文件 | 风险 |
|:--:|:---|:---|:--:|
| P2-7 | 删除 `_ensureBackup()` + `_cleanupOldBackups()`（~55 行），清理 4 处 `备份仅在 initialize() 时执行` 误导注释，移除 `copyFileSync/readdirSync/statSync/unlinkSync` 三个未使用的 import | `FamilyGraph.ts` (net -62行) | 🟢 |
| P2-2 | `writeToDualHelix()` 返回值 `void` → `HelixWriteResult { success, error, failedSpines }`；三底座独立 try-catch；新增 `_failedQueue` + `retryHelixQueue()` 3次重试→超限结构化告警 + `getHelixQueueStatus()` | `DualHelixWriter.ts` (+~100行) | 🟢 |
| P2-2 | `persistence-stage.ts` 调用点检查返回值 + warn | `persistence-stage.ts` (+3行) | 🟢 |
| P2-2 | `server.ts` 新增 5min 间隔 `retryHelixQueue` 定时重试 + 告警 | `server.ts` (+8行) | 🟢 |
| P2-6 | `shouldGraduate()` 毕业阈值从硬编码 `0.15` → `M3_CONFIG.calcium.level0Threshold` (0.25)，三套阈值体系统一引用 | `WorkingMemory.ts` (+2行) | 🟢 |
| P2-4 | 4 处关键路径 `markDirty()` → `markDirty(true)`：`correctRelation`（边增删）/ `updateNodeProperties` / `updatePersonProfile` / `resolveConflict`；保留 3 处非关键路径（`initialize`/`cleanExpiredPending`/`ensureProfileSkeletons`）的 500ms 聚合 | `FamilyGraph.ts` (+8行) | 🟢 |
| P2-1 | `MemoryConfig.ts` 新增 `retentionDecay` 配置节（6 类内容衰减率：emotional/relational/work/neutral/suppressed/active），旧 calc-based decay 字段移除 | `MemoryConfig.ts` (+12行 net) | 🟢 |
| P2-1 | `runDecay()` 从 "按 calcium_score 分 3 桶" 重构为 "按 narrative_tag 分类 + lifecycle_state 优先级" 6 级 SQL（suppressed > emotional > relational > work > active > neutral），互斥 WHERE 条件防重叠 | `MemoryAssessor.ts` (+40行 net) | 🟢 |

## S4 编译: 零错误 | S5 测试: 62/65 (3个 pre-existing EntityMeeting 回归) | FG 红线: ❌ 零触碰

## 影响分析

- **P2-7**: 纯删除，零风险
- **P2-2**: 新返回值向下兼容（原调用方忽略返回值不报错），failure queue 内存态重启清空（可接受——DualHelix 是辅助索引，主记忆已存沙金库）
- **P2-6**: 升阈 0.15→0.25 后低钙化对话不再即时毕业，需在 buffer 中累积更多上下文后毕业（MemoryWriteBuffer 有 6 周期强制毕业兜底）
- **P2-4**: 关键写操作 IO 增加 4 次同步写入/操作（FG DB 通常在 <2MB，同步 writeFileSync 延迟 <5ms），无性能影响
- **P2-1**: 衰减逻辑从 calcium-dependent 变为 category-dependent，情感类记忆在高 calcium 和低 calcium 下衰减相同（均为 0.02），长期效果需观测
