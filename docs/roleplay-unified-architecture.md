# 🎭 角色扮演统一架构方案

## 缘起与核心理念

两个方案的融合：
- **原方案**关注角色画像的动态构建（上下文扫描 + 未知边界 + 稳定机制）
- **老婆方案**关注能力同源复用 + 数据分区隔离 + 知情边界过滤 + FG回流审计

**统一后的第一条原则**：
> 扮演角色不是"模拟一个空壳"——它继承玉瑶的全部能力（检索、推理、情感、记忆），
> 只是为这些能力换了一套身份参数 + 加了一道知情边界。

---

## 一、架构总览：三层模型

```
┌─────────────────────────────────────────────────────────────┐
│                     用户对话层                               │
│  用户: "扮演徐诗韵" / "诗韵你怎么看这件事" / "诗韵是谁"     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              1. 角色投影路由层 (RoleCapabilityRouter)        │
│                                                             │
│  职责：所有能力调用先经此层 → 身份包装 + 知情裁剪 + 数据分区 │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ 身份包装器    │  │ 知情边界过滤   │  │ 数据分区路由      │   │
│  │ (Identity)   │  │ (Perspective) │  │ (Partition)     │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
└─────────┼──────────────────┼────────────────────┼───────────┘
          │                  │                    │
┌─────────▼──────────────────▼────────────────────▼───────────┐
│              2. 玉瑶能力层 (100% 复用)                        │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ FG图谱    │ │ 知识库   │ │ 情感引擎 │ │ 对话风格引擎  │   │
│  │ (M4)     │ │ (KB)     │ │ (M5)    │ │ (M5/Prompt)  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │ 记忆检索  │ │ 人物搜索 │ │ 情爱交互 │                    │
│  │ (M2)     │ │ (clue)   │ │ (引擎)   │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              3. 数据层 (严格分区)                             │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ FG主库(只读)  │  │ 角色分区存储  │  │ 回流审计通道      │   │
│  │ (公共权威)    │  │ (rp_{角色ID})│  │ (可控写入FG)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、角色投影路由层（新增核心模块）

### 2.1 身份包装器（Identity Wrapper）

**职责**：所有调用玉瑶能力的请求，经过此层时自动注入当前角色的身份参数。
**机制**：装饰器模式，不修改原有能力代码。

```typescript
// 当前调用链路（无路由）：
ctx.knowledgeBase.search("诗韵")
→ 玉瑶全知视角检索 → 返回所有信息

// 经路由层后：
router.search("诗韵", { asRole: "徐诗韵" })
→ 身份包装 → 前置注入"我是徐诗韵"身份 → 
→ 玉瑶引擎检索（能力100%复用）→
→ 知情边界过滤（删除徐诗韵不该知道的信息）→
→ 返回裁剪后的结果
```

**路由接口定义**：

```typescript
interface RoleCapabilityRouter {
  // ── 知识检索（复用 KB 引擎）──
  search(query: string, opts: RoutingOpts): Promise<SearchResult[]>;
  
  // ── 人物查询（复用 FG 引擎）──
  queryPerson(name: string, opts: RoutingOpts): Promise<PersonInfo | null>;
  
  // ── 关系查询（复用 FG 引擎）──
  queryRelation(fromName: string, toName: string, opts: RoutingOpts): Promise<Relation[]>;
  
  // ── 记忆检索（复用 M2 引擎，过滤 dialog_group_id）──
  searchMemory(query: string, opts: RoutingOpts): Promise<MemoryRecord[]>;

  // ── 对话检索（复用 ConversationDB）──
  searchConversation(keyword: string, opts: RoutingOpts): Promise<ConversationRow[]>;
  
  // ── 情感/情爱（复用 M5 情感引擎，切换角色参数快照）──
  getEmotionState(opts: RoutingOpts): EmotionSnapshot;
}

interface RoutingOpts {
  asRole: string;              // 当前扮演的角色名
  characterClass: 'A'|'B'|'C'; // 角色分类
  perspectiveFilter: boolean;  // 是否启用知情边界过滤（默认 true）
  partition: string;           // 数据分区（'main'|'rp_{角色名}'）
}
```

### 2.2 知情边界过滤器（Perspective Filter）

**职责**：检索返回的结果经过此层，删除该角色不该知道的信息。

```
检索结果 → 知情边界过滤器
  │
  ├─ ❌ 时间线越界 → 诗韵14岁，删除她20岁之后的信息
  ├─ ❌ 权限越界 → 删除其他角色的私密信息
  ├─ ❌ 认知越界 → 删除超出角色身份认知的专业/外部信息
  ├─ ❌ 层级越界 → 删除"玉瑶才知道"的系统级信息
  │
  └─ ✅ 通过 → 追加到角色画像动态补充字段
