# WenStarOS 系统评价与改善路线图

> **评估日期**: 2026-07-27 | **综合评分**: 7.8/10
> **一句话评价**: 这是一个认知系统思想很强、工程风险意识很成熟，但核心编排层和数据一致性仍然高度脆弱的「复杂生命体式 AI OS」。

---

## 总体评价

| 维度 | 评分 | 评价 |
|:---|---:|:---|
| 架构野心 | 9/10 | 很高 |
| 认知模型设计 | 9/10 | M1-M9 很完整，仿生语义强 |
| 记忆体系 | 8/10 | 多层记忆优秀，UUID 标注率需提高 |
| 人物关系系统 | 8.5/10 | FG 是核心亮点，但 FamilyGraph 过胖 |
| 工程风险意识 | 9.5/10 | 风险文档非常成熟 |
| 仿生表达力 | 9/10 | 概念体系完整 |
| 模块划分 | 7/10 | 已有清晰认知分层 |
| 长期演化潜力 | 9/10 | 如果治理好，扩展空间很大 |
| 测试与审计 | 7/10 | 流程完整，需更多自动化 |
| 扩展潜力 | 8/10 | 很大 |
| 角色隔离 | 6/10 | 红线明确，但状态分散 |
| 可维护性 | 5.5/10 | chat.ts / FamilyGraph.ts / finalKnowledgeText 是瓶颈 |
| 数据一致性 | 5.5/10 | SQLite save、防抖、UUID 回填仍危险 |
| Prompt 治理 | 5/10 | 注入块太线性，缺结构化优先级 |
| 生产稳定性 | 5/10 | 需要进一步治理 |

---

## 一、总览优先级地图

### 等级定义

| 等级 | 含义 |
|:---|:---|
| **S 级** | 系统命门，必须优先处理 |
| **A 级** | 高影响问题，建议近期处理 |
| **B 级** | 中期治理问题 |
| **C 级** | 可后置优化问题 |

### 维度定义

| 维度 | 含义 |
|:---|:---|
| **危险等级** | 当前问题引发线上故障、数据污染、人格串线、记忆丢失的风险 |
| **重要等级** | 对 WenStarOS 长期架构质量和核心能力的影响 |
| **优先次序** | 建议处理顺序 |
| **处理类型** | 重构 / 审计 / 测试 / 配置化 / 数据治理 / 架构收敛 |

---

### P0：必须最先处理（6项）

| 编号 | 问题 | 危险 | 重要 | 次序 | 类型 |
|:--:|:---|---:|:--:|:--:|:---|
| P0-1 | `finalKnowledgeText` 线性拼接导致 Prompt 注入冲突 | S | S | 1 | 重构 |
| P0-2 | `_meetingEntityName` 等会话模式状态分散，身份隔离脆弱 | S | S | 2 | 架构收敛 |
| P0-3 | SQLiteAdapter 多实例 / save 防抖 / flush 不可靠导致数据丢失 | S | S | 3 | 重构 |
| P0-4 | `belong_entity_uuid` 标注链路不完整，实体记忆失忆 | S | S | 4 | 数据治理 |
| P0-5 | 角色扮演污染主 FG 或读取主 FG 泄漏 | S | S | 5 | 测试+架构 |
| P0-6 | `chat.ts` 作为神级编排文件，任何修改牵动全局 | S | S | 6 | 架构收敛 |

### P1：近期应该处理（8项）

| 编号 | 问题 | 危险 | 重要 | 次序 | 类型 |
|:--:|:---|---:|:--:|:--:|:---|
| P1-1 | `FamilyGraph.ts` 过胖，关系、档案、迁移、推理混在一起 | A | S | 7 | 架构收敛 |
| P1-2 | UUID 标注率偏低，黑钻/知识库人物归属不足 | A | S | 8 | 数据治理 |
| P1-3 | 新旧两套角色扮演管线规则不同步 | A | A | 9 | 架构收敛 |
| P1-4 | 硬编码人名、关系、正则、农历映射散落在 `chat.ts` | A | A | 10 | 配置化 |
| P1-5 | PFC 输出仍偏文本化，无法稳定治理 Prompt 优先级 | A | A | 11 | 重构 |
| P1-6 | FG 关系事实多源，`relation_to_user` 与 edges 权威性混乱 | A | A | 12 | 架构收敛 |
| P1-7 | 垃圾实体识别依赖黑名单，FG 污染风险持续存在 | A | A | 13 | 审计 |
| P1-8 | 行为核验仍偏人工，缺少模式化自动测试 | A | A | 14 | 测试 |

### P2：中期治理（7项）

