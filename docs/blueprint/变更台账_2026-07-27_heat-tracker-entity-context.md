# WenStarOS 变更台账 — EntityContextBuilder 感知 HeatTracker 关系升级

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低
> **Bug 分类**: 数据模型不一致

## 根因

HeatTracker 每次对话后更新 `nodes.category='X'` + `edges._relation_warmth='intimate'`，但 EntityContextBuilder 只读静态 `getCorrectedRelation()` 映射（返回 "密友——通过姐姐诗雨认识"），两份数据互不相通。LLM 收到 "你是密友" → 否认亲密关系 → 无法利用已有的亲密对话记忆。

## 修复

EntityContextBuilder 在计算 `_relationLabel` 时新增一步：通过 `getUUIDByName()` + `getEntityByUUID()` 读取 `nodes.category`。当 `category='X'` 时，`_relationLabel` 覆盖为 "情人——亲密关系（热力追踪已确认）"，并跳过静态 `getCorrectedRelation()` 映射。

## 修改

| 文件 | 行数 |
|:---|:--:|
| `src/m4/household/EntityContextBuilder.ts` | +14 |

## S4: 7/7 全部通过 ✅

## S5: 809/815（6预存失败，无关）

## FG 红线: 零触碰
