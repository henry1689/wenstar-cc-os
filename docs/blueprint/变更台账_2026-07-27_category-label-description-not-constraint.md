# WenStarOS 变更台账 — category 从约束回归描述：任何人皆可亲密

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低
> **Bug 分类**: 架构边界破坏（category 标签从描述退化为约束）

## 根因

`checkXUpgrade` 中 `if (currentCategory === 'A') return null` 将 category='A' 变成了永久亲密封锁。FG 红线 §18.3 "A 不可降 X" 的本意是保护家族边不被覆盖，但被误读为"A 类实体不能有亲密互动"——现实中任何人与用户的关系都可以从无到有、从疏到亲，category 应该是观测标签而非行为许可。

## 修复

| 改动 | 文件 |
|:---|:---|
| P1: 移除 A 封锁 — checkXUpgrade 不再跳过 A 类 | `RelationHeatTracker.ts:224` |
| P2: X 类感知家族边 — blend 家族标签+亲密提示，不覆盖家族身份 | `EntityContextBuilder.ts:123-136` |

### P2 逻辑

- category='X' + 有家族边 → `熊勇的女儿——亲密关系（热力追踪已确认）`
- category='X' + 无家族边 → `情人——亲密关系（热力追踪已确认）`
- 动态标签跳过 getCorrectedRelation 静态覆盖

## 数据流行为变化

| 实体 | 修复前 | 修复后 |
|:---|:---|:---|
| A 类 + 热力≥0.8 | category 永远 A | category → X，标签 blend |
| 家族边 | 不变 | 不变 |
| 非家族 X 类 | "情人" | "情人"（不变） |

## S4: 7/7 ✅ | S5: 809/815 | FG 红线: 家族边不可变 ✅