| 编号 | 问题 | 危险 | 重要 | 次序 | 类型 |
|:--:|:---|---:|:--:|:--:|:---|
| P2-1 | TS 与 Python 三域未来能力重叠，可能形成双脑冲突 | B | A | 15 | 架构收敛 |
| P2-2 | M1-M9 虽无循环依赖，但编排语义集中在 `chat.ts` | B | A | 16 | 架构收敛 |
| P2-3 | KnowledgeBase 与 KnowledgeEngine 存在反转依赖 | B | B | 17 | 架构收敛 |
| P2-4 | 数据库 schema 迁移与运行时修正边界不清 | B | A | 18 | 数据治理 |
| P2-5 | 黑钻、梦境、年轮之间缺少统一生命周期协议 | B | A | 19 | 架构收敛 |
| P2-6 | EngineContext、PFC、M6、M3 之间存在语义重叠 | B | B | 20 | 架构收敛 |
| P2-7 | Observability 能看健康，但缺少专门的认知一致性指标 | B | A | 21 | 审计 |

### P3：后续优化（5项）

| 编号 | 问题 | 危险 | 重要 | 次序 | 类型 |
|:--:|:---|---:|:--:|:--:|:---|
| P3-1 | 配置项多，但缺少配置依赖图和默认策略解释 | C | B | 22 | 配置化 |
| P3-2 | 目录模块很多，新成员理解成本高 | C | B | 23 | 配置化 |
| P3-3 | 文件行数过大导致 Review 成本高 | C | B | 24 | 重构 |
| P3-4 | 部分历史兼容代码需要退场计划 | C | B | 25 | 架构收敛 |
| P3-5 | 角色/persona/FG 三套命名体系需要术语统一 | C | B | 26 | 配置化 |

---

## 二、各类别详细问题分析

### 1. Prompt 注入与上下文组装

#### P0-1: `finalKnowledgeText` 线性拼接

**影响位置**: `src/webui/chat.ts:1208-1484`

**当前风险**: 注入块顺序变化会直接改变 LLM 行为

**典型后果**: 身份混淆、规则覆盖、记忆污染、角色串线、回答风格异常

**问题**:
1. 后注入块可能覆盖前注入块
2. 没有 hard rule / soft context / memory / persona 的优先级区分
3. 会晤、角色扮演、正常聊天共用一条拼接链
4. 无法可靠测试最终 Prompt 结构
5. 任何新功能都要插入这条线性链，风险持续增加

**改善方案**: 建立结构化 Prompt 组装器

```typescript
interface PromptBlock {
  id: string;
  type: 'hard_rule' | 'safety' | 'identity' | 'memory' | 'knowledge' | 'persona' | 'emotion' | 'task' | 'style';
  priority: number;
  source: string;
  modeScope: ChatModeKind[];
  content: string;
  conflictPolicy?: 'override' | 'merge' | 'drop_if_conflict';
}
```

所有模块只提交 `PromptBlock`，不直接拼接字符串。由 `PromptAssembler` 统一完成：收集 → 去重 → 冲突检测 → 优先级排序 → token 裁剪 → 渲染。

**验收标准**:
- `chat.ts` 中不再直接维护长 `finalKnowledgeText += ...` 链
- 每个注入块有明确 `id/type/priority/source`
- 会晤、角色扮演模式能输出 prompt block 快照
- 自动测试能判断某模式下哪些 block 必须存在、哪些 block 禁止存在

---

#### P1-5: PFC 输出仍偏文本化

**影响位置**: `PrefrontalCortex.ts`, `chat.ts`

**问题**: PFC 如果只输出一段文本，仍会被 `finalKnowledgeText` 线性拼接链吞掉

**改善方案**: PFC 改为结构化输出

```typescript
interface PFCOutput {
  blocks: PromptBlock[];
  suppressionRules: SuppressionRule[];
  retrievalPolicy: RetrievalPolicy;
  writePolicy: MemoryWritePolicy;
  emotionState: EmotionState;
}
```

让 PFC 不只"生成文本"，而是参与检索控制、注入控制、写入控制、遗忘控制、安全压制。

---

### 2. 会话模式、身份隔离与角色系统

#### P0-2: `_meetingEntityName` 传播链过长

**影响位置**: `chat.ts` 12 个判断点

**问题**: 当前会晤模式依赖 `_meetingEntityName` 在多个阶段手动判断

**改善方案 1 — 统一状态机**:

```typescript
type ChatMode =
  | { kind: 'normal' }
  | { kind: 'entity_meeting'; entityUuid: string; entityName: string }
  | { kind: 'roleplay'; branchId: string; roleId: string; allowMainFgRead: false }
  | { kind: 'task'; taskType: string };
```

