# WenStarOS 变更台账 — A 类实体 edges warmth 感知

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低
> **Bug 分类**: 数据模型不一致

## 根因

熊梓铭 category='A'（亲属），HeatTracker 已写入 `edges._relation_warmth='intimate'`，但 EntityContextBuilder 只读取 `category='X'`，遗漏了 A 类实体的 warmth 数据。LLM 身份认知与记忆内容冲突 → 不利用亲密记忆。

FG 红线 §18.3 规定 `A 不可降 X`，故不能修改 category。但可在不违反红线的前提下让 LLM 感知 edge 级别的 warmth。

## 修复

EntityContextBuilder 在 category 检查后新增：对 A 类实体，查询 edges 表 `_relation_warmth` 字段。当 warmth 为 intimate/soulmate 时，在关系标签后追加提示。

```typescript
_relationLabel += '——亲密互动（热力追踪已确认）';
```

category 保持 'A' 不变，遵守红线。

## 修改

| 文件 | 行数 |
|:---|:--:|
| `src/m4/household/EntityContextBuilder.ts` | +20 |

## S4: 7/7 ✅ | S5: 809/815 | FG 红线: ❌ 零触碰
