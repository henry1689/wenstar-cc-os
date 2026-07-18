# 太虚境户籍制落地蓝皮书 V2.0

> 法律依据：《太虚境户籍管理法 V1.1》（38条）  
> 本文定位：第四效力层级——法律→本文→技术规范→代码  
> 版本：V2.0  
> 创建日期：2026-07-17  
> 状态：Phase 1-4 已完成，Phase 5-7 规划中

---

## 一、法律条款 → 技术实现映射

### 1.1 已实现（Phase 1-4 成果）

| 法律条款 | 法律要求 | 技术实现 | 状态 |
|:--|------|------|:--:|
| §5-§6 | TXS-ID 编码格式 | `nodes.uuid`，`_generateUUID()`，UNIQUE INDEX | ✅ |
| §6.3 | 分类前缀 A-X, S | `nodes.category`，`_inferCategory()` 多源推断 | ✅ |
| §15-§16 | Dossier 七分区 | `PersonDossier` 10 模块，含 basicInfo/imageTraits/relationMap/familyNetwork/health/lifeMilestones/socialCapital | ✅ |
| §18 | PendingItem 置信入库 | `PAE.computeConfidence()`，`promotePendingItems()` | ✅ |
| §20-§22 | Edges 法定定位 | edges 表，家族边+社交边，反向边自动补全 | ✅ |
| §23 | 三级密级 | `nodes.security_level` 1/2/3 | ✅ |
| §24 | 动态门阀 | `UUIDGatekeeper`，白名单三通道过滤 | ✅ |
| §27-§28 | 实体生命周期 | `nodes.status` 待实现（见 Phase 5） | ⚠️ |
| §32-§33 | 完整性守护 | `fgIntegrityGuard` 6/6 + `acquisitionIntegrityGuard` 6/6 | ✅ |
| §35 | 效力层级 | 法律→redlines→蓝皮书→PAE→代码 | ✅ |

### 1.2 待实现（Phase 5-7）

| 法律条款 | 法律要求 | 需新增的代码 | 优先级 |
|:--|------|------|:--:|
| §4 | 分户治理：家庭户/社群户 | `family_gene` + `social_group_genes` 列 | 🔴 |
| §7 | 社团动态拓展 | `social_group_genes` BFS 自动聚合 | 🔴 |
| §8 | TXS-ID 历史编号溯源 | `nodes.legacy_ids` 列 | 🔴 |
| §13 | entity_source 六类来源 | `nodes.entity_source` 列 | 🔴 |
| §27-§28 | 四档实体状态自动转换 | `nodes.status` 列 + `StatusAutoManager` | 🟡 |
| §17 | 系统只读档案原则 | PFC/ConstraintValidator 强制读 dossier | 🟡 |
| §19 | 档案人工异议机制 | `ConflictDetector` 升级为人工复核 | 🟢 |
| §24-§25 | 授权凭证 + 用户数据主权 | `AuthorizationCredential` 类 | 🟢 |
| §14 | 交互协议档案 | `dossier.interactionProtocol` 子对象 | 🟡 |
| §26 | 调取审计日志 | `audit_log` 表 | 🟢 |

---

## 二、nodes 表全字段定义（目标态）

