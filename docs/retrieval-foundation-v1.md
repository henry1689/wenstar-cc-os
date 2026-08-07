# 多路并行检索底座（Foundation V1.0）· 架构契约

> 日期：2026-08-07 · 状态：S7 已归档 · 关联方案：`多路并行检索架构改造·底座`

## 定位

本次交付"检索底座"，把 retrieval-stage 的 ad-hoc 串行块收敛为
**「适配器产 SearchHit → 统一过滤 → 统一融合 → 统一格式化」** 主链，
为后续 **SearchOrchestrator 并行调度** 打地基。

## 目录与职责

```
src/m4/retrieval/
  types.ts       SearchDomain/RetrievalRoute/SearchHit/RetrievalContext/FuseOptions/FuseResult + rankedItemToHit
  adapter.ts     RetrievalAdapter 接口 / AdapterRegistry / runAdapter / runAllAdapters / buildPolicePolicy / policeFilterHits
  fusion.ts      fuseHits / recencyRatio / FOUNDATION_DEFAULT_WEIGHTS（纯函数，复用 weightedRRF + mmrDiversify）
  backref.ts     BACKREF_TABLE / backfillBackrefs（V13 fake id 校验）
  format.ts      formatHit（前缀复刻）/ hitToMemorySource
  orchestrate.ts runFoundationRoutes（接线入口）
  index.ts       createDefaultRegistry（5 域）/ createExtendedRegistry（8 域）
  adapters/      8 个适配器（Knowledge/BlackDiamond/Work/Vault/Note/Conversation/FamilyGraph/Memory）
```

## 统一命中类型 SearchHit（V13 fake id 根治）

- `domain`（存储域）与 `route`（召回路）**分离**，不再互相污染
- `backref {table,id}` 携带真实回源键——下游长文直取 / recall_count 直接用，不靠 source 猜
- `dedupeKey` 跨域折叠（默认 `domain:id`）
- 存量 RankedItem → SearchHit 用 `rankedItemToHit`，再 `backfillBackrefs` 校验假 id 剔除

## 适配器契约（供 SearchOrchestrator）

```ts
interface RetrievalAdapter {
  readonly domain: SearchDomain;
  readonly routes: readonly RetrievalRoute[];
  readonly filterMode?: 'deny' | 'allow-common';  // deny-by-default / 知识库半开语义
  search(ctx: RetrievalContext): Promise<SearchHit[]>;
}
```

- **并行入口**：`runAllAdapters(registry, ctx)` → `Promise.all` 并发 + 按 route 分组
- **未来 SearchOrchestrator** 只需在 runAllAdapters 内给每个适配器包 `withTimeout` + circuit breaker + 独立降级，**不改适配器本身**
- **加新存储域** = 实现一个适配器 + `registry.register(adapter)`

## 过滤统一（UUID 户籍法）

- `buildPolicePolicy` 唯一策略来源（会晤 deny / 户主有白名单 allowUnowned / 户主无白名单 enforce:false）
- SQL 适配器查询层用 `buildSqlClause(ctx.policy)`（收编 searchBlackDiamonds/YuyaoMemoryService 两处未接 police 的域）
- `runAdapter` 兜底 `policeFilterHits`（deny-by-default，适配器漏过滤不漏网）

## 融合统一（修复 V13 MMR 合成分数）

- `fuseHits`：L3 Weighted RRF → L3.5 时间近因（`recencyFactor * recencyRatio`）→ L6 MMR 用**真实 RRF+近因分**
- 替代 V13 的 `1.0 - i*0.02` 合成分数
- 纯函数，注入 `nowMs` 可测

## 接线状态（S7 已定型）

- `retrieval-stage.ts`：`WS_FOUNDATION_ROUTES = true`
  - 新块 = `runFoundationRoutes`（KB/金库/黑钻/作品/记事 5 域适配器路由）
  - 旧 KB直连/金库 块跳过（else 可回滚）
  - **砂金高钙化块仍执行**（memory 域，S6 的 MemoryAdapter 未默认注册——避免与 V13/V11 重复注入）
- **不注册** conversation/memory/family_graph 三域适配器（已由 V13/V11 主链覆盖；需 `createExtendedRegistry` 显式启用）

## 回滚方案

改 `retrieval-stage.ts` 的 `WS_FOUNDATION_ROUTES = true` → `false`：
- 旧 KB/金库 块恢复执行，新块回到影子比对模式（不注入）
- 新模块文件保留（零侵入，不影响主链）

## 验证

- 60 个 retrieval 单测（fusion 16 / adapter 13 / adapters 9 / format 16 / adapters-s6 6）
- 关键回归 109 测试全绿
- 已知预存在失败（search-v12/v13 entityUuid 断言 + DAG 闭包，之前会话 A3 修复语义变更，与本模块无关）

## 后续（SearchOrchestrator 阶段）

1. `runAllAdapters` 加 `withTimeout` / circuit breaker / 部分失败降级
2. 用 `createExtendedRegistry` 接入 Conversation/FamilyGraph/Memory 域前，先停用 V13/V11 对应召回（避免重复注入）
3. V13-v2 重建输出用 `backref` 彻底修 fake id，解锁长文直取 V13
4. 收编"砂金高钙化"块到 MemoryAdapter（memory 域）
