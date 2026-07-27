# WenStarOS 变更台账 — P0-4 EntityOwnershipResolver + UUID 健康报告

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低

## S1 审计

belong_entity_uuid 标注链路有四个写入入口（persistence-stage、SQLiteAdapter 回填、safe-backfill.cjs、KnowledgeEngine.add），每个入口都有独立的分辨逻辑，无统一解析器。

标注率目标 vs 当前：
| 表 | 目标 | 当前估计 |
|:---|---:|---:|
| conversations | 80%+ | ~50% |
| memories | 80%+ | ~40% |
| black_diamond | 90%+ | ~10% |
| knowledge_base | 70%+ | ~15% |
| entities | 95%+ | ~30% |

## S3 实施

| # | 改动 | 文件 | 风险 |
|:--:|:---|:---|:--:|
| 1 | 新建 `EntityOwnershipResolver.resolveOwnership()` — 四级解析: entity_genes→自称检测→显式指名→none | `src/app/entity/EntityOwnershipResolver.ts` 新建 100行 | 🟢 |
| 2 | 新建 `UUIDHealthReport.reportUUIDHealth()` — 9项健康指标 | `src/app/entity/UUIDHealthReport.ts` 新建 140行 | 🟢 |
| 3 | persistence-stage 内联 resolveBelongUUID → EntityOwnershipResolver | `persistence-stage.ts` -10+3行 | 🟢 |
| 4 | server.ts 启动时输出 UUID 健康报告 | `server.ts` +12行 | 🟢 |

### EntityOwnershipResolver 四级解析

1. **entity_genes 匹配**: 取 M1 DNA 中第一个 person 类型实体 → FG.getUUIDByName
2. **自称检测**: 6种中文自称模式（"我是XX"/"我叫XX"/"XX来了"…）
3. **显式指名**: 文本中包含 FG 已知人名 → 归属到该实体
4. **none**: 无法归属，返回 null

### UUID 健康面板指标

- 5 表标注率（conversations / memories / black_diamond / knowledge_base / entities）
- 绝对计数（每条表总量 + 已标注量）
- 异常检测（孤儿UUID / 同名多UUID / 垃圾实体 / 无UUID person）
- 整体健康度评分（0-100）

## S4 编译: 零错误 | S5 测试: 838/854 (0新增) | FG 红线: ❌
