# WenStarOS 变更台账 — 旧 roleplay 记忆 UUID 回填

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低

## 根因

旧 roleplay 记忆的 `belong_entity_uuid` 回填依赖间接路径（memories.raw_input 子串 → conversations.content → conversations.belong_entity_uuid），可能因前缀不匹配而漏填，导致新增的 UUID 检索通道查不到这些旧记忆。

## 修复

在启动回填中追加第 4 步：直接用 memories.raw_input 中的人名匹配 entities 表的 name+uuid，精准回填 roleplay 记忆。

```sql
UPDATE memories SET belong_entity_uuid = (
  SELECT e.uuid FROM entities e WHERE e.type='person' AND e.uuid IS NOT NULL
  AND memories.raw_input LIKE '%' || e.name || '%' LIMIT 1
) WHERE belong_entity_uuid IS NULL AND memory_kind='roleplay'
```

- 幂等（WHERE belong_entity_uuid IS NULL）
- 精准（只对 roleplay 记忆执行）
- 持久化（复用已有 `flush()` 步）

## 修改文件

| 文件 | 改动 | 行数 |
|:---|:---|:--:|
| `src/m2/SQLiteAdapter.ts` | 旧 roleplay 记忆直接按 entities.name 匹配 UUID | +10 |

## S4 评审

CK-01/CK-06 预存警告，无新增。

## S5 测试

编译零错误，808/815 通过（7 预存失败，无关）。

## 回滚

```bash
git checkout -- src/m2/SQLiteAdapter.ts
```