**改善方案 2 — 统一策略层**:

```typescript
class ChatPolicy {
  canInjectM6(): boolean;
  canUseRoleHint(): boolean;
  canUsePFCKnowledgeRefine(): boolean;
  canUseUnknownGuard(): boolean;
  canUseMainFamilyGraph(): boolean;
  canPersistToMainFG(): boolean;
  canUseKnowledgeBase(): boolean;
}
```

把所有 `if (!_meetingEntityName)` 替换为 `if (policy.canInjectM6())`

**验收标准**:
- `_meetingEntityName` 不再作为跨层裸变量传播
- 每个模式都有明确权限矩阵
- 会晤模式自动禁止 M6 主人格注入
- 角色扮演模式自动禁止写主 FG
- 三种模式都有快照测试

---

#### P0-5: 角色扮演污染主 FG

**影响位置**: `FamilyGraphRoleBranch.ts`, `chat.ts`, `RoleClassifier`, `PersonaRegistry`

**问题**: 角色扮演最严重的 5 个红线：虚构角色写入主 FG、角色分支读取主 FG、退出时未清理 FG override、FG 真人被角色扮演、A 角色知道 B 角色信息

**改善方案**: 建立 `RoleplayIsolationGuard`

```typescript
class RoleplayIsolationGuard {
  assertNoMainFGWrite(mode: ChatMode): void;
  assertNoMainFGRead(mode: ChatMode): void;
  assertRealPersonNotRoleplayed(entityUuid: string): void;
  assertBranchActive(branchId: string): void;
}
```

在以下入口强制检查：`FamilyGraph.write`、`MemoryStorage.write`、`KnowledgeEngine.add`、`MeetingContextPipeline`、`EntityContextBuilder`、`M5.orchestrate`、`persistConversation`

**验收标准**:
- A 角色知道秘密 X → 退出 → B 角色不能知道 X
- 角色扮演中写入人物 → 不出现在主 FG
- 真人姓名进入角色扮演 → 拒绝或转会晤模式
- 退出角色 → 三清完成

---

#### P1-3: 新旧两套角色管线不同步

**问题**: 当前存在 `legacy: buildRoleplayRules()` 和 `structured: runRoleplayPipeline()` 两套

**改善方案**: 建立共享规则源 `RoleplayRuleRegistry`，两套管线都从同一 registry 生成规则

**迁移路径**: 短期共享规则源 → 中期 legacy 调用 structured → 长期删除 legacy

---

### 3. 数据持久化与数据库一致性

#### P0-3: SQLiteAdapter save/flush 命门

**影响位置**: `SQLiteAdapter.ts:1406-1448`

**问题**:
1. `save()` 未调用，重启丢失
2. 多 SQLiteAdapter 实例各自 export，互相覆盖
3. ConversationDB 未委托 `scheduleFlush()`
4. 异常退出前未 flush
5. 防抖期间崩溃导致最近写入丢失

**改善方案**:

**强制单例**:
```typescript
class SQLiteAdapter {
  private static instance: SQLiteAdapter | null = null;
  static getInstance(): SQLiteAdapter { /* ... */ }
  private constructor() {}
}
```

**区分写入语义**: `writeMemory()` → `scheduleFlush()` → `flushNow()` → `shutdownFlush()`

**进程退出钩子**:
```typescript
process.on('SIGINT', flushNow)
process.on('SIGTERM', flushNow)
process.on('beforeExit', flushNow)
```

**验收标准**: 自动化持久化审计 — 写入测试数据 → flush → 停服 → 重启 → 确认 conversations/memories/black_diamond 均未丢失

---

#### P0-4: `belong_entity_uuid` 标注链路不完整

**影响位置**: `persistence-stage.ts`, `SQLiteAdapter`, `safe-backfill.cjs`, `KnowledgeEngine.add`

**当前标注率**:

| 表 | 当前 | 目标 | 风险 |
|:---|---:|---:|:---|
| conversations | ~50% | 80%+ | 会晤上下文漏召回 |
| memories | ~40% | 80%+ | 角色失忆 |
| black_diamond | ~10% | 90%+ | 最高价值记忆无法归属 |
| knowledge_base | ~15% | 70%+ | 人物知识无法隔离 |
| entities | ~30% | 95%+ | 实体链不完整 |

**改善方案**:
1. 建立 UUID 标注健康面板
2. 建立统一解析服务 `EntityOwnershipResolver.resolve(message, dna, mode): EntityOwnership`

