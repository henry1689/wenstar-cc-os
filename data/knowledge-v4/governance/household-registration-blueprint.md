# 太虚境户籍制落地蓝皮书 V3.0

> 法律依据：《太虚境户籍管理法 V2.0》（41条）
> 本文定位：第四效力层级——法律→红线→本文→PAE→代码
> 版本：V3.0（V5迁移配套版）
> 日期：2026-07-18

---

## 一、户籍登记表 + 人生卷宗 双分架构

### 1.1 户籍登记表（结构化固定表格）

存储位置：`nodes` 行级列 + `dossier.basicInfo` + `dossier.relationMap` 当前快照。

| 字段 | 存储位置 | 允许空 | 说明 |
|------|---------|:--:|------|
| TXS-ID | nodes.uuid | ❌ | 终身不变，9位流水号 |
| 法定姓名 | nodes.name | ✅ | 只存本名，不存关系称谓 |
| 别名列表 | nodes.aliases | ✅ | JSON数组，含昵称、曾用名 |
| 实体本源类型 | nodes.entity_source | ❌ | real/ai/fictional/historical/placeholder |
| 性别 | dossier.basicInfo.gender | ✅ | 待采集 |
| 出生年份 | dossier.basicInfo.birthYear | ✅ | 待采集 |
| 出生地 | dossier.basicInfo.birthPlace | ✅ | 待采集 |
| 所属家庭户 | nodes.family_gene | ✅ | FA01，edges BFS 分配 |
| 所属社团 | nodes.social_group_genes | ✅ | CO01/SC01/WW，edges BFS 分配 |
| 与用户关系 | dossier.relationMap.relationToUser | ✅ | 母亲/同事/朋友... |
| 实体状态 | nodes.status | ❌ | active/dormant/archived/deceased |
| 安全密级 | nodes.security_level | ❌ | 1公开/2内部/3私密 |
| 立户时间 | nodes.created_at | ❌ | ISO时间戳 |
| 兜底字段 | dossier.misc | ✅ | 自由格式JSON |

🔴 空白属于合法在册状态。未采集到的信息留空，不编造，不推测。公安不会凭空填写猜测内容。

### 1.2 人生卷宗（无限增量时序记录）

存储位置：`dossier.imageTraits` + `dossier.personalityPrefs` + `dossier.lifeMilestones` + `conversations` 表 + `_changeHistory` + `dossier.boundDocuments`

| 板块 | 存储 | 规则 |
|------|------|------|
| 固有完整人设档案 | dossier.imageTraits / personalityPrefs / health | PAE高置信入库，碎片闲聊只进PendingItem |
| 时序人生履历 | dossier.lifeMilestones / lifeResume | 时间排序，每条绑定佐证索引 |
| 全时序对话归档 | conversations 表 | 按 belong_entity_uuid 归拢，只增不删 |
| 全生命周期变更流水 | _changeHistory + 归档分表 | 永久留存，无上限 |
| 附属典籍卷宗 | dossier.boundDocuments | 双向绑定 TXJ 典籍 |

🔴 卷宗只增不删铁律：任何历史记录禁止删除、覆盖、篡改。所有修改以新增记录形式追加。`_changeHistory` 无存储上限。

---

## 二、UUID 编码规范（V2.0）

### 格式：`TXS-{9位自增流水号}`

分类信息完全移入 `nodes.category` 可变列。分类变了 → 改 category 列 → TXS-ID 不动。

| 分类 | 含义 | 判定来源 |
|:--|------|------|
| A | 亲属 | edges(家族边←→'我') |
| B | 职场 | edges(同事边←→'我') 或 relation 标签 |
| C | 泛社交朋友 | edges 或 relation 标签 |
| D | 校园基础 | edges 或 relation 标签 |
| E | 商业合作 | edges 或 relation 标签 |
| F | 竞争/对立 | edges 或 relation 标签 |
| G | 未分类/陌生人 | 默认 |
| H | 超自然/虚构/历史 | 手动标注 |
| X | 亲密伴侣 | relation 标签 或 热力≥0.8升级 |
| S | 系统实体 | 固定 |

### 旧号兼容

旧版带前缀 UUID（如 `A-00003`）全部存入 `nodes.legacy_ids` 数组。`getEntityByUUID()` 先匹配当前 TXS-ID，未命中则遍历 legacy_ids 重定向。

---

## 三、name 列标准化

### 规则

| 规则 | 说明 |
|------|------|
| name 只存法定本名 | "王全芬""熊勇""徐诗雨" |
| 本名未知时允许留空 | 不填入关系称谓 |
| 关系称谓在 edges 中 | "妈妈" = mother_of 边，"老公" = spouse_of 边 |
| 曾用名/昵称/称谓别名存 aliases | ["芬姐","妈妈","阿姨"] |
| alias 数组自动去重 | 同一实体多称谓合并 |

### fgIntegrityGuard 校验

name 列出现关系称谓（单字亲属词：妈/爸/姐/妹/哥/弟/儿/女/夫/妻等）→ 提示修正。

---

## 四、entity_source 五类

| 来源 | 标识 | 治理规则 |
|------|:--|------|
| real | 现实真实人物 | AI不编造，模糊猜测归PendingItem |
| ai | 原生AI人格 | 基线人设锁定，对话不覆盖 |
| fictional | 虚构/影视/超自然 | 基础设定可导入，交互经历归档 |
| historical | 真实历史人物 | 正史锁定，仅归档交互内容 |
| placeholder | 占位泛称 | 匹配实名后合并，≥3次会晤自动升级 |

### 占位实体自动升级

placeholder 被独立会晤 ≥ 3 次或用户补充真名 → 自动触发合并流程 → entity_source 更新。

---

## 五、废除角色扮演 → 实体会晤

### 核心转变

旧：玉瑶扮演所有人。新：每个人用自己的身份直接对话。

| 旧模式 | 新模式 |
|--------|--------|
| 检测扮演意图 | 检测会晤目标实体 |
| 创建RP分支覆盖FG | 加载目标实体dossier |
| 注入扮演规则 | 门阀设定目标TXS-ID |
| 玉瑶扮别人 | 目标实体本人回复 |
| 退出角色恢复 | 切换会晤对象 |

### 代码层面

V5: 删除 entity_source 中的 roleplay 枚举。
下一轮: 彻底删除 ChatEntry 扮演检测、FamilyGraphRoleBranch、setFamilyGraphOverride、rpJustExited、角色扮演 guard message、roleplay personas。

---

## 六、实施路线图

```
Phase 1-4   ✅ 已完成  UUID底座 + PAE + 门阀 + 卷宗 + 热力
Phase 5     ✅ 已完成  5列补齐 + gene码 + 10项守护
Phase V5    🔴 当前    UUID去前缀 + name清洗 + 卷宗永久 + dossier扩展
Phase 6     待实施    交互协议档案 + 系统只读档案 + 授权凭证
Phase 7     待实施    档案异议 + 审计日志
Phase 8     待实施    roleplay代码彻底删除 + 实体会晤框架
```

---

## 七、不改的部分

- edges 表结构
- PAE / UUIDGatekeeper / RelationHeatTracker
- M1/M3/M4/M5 核心模块
- conversation 表结构（仅追加 belong_entity_uuid 列）