```
nodes 表（身份证卡面 + 法定不变属性）:
┌──────────────────┬──────────┬─────────────────────────────────┐
│ 列名              │ 类型     │ 说明                            │
├──────────────────┼──────────┼─────────────────────────────────┤
│ id               │ TEXT PK  │ SQLite 内部主键                  │
│ type             │ TEXT     │ 'person'/'object'/'place' 等    │
│ name             │ TEXT     │ 官方本名 (official_name)         │
│ aliases          │ TEXT     │ JSON 别名数组 (alias_list)       │
│ uuid             │ TEXT UQ  │ TXS-ID 法定身份证号               │
│ category         │ CHAR(1)  │ A/B/C/D/E/F/G/H/X/S              │
│ entity_source    │ TEXT     │ real/ai/roleplay/fictional/       │
│                  │          │ historical/placeholder            │
│ status           │ TEXT     │ active/dormant/archived/deceased  │
│ security_level   │ INTEGER  │ 1公开/2内部/3私密                │
│ family_gene      │ TEXT     │ 家族血脉码 "FA01"                │
│ social_group_genes│ TEXT    │ 社团码 "CO01|SC01" (|分隔)       │
│ legacy_ids       │ TEXT     │ JSON 历史 TXS-ID 数组            │
│ circle_level     │ INTEGER  │ 圈层等级 (deprecated, 调试期=0)   │
│ tags             │ TEXT     │ JSON 标签数组                     │
│ properties       │ TEXT     │ JSON 完整人事档案 (PersonDossier) │
│ created_at       │ TEXT     │ ISO 创建时间                     │
│ updated_at       │ TEXT     │ ISO 更新时间                     │
└──────────────────┴──────────┴─────────────────────────────────┘
```

---

## 三、Phase 5 — 列级补齐（entity_source / status / legacy_ids / family_gene / social_group_genes）

### 3.1 新增列

ALTER TABLE 幂等迁移，所有列有合理默认值：

| 列 | 默认值 | 说明 |
|------|--------|------|
| `entity_source` | `'placeholder'` | 登记时必须指定，存量迁移时根据已有数据推断 |
| `status` | `'active'` | 存量全部 active |
| `legacy_ids` | `'[]'` | 空数组，X 类升级时追加旧 ID |
| `family_gene` | `NULL` | 由 `_rebuildGroupGenes()` BFS 填充 |
| `social_group_genes` | `'WW'` | 🔴 法第三条第2款——不可为空，自由人默认标记 |

### 3.2 存量迁移规则 (migrateToV4)

```
entity_source 推断:
  有 relation_to_user + 有 family edge → 'real'
  无 relation_to_user + name 含角色名模式 → 'fictional'
  name = '玉瑶' → 'ai'
  name 含 '妈妈/爸爸/老公/姐姐/妹妹' 等亲属单字 → 'real'
  name 为占位泛称('同事/客户/老板/朋友') → 'placeholder'
  默认 → 'real'

status:
  全部 → 'active'

legacy_ids:
  全部 → '[]'

family_gene:
  edges BFS(母/父/子/配偶/兄弟) → 连通分量 → FA01/FA02/...

social_group_genes:
  edges BFS(同事/同学/商业边) → 连通分量 → CO01/SC01/...
  无任何社团 → 'WW'
```

### 3.3 新增 `_rebuildGroupGenes()` 方法

双轮 BFS 全量重建，幂等：

```
Round 1: FA 家族码
  边: mother_of/father_of/child_of/sibling_of/spouse_of
  继承: child 继承 parent 的 FA
  婚入: spouse_of → 继承配偶的 FA

Round 2: 社会社团码
  边: colleague_of/boss_of/subordinate_of → CO
  边: classmate_of → SC  
  边: client_of/partner_of/operated_by → BU
  无边 → 保持 WW
```

### 3.4 `fgIntegrityGuard` 扩展至第 11 项

| # | 检查项 | 不通过后果 |
|:--|------|------|
| ⑦ | 全部节点有 entity_source | 降级运行 |
| ⑧ | 全部节点有合法 status | 降级运行 |
| ⑨ | family_gene 与 edges 一致性 | edges BFS 重写 |
| ⑩ | social_group_genes 非空（含 WW） | 补全 WW |
| ⑪ | node 有 family_edge → category = A | 自动修正 |

### 3.5 改动文件

| 文件 | 改动 |
|------|------|
| `FamilyGraph.ts` | `_setupTables()`: CREATE TABLE 加 5 列；`migrateToV4()`: 存量迁移；`_rebuildGroupGenes()`: 双轮 BFS；`fgIntegrityGuard`: 5 项扩展 |
| `types/graph.ts` | `FamilyGraph` 接口新增 `_rebuildGroupGenes` |

