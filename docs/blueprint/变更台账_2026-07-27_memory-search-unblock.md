# WenStarOS 变更台账 — 全记忆搜索链路打通

> **流程**: S1→S2→S3→S4→S5→S6→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低
> **Bug 分类**: 数据模型不一致（memory_kind 标签隔离导致跨模式数据不可检索）

## 根因

persistence-stage.ts 之前将会晤中所有消息统一标记为 `memory_kind='roleplay'`，而正常检索链路（MemoryRetriever + SQLiteAdapter）全局排除此标签的记录。即使用户在会晤中产生了大量客观信息（"诗韵14岁"），退出会晤后这些记忆在正常模式下完全不可见。

## 修复

新增独立检索通道 `findByEntityUuid` — 按 `belong_entity_uuid` 直查，不依赖 `memory_kind` 过滤。

## 修改文件

| 文件 | 改动 | 行数 |
|:---|:---|:--:|
| `src/m2/SQLiteAdapter.ts` | 新增 `findByEntityUuid(uuid, limit)` 只读方法 | +13 |
| `src/m4/MemoryRetriever.ts` | 新增第6通道 `byEntityUuid` + `entityUuids` 参数 | +50 |
| `src/m4/M4Orchestrator.ts` | 解析 person 实体 FG UUID 传入检索 | +6 |

## S4 评审

| CK | 结果 |
|:---|:--:|
| CK-01 | ⚠️ 预存（m2→m3反向依赖，本次无新增） |
| CK-02~05,07 | ✅ pass |
| CK-06 | ⚠️ 预存（14处写入缺save，findByEntityUuid只读无写入） |

## S5 测试

- 编译: 零错误
- 测试: 808/815 通过（7 预存失败，无关）

## FG 11 条红线：零触碰

只读主FG（getUUIDByName），不写、不涉及角色分支。

## 回滚

```bash
git checkout -- src/m2/SQLiteAdapter.ts src/m4/MemoryRetriever.ts src/m4/M4Orchestrator.ts
```
