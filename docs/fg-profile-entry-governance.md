# FG 人物档案录入系统 · 治理梳理与统一管控方案

> 落盘日期：2026-08-17
> 状态：梳理完成，管控方案待分阶段实施
> 优先级：P0 止血 → P1 收编 → P2 补强

---

## 一、系统全景

### 1. 数据模型（PersonDossier）

档案本体是**一个 JSON 对象**，存于 `family_graph.db` 的 `nodes.properties` 列。类型定义在 `src/m4/household/FamilyGraph.ts:142-324`，从「七子卷」演进到「10 模块 + 3 扩展」：

| 子卷 | 内容 |
|------|------|
| `basicInfo` / `contact` / `lifeResume` | 基础信息 / 联系方式 / 人生履历 |
| `imageTraits` | 形象特质（含 18 项 `feminineDetails`） |
| `personalityPrefs` / `health` / `socialCapital` | 性格偏好 / 健康 / 社会资本 |
| `relationMap` / `familyNetwork` | 关系定位 / 家庭关系网 |
| `lifeMilestones` / `memoryAnchors` / `boundDocuments` | 里程碑 / 记忆锚点 / 典籍绑定 |
| `selfProfile` / `socialIdentity` / `roleplayProfile` | 完整人设 / 社会身份时间线 / 角色扮演档案 |

### 2. 存储

- 独立库 `data/webui/knowledge/family_graph.db`（sql.js），两张表：`nodes`（档案本体）+ `edges`（关系边）
- 防抖落盘：`markDirty()` 500ms 聚合 → `flush()` export 写盘（`FamilyGraph.ts:3000-3026`）

### 3. 写入入口（4 类，全部绕过 UUID 管控）

| 入口 | 代表位置 | 写什么 |
|------|---------|--------|
| ① 聊天链路自动录入 | `src/m4/M4Orchestrator.ts:266` → `integrateFromEntity` | 节点 / 家族边 / 档案 |
| ② chat.ts 直接写 | `src/webui/chat.ts:424/457/538/1049/2286/2297` | 外貌 / 特征边 / 关系 / 职业 |
| ③ HTTP API | `src/webui/server-family-routes.ts:55/94` | 整库 restore / 补 dossier |
| ④ 批量脚本群 | `scripts/enrich-fg-profiles.cjs` 等 20+ 个 | 直写 `UPDATE nodes/edges` SQL |

### 4. 输出链路

读档 → `EntityContextBuilder.ts` 组织成【你的身份/家人/社会身份/性格/外貌/里程碑】→ `finalKnowledgeText` 22 段注入 → DeepSeek；另有 HTTP 输出 `/api/household/person`。

---

## 二、现有管控机制（3 层，均偏读侧或纸面）

| 机制 | 现状 |
|------|------|
| **UUID 户籍法**（四层标注 + 五道闸门） | `UUIDPoliceFilter` 是纯读侧过滤，无写函数 |
| **FG 11 条红线**（角色扮演隔离） | 防护点大面积名存实亡 |
| **Harness 治理**（Sentinel + S1-S7） | `harness-gate.cjs` 对 `scripts/` 全部豁免 |

---

## 三、🔴 管控盲区清单

### A. 写入侧零管控

`UUIDPoliceFilter` 只做读侧 deny-by-default，FG 的 `addNode/updatePersonProfile/integrateFromEntity` 全部直接执行 SQL，唯一写前守卫是 `GarbageEntityGuard`（垃圾人名过滤），与 UUID 授权无关。

### B. 五道闸门只挂了 2 道

| 闸门 | 状态 |
|------|------|
| ① 写入 persistence-stage | ✅ 已挂 |
| ② 搜索 `_entityUuidClause` | ✅ 已挂 |
| ③ finalKnowledgeText（screenContext） | ⚠️ 仅会晤模式 |
| ④ EntityContextManager | ⚠️ 用 `content.includes` 关键词，非 UUID |
| ⑤ `assertMasterKey` | ❌ 运行时零调用 |

### C. 角色扮演隔离是「纸面工程」

- `MeetingFGWriter`（写守卫代理）—— **全仓库零 import，死代码**
- `FamilyGraphRoleBranch.ts` —— **文件不存在**（哨兵 `fileExists` 静默跳过，不报警）
- `RoleplayIsolationGuard` —— 只在测试调用，且 `assertNoMainFGWrite` 只 `console.error` 不 `throw`
- 后果：`chat.ts:424/457/538` 的 `_realFg`/`_fgX` 实际指向同一实例，角色扮演时仍会直接污染主 FG

### D. scripts/ 是最大盲区

20+ 批量脚本用 sql.js 裸写 `family_graph.db`，且被 `harness-gate.cjs` 的 `EXEMPT_PATTERNS` 全部豁免。**路径还写错**：多数写旧路径 `data/knowledge/family_graph.db`，规范路径是 `data/webui/knowledge/`。

### E. 文档与代码漂移

白皮书声称的 `worldRuleMode` FG 守卫、`MeetingFGWriter` S4 修复，在当前代码里均不存在。

---

## 四、统一管控方案（分层收口）

核心思路：**把「写入」也纳入 UUID 户籍法 + FG 红线的强制约束，收口到唯一写入门户**，消除「读侧管、写侧漏」的失衡。

### 第 1 层 —— 写入门户收口（P0 止血）

新建 `FGProfileWriteGateway`（`src/m4/household/`，复用 `DossierService` 门面位置），作为 FG 档案写入的**唯一合法入口**，内置 5 个强制校验：

1. `belong_entity_uuid` 授权（扩展 `UUIDPoliceFilter` 新增 `assertCanWrite()`）
2. 垃圾实体守卫（复用 `GarbageEntityGuard`）
3. 角色扮演隔离（复用 `RoleplayIsolationGuard`，`console.error` 改 `throw`）
4. 持久化落盘（强制 save/flush）
5. 变更审计（写 `_changeHistory` + 审计日志）

`chat.ts` 所有直接写 FG 处改为走网关。

### 第 2 层 —— 脚本群收编（P1）

- 新建统一脚本网关 CLI（`scripts/fg-write-cli.cjs`），内部走 `FamilyGraph` 类而非裸 SQL
- 存量 20+ 直写脚本逐步迁移；无法迁移的标「治理例外」，收紧 `harness-gate` 对写 `family_graph.db` 脚本的豁免

### 第 3 层 —— 哨兵补强 + 文档对齐（P2）

- 修 `fg-integrity-meter` / `roleplay-isolation-meter`：文件缺失 → 报红（不再静默）
- 白皮书 vs 代码现状如实对齐

---

## 五、当前决策（2026-08-17）

- 交付形式：落成文档（本文件）
- 下一步：**先修角色隔离纸面工程**（第 1 层的前置止血，属 P0）

详见后续会话的方案与实施记录。