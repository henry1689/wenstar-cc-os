---
name: meeting-mode-v5
description: 实体会议模式 V5 蓝皮书 — _meetingEntityName 全部传播点决策树
metadata:
  node_type: implementation
  type: blueprint
  version: V5.1
  last_updated: 2026-07-26
  s4_verified: true
  s4_notes: >
    全部 20 个传播点行号已通过 grep 重新确认。
    S4 确认 MeetingContextPipeline.ts 源文件存在（src/webui/chat/MeetingContextPipeline.ts）。
    S4 确认 MemoryInjector 已接入 chat.ts (L56 import, L1224-1231 injectMemories 调用, L1370 withMemoryBackground 消费)。
  source_files:
    - src/webui/chat.ts
    - src/webui/server.ts
    - src/m4/household/EntityMeeting.ts
---

# 实体会议模式 V5 蓝皮书

## 一、_meetingEntityName 传播点决策树

`_meetingEntityName` 是整个会议模式的核心信号变量。以下记录该变量在所有模块中的传播点和决策逻辑。

### 传播路径图

```
用户消息
  │
  ├─[1] server.ts processChat / handleUserMessage
  │     └─ EntityMeeting.detectUserIntent(message, familyGraph.getAllPersonNames())
  │         OR
  │     └─ 人工匹配 familyGraph.getAllPersonNames() 中的名字
  │
  └─[2] chat.ts runMeetingStage
        └─ ctx._entityMeeting.enter(entityName)
           └─ _meetingEntityName = ctx._entityMeeting.getEntityName()
```

### _meetingEntityName 全部传播点

> S4 验证：全部 20 个行号已通过 grep -n 重新确认，与 chat.ts 当前版本一致。

| # | 传播点 | 决策 | 文件/行号 | S4 |
|---|--------|------|-----------|-----|
| 1 | 实体设置 | `dna.entity_genes.push({ name: entityName })` | chat.ts L777 | ✓ |
| 2 | M4 知识检索 | `meetingCtx.getEntityName()` 参数传给 `buildPreM4Context` | chat.ts L789-796 | ✓ |
| 3 | 实体上下文构建 | `buildEntityContext(fg, { entityName })` | chat.ts L723-724 | ✓ |
| 4 | 话题延续 | 上轮实体回复用于本轮 `_entityContextText` 拼接（经 meetingCtx.getContextText() 消费） | chat.ts L755 | ✓ |
| 5 | 三源熔铸跳过 | `refinePostM4Context` 跳过三源熔铸+玉瑶想起 | chat.ts L869-870 | ✓ |
| 6 | 角色路由跳过 | 会晤模式下固定 `neutral` 角色 | chat.ts L1333 | ✓ |
| 7 | M6 自我模型跳过 | `if (!meetingCtx.isActive())` 守卫 | chat.ts L1472 | ✓ |
| 8 | VAD/仿生跳过 | 三源熔铸跳过时连带跳过 | chat.ts L869-870 | ✓ |
| 9 | 线索助理跳过 | 同 refinePostM4Context 守卫 | chat.ts L869-870 | ✓ |
| 10 | 亲密 KB 跳过 | `!meetingCtx.isActive()` 守卫 | chat.ts L1369 | ✓ |
| 11 | PFC 空间标签 | `spatial.sceneLabel = meetingCtx.toSnapshot().sceneLabel` | chat.ts L1263 | ✓ |
| 12 | PFC meetingEntity | `meetingEntity: meetingCtx.toSnapshot().entityName` | chat.ts L1265 | ✓ |
| 13 | 群组上下文构建 | `buildMultiEntityContext(fg, { entityNames })` | process-stages.ts L205 | ✓ |
| 14 | 退出纪要归档 | `exitResult.minutes` 自动写入会议纪要 | chat.ts L647 | ✓ |
| 15 | 结构标签保留 | `preserveLabels: !!meetingCtx.isActive()` → injectMemories() | chat.ts L1230 | ✓ |
| 16 | 用户意图检测 | `EntityMeeting.detectUserIntent(message, allNames)` | chat.ts L657 | ✓ |
| 17 | 服务器级 FG 同步 | `familyGraph.getAllPersonNames()` → entity_relations 同步 | server.ts L611 | ✓ |
| 18 | 多人会晤 | `entityMeeting.enterMulti(intentNames)` | chat.ts L660 | ✓ |
| 19 | 退出检测 | `/^(散会|结束.*会议|...)/` 正则匹配 | chat.ts L646 | ✓ |
| 20 | 标签名传递 | `meetingCtx.getEntityName()` / `meetingCtx.isActive()` 用于参数传递 | 多处 (L796, L1511, L1529 等) | ✓ |