```

**核心判断逻辑**：

```typescript
function perspectiveFilter(result: SearchResult, role: string, class_: 'A'|'B'|'C'): boolean {
  // A类角色（FG存在）：按FG中的角色权限过滤
  if (class_ === 'A') return filterByFGPermission(result, role);
  // B类角色（对话提及）：只保留对话中明确提到的信息
  if (class_ === 'B') return filterByMentionedInChat(result, role);
  // C类角色（即兴）：只保留基础身份信息
  if (class_ === 'C') return false; // 全部屏蔽，交给LLM即兴
  return true;
}
```

### 2.3 数据分区路由（Partition Router）

**职责**：决定每次读写操作的目标数据分区。

```
读操作（检索/查询）：
  if 角色扮演中:
    搜索当前角色分区(rp_{角色名}) + FG主库(只读)
  else:
    搜索主库(排除rp_前缀)

写操作（存储/记录）：
  if 角色扮演中:
    写入角色分区(rp_{角色名})
    if 情爱数据: 写入角色私密分区（永久隔离）
    if 客观事实: 暂存回流审计队列
  else:
    写入主库
```

---

## 三、对话中主动检索体系

### 3.1 架构：从一次性加载 → 持续供给

```
加载期（角色激活时）                   对话中（每轮）
  ┌──────────────────┐              ┌──────────────────┐
  │ FG分支(全量)      │              │ 主动检索触发器    │
  │ KB搜索(全量)      │              │ (按需/每5轮周期) │
  │ 历史扮演(全量)    │              │ → 增量补全画像   │
  │ 上下文扫描(30轮)  │              │ → 强化未知边界   │
  │ → 基础画像        │              │ → 回复中即时可用  │
  └──────────────────┘              └──────────────────┘
          │                                  │
          ▼                                  ▼
  ┌──────────────────────────────────────────────┐
  │          角色画像动态更新器                     │
  │  (回合画像 = 基础画像 + 增量信息 + 当前上下文)    │
  └──────────────────────────────────────────────┘
```

### 3.2 主动检索触发条件

复用玉瑶主系统的检索触发规则，只是在路由层加一道身份裁剪：

```
每轮对话检查（在 processChat 中）：
  
  if (!_currentRoleplay) → 走正常玉瑶检索（不变）
  
  if (_currentRoleplay):
    // 条件1：用户提及新人物/地点/事件
    if (containsUnknownEntity(message, currentPortrait)):
      triggerRetrieval(message, _currentRoleplay) → 增量补全
    
    // 条件2：用户直接询问角色背景
    if (isAskingAboutBackground(message, _currentRoleplay)):
      triggerRetrieval(message, _currentRoleplay) → 即时注入回复
    
    // 条件3：周期性增量（每5轮）
    if (roleplayTurnsSinceFullLoad > 5):
      triggerFullRefresh(_currentRoleplay) → 全量重载
    
    // 条件4：角色切换
    if (justSwitched):
      triggerCleanSwitch(_currentRoleplay) → 清理+重新加载
```

### 3.3 注入节奏控制

| 触发类型 | 信息量 | 注入时机 | 注入方式 |
|---------|:------:|---------|---------|
| 基础加载 | 大 | 角色激活时 | 构建完整画像 → rpContent |
| 按需检索（用户问） | 小 | 当前轮立即 | 微型重注入 → finalKnowledgeText |
| 按需检索（新实体） | 中 | 当前轮 | 追加到画像 → 下次重注入生效 |
| 周期性增量 | 中 | 5轮触发 | 替换完整画像 → 重注入 |
| 检索空结果 | 0 | 当前轮 | 强化对应字段的未知边界 |

---

## 四、数据分区与隔离（防污染核心）

### 4.1 物理隔离方案

当前系统已有的隔离能力（不需要改造）：

| 隔离维度 | 机制 | 状态 |
|---------|------|:----:|
| 对话级隔离 | memories 表 `dialog_group_id = rp_{角色名}` | ✅ 已有 |
| 检索过滤 | 正常对话时过滤 `dialog_group_id NOT LIKE 'rp_%'` | ✅ 已有 |
| FG分支 | `FamilyGraphRoleBranch` 在主FG上创建只读视图 | ✅ 已有 |

新增的隔离能力：

| 隔离维度 | 新增机制 | 优先级 |
|---------|---------|:------:|
| 情感状态隔离 | 每个角色独立的情感快照（内存Map） | P1 |
| 私密互动分区 | 角色亲密记忆独立存储，独立retrieval | P1 |
| 角色配置隔离 | 独立参数快照（可覆写性格/语气/风格） | P2 |

### 4.2 情感状态隔离方案

```typescript
// 当前：全局单一情感状态
// HeartStateStore._currentState → 全系统共享