**健康面板指标**:
- conversations / memories / black_diamond / knowledge_base 标注率
- 无 UUID person 数量
- belong_entity_uuid 指向不存在节点数量
- 同名多 UUID 数量
- 垃圾实体数量

---

#### P2-4: 数据库 schema 迁移与运行时修正边界不清

**问题**: `relation_to_user` 被迁移反复覆盖

**改善**: 定义数据权威源

| 事实类型 | 权威来源 |
|:---|:---|
| 人物关系 | `edges` |
| 人物 UUID | `nodes.uuid` |
| 会话归属 | `conversations.belong_entity_uuid` |
| 记忆归属 | `memories.belong_entity_uuid` |
| 最高价值记忆归属 | `black_diamond.belong_entity_uuid` |
| 展示型 relation_to_user | 可缓存，不可作为事实源 |

---

### 4. FamilyGraph 与实体系统

#### P1-1: `FamilyGraph.ts` 过胖（5934行）

**改善方案**: Facade 化拆解

```
FamilyGraph.ts                 facade 门面
FamilyGraphRepository.ts       数据访问
UUIDService.ts                 TXS-ID 生成/查询
RelationResolver.ts            称谓/边/BFS
DossierService.ts              七子卷读写
FamilyGraphMigration.ts        schema/迁移
EntityGarbageGuard.ts          垃圾实体过滤
RoleBranchAdapter.ts           角色分支适配
```

外部仍调用 `FamilyGraph`，内部逐步委托。

---

#### P1-6: `relation_to_user` 与 edges 权威性混乱

**改善**: `edges` 为关系事实唯一权威源，`dossier.relation_to_user` 仅为展示缓存。所有关系判断必须使用 `RelationResolver.resolveRelationToUser(entityUuid)`。

---

#### P1-7: 垃圾实体污染 FG

**改善**: 建立实体候选等级

| 等级 | 类型 | 处理方式 |
|:---|:---|:---|
| L0 | 禁止词 | 永不入 FG |
| L1 | 普通称谓 | 需绑定具体人物 |
| L2 | 昵称/别称 | 需指代解析 |
| L3 | 明确姓名 | 可候选入库 |
| L4 | 已有 TXS-ID | 稳定实体 |
| L5 | 用户确认实体 | 高置信实体 |

---

### 5. `chat.ts` 神级编排

#### P0-6: `chat.ts` 过度集中

**当前职责**: 请求入口、M1-M9 编排、会晤判断、角色路由、PFC、知识注入、Prompt 拼接、持久化、行为防御、状态维护、硬编码规则

**改善方案**: 拆解为目标架构

```
ChatEntry.ts             请求入口
ChatModeResolver.ts      模式判断
ChatPolicy.ts            权限策略
CognitivePipeline.ts     M1-M9 编排
PromptAssembler.ts       Prompt 组装
PersistenceCoordinator.ts 持久化协调
BehaviorGuard.ts         行为核验/防御
```

**目标**: `chat.ts` 不超过 500 行，不直接拼接 finalKnowledgeText，不直接判断所有模式细节，不直接持有大量硬编码。

---

### 6. 硬编码与配置治理

#### P1-4: 人名、正则、农历、脏词硬编码散落

**问题**: 硬编码包括"玉瑶""鸿艺""鸿叔""艺哥""徐诗雨""徐诗韵"、百家姓正则、外貌词正则、2026 农历日期、intimateSkip 脏话过滤、roleplay forbidden 检测

**改善**: 迁移到配置目录

```
src/config/entity-aliases.ts
src/config/relation-labels.ts
src/config/lunar-calendar.ts
src/config/safety-keywords.ts
src/config/extraction-patterns.ts
src/config/roleplay-forbidden.ts
```

---

### 7. 测试、审计与 Harness

#### P1-8: 行为核验仍偏人工

**改善**: 建立行为测试集

```
normal.behavior.test.ts
entity-meeting.behavior.test.ts
roleplay-isolation.behavior.test.ts
persistence.behavior.test.ts
prompt-block.snapshot.test.ts
```

**重点测试**: 会晤诗韵不说自己是玉瑶、角色 A 秘密不泄漏给角色 B、停止角色扮演后三清完成、亲密历史不污染工作模式、DeepSeek reasoning_content 必须剥离

---

#### P2-7: 缺少认知一致性指标

**建议指标**: PromptBlock 数量与类型分布、会晤模式禁用 block 命中率、UUID 标注率、FG 垃圾实体新增数、黑钻归属率、角色分支污染检测、检索命中来源分布、PFC suppression 生效率、梦境巩固成功率、年轮锚定数量、重复回复率、身份混淆率

---

### 8. TS 与 Python 双系统边界