## 二、会晤触发路径

### 路径 A：chat.ts EntityMeeting.detectUserIntent（主路径）

```typescript
const fg = ctx.m4?.getFamilyGraph?.();
const allNames = fg?.getAllPersonNames?.() || [];
const intentNames = EntityMeeting.detectUserIntent(message, allNames);
```

### 路径 B：server.ts 服务器级（降级路径）

```typescript
const HC = familyGraph?.getAllPersonNames?.() || [];
// 匹配 message 中的名字
```

### 路径 C：server.ts handleUserMessage（新架构降级）

```typescript
const HC = familyGraph?.getAllPersonNames?.() || [];
// 强制激活会晤
```

## 三、名字来源统一

V5.1 已将全部名字来源统一为 `familyGraph.getAllPersonNames()`：

- server.ts 启动时 FG 初始化 `syncEntitiesToDB()` L611 → `familyGraph.getAllPersonNames()`
- chat.ts 会晤检测 `runMeetingStage` L657 → `familyGraph.getAllPersonNames()`

不再有任何硬编码人名名单。

## 四、P0-1 合规确认

| 要求 | 实现 |
|------|------|
| 仅通过 FG/entity_genes 获取人名 | ✓ getAllPersonNames() 来自 FG |
| M1 DNA 编码器标准化 | ✓ entity_genes 中实体的 allele/phenotype 由 M1 编码 |
| 无硬编码人名 | ✓ S4 已删除 server.ts 中两处硬编码名单 |

## 五、S3 新增：MeetingSessionContext 不可变快照模式

### 5.1 背景

V5 中会晤状态通过散落的局部变量（`_meetingEntityName`、`_entityContextText`、`_meetingKBCache`、`_activeMeetingName`）在 14 处引用点之间传递。这导致：
- 同一轮内不同消费方可能看到不一致的状态
- 会晤状态修改点分散，排查困难
- 变量名不统一（`_meetingEntityName` vs `_activeMeetingName` vs `meetingEntityName`）

### 5.2 设计

`MeetingSessionContext`（文件：`src/webui/chat/MeetingSessionContext.ts`）是会晤会话不可变上下文快照，创建后不可变（每轮对话创建新实例），确保同轮内所有消费方看到一致的快照。

```typescript
class MeetingSessionContext {
  private readonly _entityName: string | null;
  private readonly _contextText: string;
  private readonly _kbCache: Map<string, string>;

  getEntityName(): string | null;  // 会晤实体名
  getContextText(): string;         // 实体上下文文本
  getKBCache(): Map<string, string>; // 知识库缓存
  isActive(): boolean;              // 会晤是否激活
  toSnapshot(): MeetingSnapshot;    // 输出快照供 PFC 等下游使用
}
```

### 5.3 生命周期

```
chat.ts 每轮对话
  │
  ├─[1] 创建 meetingCtx（entityName=null, contextText=''）
  │
  ├─[2] 检测会晤激活 → ctx._entityMeeting.getEntityName()
  │     └─ entityName 不为空 → 重建 meetingCtx（含 entityName）
  │
  ├─[3] 实体上下文构建（_entityContextText 追加档案/KB缓存/话题延续）
  │
  ├─[4] 上下文构建完成 → 最终重建 meetingCtx（含完整 contextText）
  │
  └─[5] 下游消费：
        ├─ buildPreM4Context → meetingCtx.getEntityName()
        ├─ refinePostM4Context 守卫 → meetingCtx.isActive()
        ├─ KnowledgeTextAssembler → meetingCtx.getContextText()
        └─ 角色路由跳过 → meetingCtx.isActive()
```

### 5.4 S4 收敛结果

S4 修复前：`_meetingEntityName` 有 14 处引用点，其中 11 处使用裸变量，仅 3 处迁移到 `meetingCtx`。

S4 修复后：所有 14 处引用点统一通过 `meetingCtx.getEntityName()` / `meetingCtx.isActive()` 获取，消除裸变量不一致风险。