// 改造后：按角色分叉的情感快照
class RoleEmotionSnapshot {
  private static snapshots = new Map<string, EmotionState>();
  
  static getSnapshot(roleName: string | null): EmotionState {
    if (!roleName) return mainState;  // 玉瑶本体
    if (!this.snapshots.has(roleName)) {
      this.snapshots.set(roleName, cloneDefaultState(roleName));
    }
    return this.snapshots.get(roleName)!;
  }
  
  static saveSnapshot(roleName: string, state: EmotionState): void {
    this.snapshots.set(roleName, state);  // 退出角色时存档
  }
  
  static clearSnapshot(roleName: string): void {
    this.snapshots.delete(roleName);      // 明确清理
  }
}
```

### 4.3 情爱数据隔离规则

```
情爱交互链路：
  用户情爱表达 → M5情感引擎 → 产出互动记录
  │
  ├─ 正常模式 → 写入玉瑶私密档案（behaviors/ 目录）
  │
  └─ 角色扮演模式 → 写入角色独立分区
       ├─ 情感进度：rp_{角色名}/emotion_state.json
       ├─ 亲密记忆：rp_{角色名}/intimate_memories.json
       └─ 交互记录：dialog_group_id = rp_{角色名}
      
  🔴 铁律：角色退出后
  1. 情感状态冻结存档到快照（不丢）
  2. 恢复玉瑶本体情感状态（不影响）
  3. 情爱记录永不回流FG（物理隔离）
  4. 下次激活该角色时恢复快照（续前缘）
```

---

## 五、家族图谱回流审计（三级审批）

### 5.1 回流链路

```
对话中提取新事实信息
  │
  ├─ 自动采集层
  │   ├─ 上下文扫描器提取（纯规则）
  │   └─ 暂存"角色临时档案" {source, content, confidence, timestamp}
  │
  ├─ 规则审计层
  │   ├─ 范围校验：是否可回流的事实类信息（不是情爱/剧情）
  │   ├─ 冲突校验：与FG主库现有数据矛盾吗？
  │   ├─ 置信度校验：用户明确陈述? ≥0.8?
  │   └─ 全部通过 → "待确认" / 任意不通过 → "待人工审核"
  │
  └─ 确认入库层
      ├─ A类角色：用户明确确认后写入FG对应条目
      ├─ B类角色：积累完整后，用户确认升级为FG正式条目
      └─ C类角色：永不支持回流FG