#### P2-1: TS 与 Python 三域能力重叠

**风险**: 两个系统都算情绪、都维护自我状态、都输出成长信号

**改善**: 明确分工

| 系统 | 职责 |
|:---|:---|
| TS / wenstar-cc | 对话主链路、LLM、FG、记忆、Prompt、WebUI |
| Python / wenstar_os | 后台工作流、审计、规则计算、体感/环境纯函数、跨域事件 |

**原则**: Python 是感知外设、反射系统、审计系统；TS 是对话主脑和记忆权威源。

---

### 9. 模块依赖与历史债

#### P2-3: KnowledgeBase ↔ KnowledgeEngine 反转依赖

基础设施层 `KnowledgeBase.ts` 依赖应用层 `KnowledgeEngine.ts`。

**改善**: 短期禁止新增依赖 → 中期迁移调用方 → 长期删除 KnowledgeBase

#### P3-4: 历史兼容代码退场计划

| 模块 | 状态 | 替代 | 删除条件 |
|:---|:---|:---|:---|
| KnowledgeBase | deprecated | KnowledgeEngine | 无调用方 |
| legacy roleplay | 兼容中 | structured roleplay | 测试覆盖 |
| relation_to_user 读路径 | 兼容中 | RelationResolver | grep 无业务读取 |

---

## 三、推荐执行路线图

### 第一阶段：止血期（P0，建议 1-2 周）

| 顺序 | 动作 | 对应问题 |
|:--:|---|:--:|
| 1 | 建立 `PromptBlock + PromptAssembler` | P0-1 |
| 2 | 建立 `ChatMode + ChatPolicy` | P0-2 |
| 3 | SQLiteAdapter 单例化 + flushNow + shutdownFlush | P0-3 |
| 4 | 建立 `EntityOwnershipResolver` | P0-4 |
| 5 | 角色扮演隔离测试自动化 | P0-5 |
| 6 | `chat.ts` 先抽出 Prompt/Persistence/Policy 三块 | P0-6 |

### 第二阶段：结构治理期（P1，建议 2-4 周）

| 顺序 | 动作 | 对应问题 |
|:--:|---|:--:|
| 7 | `FamilyGraph.ts` facade 化 | P1-1 |
| 8 | UUID Health Report | P1-2 |
| 9 | 统一 RoleplayRuleRegistry | P1-3 |
| 10 | chat.ts 硬编码迁移到 config | P1-4 |
| 11 | PFC 输出结构化 | P1-5 |
| 12 | RelationResolver 成为关系唯一入口 | P1-6 |
| 13 | EntityCandidate 分级与垃圾实体守卫 | P1-7 |
| 14 | 行为核验转 vitest | P1-8 |

### 第三阶段：架构收敛期（P2，建议 1-2 月）

| 顺序 | 动作 | 对应问题 |
|:--:|---|:--:|
| 15 | 明确 TS/Python 权责边界 | P2-1 |
| 16 | 建立 CognitivePipeline 替代 chat.ts 编排细节 | P2-2 |
| 17 | 移除 deprecated KnowledgeBase | P2-3 |
| 18 | schema migration 分层治理 | P2-4 |
| 19 | 统一长期记忆生命周期协议 | P2-5 |
| 20 | 梳理 M3/M6/PFC/EngineContext 语义边界 | P2-6 |
| 21 | 增加认知健康 observability | P2-7 |

### 第四阶段：维护优化期（P3，持续处理）

| 顺序 | 动作 | 对应问题 |
|:--:|---|:--:|
| 22 | 配置依赖图和默认策略文档 | P3-1 |
| 23 | 模块导览和新成员阅读路径 | P3-2 |
| 24 | 大文件持续拆分 | P3-3 |
| 25 | deprecated 模块退场表 | P3-4 |
| 26 | 统一术语表 | P3-5 |

---

## 四、综合结论

WenStarOS 最核心的价值在于：它已经把「私人长期 AI 大脑」里最难的几个问题都摆到桌面上了——记忆归属、人物关系、身份隔离、长期巩固、自我叙事、提示词治理、数据库持久化、角色污染防护。这比单纯堆 RAG、堆 Agent、堆工具调用要高级很多。

当前最大的危险：系统已经长出了很多「脑区」，但连接它们的神经中枢还是靠一个超大 `chat.ts` 和一条长字符串 prompt 拼接链维持。

后续重点不应该继续加新功能，而应该做一次 **认知总线化 / prompt 结构化 / 会话状态机化 / 数据一致性审计化**。

如果这四件事完成，WenStarOS 会从「复杂但脆弱的仿生助手」升级成真正可持续演化的 **个人认知操作系统**。
