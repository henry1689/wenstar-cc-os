---
name: fg-kinship-v4
description: FG 户籍制度 V4.0 白皮书 — 角色扮演隔离机制与 FamilyGraph 数据安全
metadata:
  node_type: architecture
  type: whitepaper
  version: V4.0
  last_updated: 2026-07-26
---

# FG 户籍制度 V4.0 白皮书

## 一、核心原则

FamilyGraph（FG）是真实世界人际关系的唯一数据源。任何非真实场景（角色扮演/架空剧情）产生的实体和关系**不得写入主 FG**，必须路由到分支 FG 或完全隔离。

## 二、角色扮演隔离机制

### 2.1 守卫原理

V4.0 使用 `worldRuleMode`（来自 `TemporalConfig`）作为角色扮演隔离的总开关：

```typescript
// chat.ts L791 / L1736
if (worldRuleMode !== 'roleplay_exempt') {
  // 非角色扮演 → 正常写入主 FG
}
```

`worldRuleMode` 有两个状态：
- `'realistic'` — 真实世界模式，所有 FG 写入正常执行
- `'roleplay_exempt'` — 角色扮演豁免模式，FG 写入全部跳过

### 2.2 守卫覆盖范围

| 位置 | 保护内容 | 文件行号 |
|------|----------|----------|
| FG 关系反查写入 | 防止角色扮演人物关系污染主 FG | chat.ts ~L791 |
| 社交图谱同步 | 防止角色扮演社交关系写入主图谱 | chat.ts ~L1736 |
| M6 自我模型注入 | 会晤模式下跳过玉瑶自我模型 | chat.ts ~L1451 |

### 2.3 与 M6 角色守卫的关系

M6 自我模型通过 `_meetingEntityName` 进行额外守卫（会晤模式 ≠ 角色扮演）：
```typescript
if (!_meetingEntityName && _selfBlocks.length > 0) {
  // 非会晤模式才注入自我模型
}
```

`worldRuleMode` 守卫和 `_meetingEntityName` 守卫是**互补**的：
- `worldRuleMode` → 全局角色扮演/非角色扮演切换
- `_meetingEntityName` → 会晤模式的局部隔离

## 三、FG 红线对照

| 红线编号 | 规则 | V4.0 实现 |
|----------|------|-----------|
| §1.2 | entity_relations 不写中文关系词 | ✓ KINSHIP_LABEL 仅作文档参考，写入侧使用英文 edge 类型 |
| §2.1 | roleplay_forbidden 检查 | ✓ `worldRuleMode !== 'roleplay_exempt'` 守卫 |
| §2.2 | M6 角色守卫 | ✓ 双重守卫：worldRuleMode + _meetingEntityName |
| §3 | 角色扮演入口管控 | ✓ 三大入口统一通过 worldRuleMode 切换 |
| §5 | FG 数据层不硬编码人名 | ✓ server.ts 使用 `familyGraph.getAllPersonNames()` |

## 四、决策记录

### 决策 1：使用 `worldRuleMode` 替代 `_currentRoleplay`

**背景**：原 V3.0 使用局部变量 `_currentRoleplay` 跟踪角色扮演状态，但该变量在多轮对话和异步流程中容易丢失状态。

**决策**：V4.0 改用 `TemporalConfig.worldRuleMode`（模块级全局状态），因为：
1. 角色扮演状态需要跨轮次持久化
2. `worldRuleMode` 是 `TemporalConfig` 的已有机制（`realistic` / `roleplay_exempt`）
3. 模块级变量不受异步上下文切换影响

**风险**：全局状态意味着所有并发请求共享同一个模式。当前系统是单用户场景，风险可控。

### 决策 2：entity_relations 强制英文 edge 类型

**背景**：原实现将 KINSHIP_LABEL 的中文关系词（妈妈/姐姐等）直接写入 entity_relations.relation 字段，导致与 FG edges 表的英文类型（mother_of/sister_of）不一致。

**决策**：entity_relations.relation 字段始终使用英文 edge 类型，KINSHIP_LABEL 仅保留为文档参考映射表。中文标签应在 UI 展示层或独立的 labels 表中存储。

## 五、S3 新增：MeetingFGWriter 写入代理层

### 5.1 背景

V4.0 中 chat.ts 存在 3 处直接调用 `FamilyGraph` API 的写入操作，绕过了角色扮演守卫和实/分 FG 分叉判定。S3 引入 `MeetingFGWriter`（文件：`src/m4/household/MeetingFGWriter.ts`）作为 FG 写入操作的统一代理层。

### 5.2 职责

```typescript
interface MeetingFGWriterDeps {
  realFg: FamilyGraph;    // 主 FG 实例（写操作使用，始终指向真实 FG）
  currentFg: FamilyGraph; // 当前 FG 实例（可能是角色分支，读操作使用）
  isRoleplay: boolean;    // 是否处于角色扮演模式
}
```

### 5.3 realFg vs currentFg 分离规则（红线 8）

| 操作 | 使用的 FG | 说明 |
|------|----------|------|
| `updatePersonProfile()` | `realFg` | 人物档案写入，必须写入主 FG |
| `addFeatureEdge()` | `currentFg` | 特征边添加，使用当前 FG（异步操作） |
| `syncSocialRelation()` | `currentFg` | 社交关系同步，使用当前 FG（异步操作） |
| `canWrite()` 守卫 | `isRoleplay` | 角色扮演时阻止所有写操作（红线 1） |

### 5.4 工厂函数

`createMeetingFGWriter(ctx)` 从 chat.ts 上下文创建实例，支持可选 `realFg` 参数：

```typescript
createMeetingFGWriter({
  m4: ctx.m4,
  _currentRoleplay: ctx._currentRoleplay,
  realFg?: FamilyGraph,  // S4 新增：调用方传入主 FG 引用
})
```

- 若提供 `realFg`：写操作直接使用该引用（绕过角色分支）
- 若未提供：fallback 到 `ctx.m4.getFamilyGraph()`（向后兼容）

### 5.5 S4 修复：P3 答案提取路径

S4 修复前，chat.ts P3 答案提取路径（L480-481）直接调用 `_realFg.updatePersonProfile()`，完全绕过 MeetingFGWriter 的角色扮演守卫。S4 修复后统一改为 `createMeetingFGWriter(ctx).updatePersonProfile()`。