---

## 四、Phase 6 — 功能层补齐

### 4.1 StatusAutoManager（`src/m4/StatusAutoManager.ts`）

职责：根据 last_mentioned 时间自动降级实体状态。

```
规则:
  active → dormant:  last_mentioned < 90天前
  dormant → archived: last_mentioned < 365天前
  dormant → active:   被提及或对话时
  archived → active:  仅手动操作
  deceased:           不可逆，不可自动变更

触发:
  每次 fgIntegrityGuard 启动时检查
  每次 getPersonProfile 时顺带检查该实体
```

### 4.2 交互协议档案（Dossier 扩展）

在 `dossier.relationMap` 下新增子对象：

```typescript
interactionProtocol: {
  addressForm: string;       // "叫名字"/"叫姐"/"叫阿姨"/"叫老板"
  interactionTone: string;   // "formal"/"casual"/"intimate"/"deferential"
  topicBounds: string[];     // ["工作","家庭","不谈政治"]
  roleplayPermission: 'allow' | 'deny' | 'ask';
  exposeLevel: 1 | 2 | 3;   // 向 LLM 暴露信息的等级
}
```

### 4.3 系统只读档案硬约束

在 `ConstraintValidator.ts` 中强化——人物身份、性格、关系判定**只读 dossier 结构化字段**，不从对话碎片推导：

```typescript
// 现有: 用 familyContext（来自 FG）→ ✅ 正确
// 新增: 人格一致性校验——LLM 回复中的人物描述 vs dossier 档案
// 冲突时 → 以 dossier 为准 → 存入 conflicts[]
```

### 4.4 授权凭证（`src/m4/AuthorizationCredential.ts`）

```typescript
class AuthorizationCredential {
  credentialId: string;
  targetUUID: string;       // 允许查阅的 TXS-ID
  allowedPartitions: string[]; // 可访问的档案分区
  issuedAt: string;
  expiresAt: string;        // 会话结束自动作废
}
```

---

## 五、Phase 7 — 治理层补齐

### 5.1 档案人工异议流程

在 `ConflictDetector` 中新增人工复核通道：

```
检测到冲突 → 生成冲突工单 → 推送用户 → 等待人工确认
  → 确认: 更正档案 + 标注"人工异议修正"
  → 拒绝: 保留原档案 + 关闭工单
  → 超时: 自动关闭，保留原档案
```

### 5.2 调取审计日志

新建 `audit_log` 表：

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,      -- 'access'|'modify'|'merge'|'authorize'
  operator_uuid TEXT,            -- 操作者 TXS-ID
  target_uuid TEXT,              -- 被操作实体 TXS-ID
  partition TEXT,                -- 被访问的档案分区
  credential_id TEXT,            -- 授权凭证编号
  detail TEXT,
  created_at TEXT NOT NULL
);
```

---

## 六、实施顺序

```
Phase 5 (列级补齐)          ← 🔴 立即做，4天
  ├── ALTER TABLE 5列
  ├── migrateToV4()
  ├── _rebuildGroupGenes()
  └── fgIntegrityGuard 5→11项

Phase 6 (功能层)            ← 🟡 5-7天后
  ├── StatusAutoManager
  ├── 交互协议档案
  ├── 系统只读档案
  └── AuthorizationCredential

Phase 7 (治理层)            ← 🟢 10天后
  ├── 人工异议流程
  └── 调取审计日志
```

---

## 七、不改的部分

- ❌ UUID 编号体系
- ❌ edges 表结构
- ❌ PAE 核心引擎
- ❌ UUIDGatekeeper
- ❌ RelationHeatTracker
- ❌ M1/M3/M5 核心模块
- ❌ chat.ts / server.ts 主流程
