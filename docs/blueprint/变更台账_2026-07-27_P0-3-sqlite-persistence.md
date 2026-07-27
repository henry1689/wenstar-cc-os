# WenStarOS 变更台账 — P0-3 SQLiteAdapter 持久化加固

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟡 中（持久化核心路径）

## S1 审计：4 项持久化风险

| 风险 | 说明 |
|:---|:---|
| 崩溃窗口 | `save()` 150ms 防抖定时器——期间进程崩溃则脏写入全部丢失 |
| shutdown 不完整 | `handleShutdown` 调 `flush()` 但未清除待处理定时器，可能丢最后一轮写入 |
| API 私密 | `flush()` 是 private，外部只能调 `scheduleFlush()`（走计数器不立即落盘） |
| 方法命名模糊 | `flush()` vs `scheduleFlush()` vs `save()` 语义混乱 |

## S3 实施

| # | 改动 | 文件 | risk |
|:--:|:---|:---|:--:|
| 1 | `flush()` → `flushNow()`（public），`shutdownFlush()` 新增（清定时器→强落盘→关DB） | `SQLiteAdapter.ts` | 🟡 |
| 2 | `_clearFlushTimer()` 私有辅助抽出 | `SQLiteAdapter.ts` | 🟢 |
| 3 | 内部调用 `this.flush()` → `this.flushNow()`（2处：initialize回填） | `SQLiteAdapter.ts` | 🟢 |
| 4 | `FusionStorageAdapter` 新增 `flushNow()` + `shutdownFlush()`，委托给 sqlite | `FusionStorageAdapter.ts` +15行 | 🟢 |
| 5 | `ConversationDB` 新增 `shutdownFlush()`，共享模式仅落盘不关DB | `ConversationDB.ts` +22行 | 🟢 |
| 6 | `server.ts handleShutdown`: `storage?.getSQLite()?.flush()` → `storage?.shutdownFlush()` | `server.ts` -1+1行 | 🟢 |
| 7 | `persistence-stage.ts`: `dhsqlite.flush()` → `dhsqlite.flushNow?.()` | `persistence-stage.ts` | 🟢 |
| 8 | `structure-guard.test.ts`: `flush` → `flushNow` 断言 | 测试 | 🟢 |

## S4 编译: 零错误 | S5 测试: 807/815 (0新增) | FG 红线: ❌

## 影响分析

- **崩溃窗口不变**（150ms），但 `handleShutdown` 现在先清定时器再强落盘，保证退出时不丢数据
- `flushNow()` 公开后，关键路径可直接调用强落盘（如 FamilyGraph `markDirty(true)` 路径）
- `ConversationDB.shutdownFlush()` 共享模式下只落盘不关 DB——owner（SQLiteAdapter）负责最终关闭
- `shutdownFlush()` 幂等安全可重复调