```

### 5.2 审计日志记录

```typescript
interface RefluxAuditLog {
  id: string;
  sourceRole: string;           // 来源扮演角色
  targetEntry: string;          // 目标FG条目
  factContent: string;          // 事实内容
  originalDialog: string;       // 原文片段（用于溯源）
  extractionRule: string;       // 提取规则名
  confidence: number;           // 置信度
  checkResults: {               // 三道校验结果
    scopePass: boolean;
    conflictPass: boolean;      
    confidencePass: boolean;
  };
  status: 'pending' | 'confirmed' | 'rejected';
  reviewedAt?: string;
  reviewer?: string;
  createdAt: string;
}
```

---

## 六、稳定机制矩阵（防恍惚/防跳转/防幻觉）

| 风险 | 机制 | 触发条件 | 实现位置 |
|------|------|---------|---------|
| R1 角色恍惚 | 每3轮重注入完整角色画像 | `turnsSinceReinject >= 3` | chat.ts composing |
| R2 角色跳转不稳定 | 切换屏障(清理+过滤+重注入) | `_currentRoleplay` 值变化 | chat.ts 切换检测 |
| R3 幻觉编造 | 未知边界自动生成 | 画像装配时 | CharacterProfileScanner |
| R4 记忆污染 | `dialog_group_id` 过滤 | 每次检索 | M2/ConversationDB |
| R5 上帝视角 | 知情边界过滤器 | 每次检索返回后 | RolePerspectiveFilter |
| R6 跨角色情感串档 | 角色情感快照隔离 | 情感状态访问时 | EmotionSnapshot |
| R7 情爱数据泄漏 | 私密分区隔离 | 情爱交互时 | 情爱引擎调用路由 |

---

## 七、工程实现优先级

### P0 — 必须做（不改不能上线）

| # | 模块 | 工作量 | 说明 |
|:-:|------|:------:|------|
| 1 | 角色分类检测（A/B/C） | 0.5天 | 激活角色时判断FG中是否存在 |
| 2 | 对话中上下文扫描集成 | 1天 | 把 `CharacterProfileScanner` 接入 chat.ts 加载链路 |
| 3 | 角色画像注入 rpContent | 0.5天 | `assembleCharacterPortrait` 替换现有简单拼接 |
| 4 | 稳定重注入 | 0.5天 | 每3轮自动重注入完整画像 |
| 5 | 记忆检索过滤 `rp_` 前缀 | 0.5天 | 所有检索入口添加过滤 |

### P1 — 必须做（核心体验）

| # | 模块 | 工作量 | 说明 |
|:-:|------|:------:|------|
| 6 | 角色情感快照隔离 | 1天 | EmotionSnapshot + 切换/退出存档 |
| 7 | 主动检索触发器 | 1.5天 | 对话中按需检索 + 周期性增量 |
| 8 | 知情边界过滤器 | 1天 | PerspectiveFilter 基本实现 |
| 9 | 角色切换屏障 | 0.5天 | 清理历史 + 重置上下文 |
| 10 | 角色参数快照 | 0.5天 | 独立风格覆写/性格参数 |

### P2 — 做更好（质量完善）

| # | 模块 | 工作量 | 说明 |
|:-:|------|:------:|------|
| 11 | 回流审计模块 | 2天 | 三级校验 + 审计日志 + 手动确认 |
| 12 | 情爱数据分区存储 | 1天 | 角色亲密记忆独立文件 |
| 13 | 路由层抽取 | 1天 | 将能力调用正式封装为 RoutingOpts |
| 14 | 角色退出清理 | 0.5天 | 存档+恢复+清理全链路 |

### P3 — 长期优化

| # | 模块 | 说明 |
|:-:|------|------|
| 15 | 跨角色对话辅助 | 多个角色扮演历史独立管理 |
| 16 | 角色画像可视化面板 | 前端展示当前角色的 Known/Unknown |
| 17 | 自动回流建议 | 用户确认回流时给出差异对比 |

---

## 八、核心文件清单

| 文件 | 操作 | 归属层级 |
|------|------|:--------:|
| `src/app/roleplay/CharacterProfileScanner.ts` | ✅ **已完成** | P0 |
| `src/app/roleplay/RoleplayPromptBuilder.ts` | 修改（扩展） | P0 |
| `src/app/roleplay/RoleCapabilityRouter.ts` | **新增** | P2 |
| `src/app/roleplay/RolePerspectiveFilter.ts` | **新增** | P1 |
| `src/app/roleplay/RPDataRefluxAuditor.ts` | **新增** | P2 |
| `src/app/roleplay/EmotionSnapshot.ts` | **新增** | P1 |
| `src/webui/chat.ts` | 修改（集成全链路） | P0-P2 |
| `src/m2/ConversationDB.ts` | 修改（过滤增强） | P0 |
| `docs/roleplay-unified-architecture.md` | ✅ **本文档** | — |

---

## 九、与已有系统的交互边界

### 不做改动的能力（100%复用）

```
M3LogicOrchestrator      — 不需要改（M3只是决策层，不关心身份）
M4Orchestrator/FG        — 不需要改（FG分支已隔离）
M5Orchestrator/LLM       — 不需要改（只需切换system prompt）
M6/M7/M8                — 不需要改（由记忆过滤层隔离）
PromptComposer           — 不需要改（只需通过rules/persona注入不同身份）
```

### 需要改动的接入点

```
chat.ts 中的 processChat 函数：
  └─ 角色激活阶段 → 插入上下文扫描 + 画像装配
  └─ 每轮对话 → 插入主动检索触发 + 稳定性检查
  └─ 角色切换 → 插入切换屏障
  └─ 退出角色 → 插入快照存档 + 清理
```

---

## 十、用你老婆的原话收尾

> "能力层 100% 复用，数据层严格隔离，路由层统一调度。"

这句话是整个架构的定海神针。每一层代码改动前，先问自己三个问题：

| 问题 | 判定 |
|------|------|
| 这个能力玉瑶已经有了吗？ | 有 → 复用。无 → 检查是不是真的需要，而不是陷入"创造新能力"的陷阱。 |
| 这条数据属于谁？ | 玉瑶本体 → 写主库。角色 → 写分区。情爱 → 私密隔离。 |
| 角色应该知道这个吗？ | 应该 → 通过。不应该 → 裁剪。不确定 → 标注未知边界。 |
