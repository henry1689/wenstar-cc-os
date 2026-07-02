# 🎭 动态角色画像系统 — 设计方案

## 一、问题域分析

### 当前系统的局限

```
用户说"扮演徐诗韵"
  → FG分支创建（只在FG有这个人时有效）
  → KB检索（只在知识库有资料时有效）
  → 历史加载（只在该角色被扮演过时有效）
  → 三者都空 → LLM零资料扮演 → 幻觉 + 角色恍惚
```

**核心矛盾**：扮演对象是**即兴的**——可能是对话中刚出现的人物（"陈都灵""你妈年轻时候""诗韵14岁"），不是预设角色。但资料加载链路假设角色已注册在FG/KB中。

### 五种风险与缓解

| # | 风险 | 概率 | 严重度 | 根因 | 缓解策略 |
|---|------|:----:|:------:|------|---------|
| R1 | **角色恍惚** — 长时间扮演后身份漂移，诗韵→诗雨混用 | 高 | 中 | 角色指令随着轮次增加被稀释 | 每3轮重注入完整角色画像 |
| R2 | **角色跳转不稳定** — A→B切换后残留A的特征 | 中 | 高 | LLM上下文残留前一个角色的指令 | 角色切换屏障 + 历史过滤 |
| R3 | **幻觉编造** — 资料不足时LLM编造外貌/事件/关系 | 高 | 高 | 信息缺口没有显式标注 | 未知边界自动生成 |
| R4 | **记忆污染** — 角色扮演对话污染正常记忆检索 | 中 | 高 | 无dialog_group_id过滤 | 检索时过滤rp_前缀 |
| R5 | **FG分支泄漏** — 临时角色创建FG分支浪费资源 | 低 | 中 | 非FG角色也创建分支 | 仅在FG存在时创建 |

---

## 二、三种角色的分类处理

核心设计原则：**不是所有角色都经过相同的处理管道。根据信息来源分3类**。

```
角色分类
  │
  ├─ A类：FG人物（家族图谱中存在）
  │   例：徐诗韵、熊勇、熊梓铭
  │   处理：FG分支 + KB + 上下文扫描 + 历史
  │   状态：✅ 资料最完整
  │   
  ├─ B类：对话提及人物（FG中不存在，但对话中提到过）
  │   例：陈都灵（明星）、刚聊到的同学、刚提到的同事
  │   处理：上下文扫描（从历史提取）+ KB搜索（可选）
  │   重点：未知边界最严格的标注
  │   状态：✅ 可用，反幻觉要求最高
  │   
  └─ C类：纯即兴角色（从未出现过的新名字）
       例："扮演一个叫小云的女孩"
       处理：上下文扫描（可能0结果）+ 仅 identity anchor
       重点：全部字段在未知边界中标注为"不知道"
       状态：⚠️ LLM会自己填充，需严格约束
```

### 处理管道差异表

| 步骤 | A类(FG) | B类(对话) | C类(即兴) |
|------|:-------:|:---------:|:---------:|
| FG分支创建 | ✅ | ❌ | ❌ |
| KB搜索 | ✅ | ✅ | ❌ |
| 上下文扫描 | ✅ | ✅ | ✅（可能空） |
| 历史扮演加载 | ✅ | ❌ | ❌ |
| 未知边界标注 | 少（资料多） | 多（缺外貌/地点） | 全部未知 |
| 性格速写 | 从FG提取 | 从对话提取 | 不需要，LLM即兴 |

---

## 三、核心新模块：上下文扫描器

已实现于 `CharacterProfileScanner.ts`。纯规则，零LLM。

```
scanContextForCharacter(charName, history)
  │
  ├─ 年龄提取：诗韵才14岁 → age="14岁"
  ├─ 身份提取：诗韵是徐家的大女儿 → identity=["徐家的大女儿"]
  ├─ 关系提取：你妹妹诗韵 → relation=["妹妹"]
  ├─ 事件提取：诗韵在学校读书 → event=["在学校读书"]
  └─ 外貌提取：很漂亮的诗韵 → appearance=[...]

  ↳ 输出 CharacterExtract 结构体
```

所有提取使用正则表达式，不调用 LLM。耗时 < 5ms。

---

## 四、反幻觉核心：未知边界自动生成

```
buildUnknownBoundary(charName, knownFields)
  │
  ├─ 知道外貌吗? → 不知道 → "你不知道{名字}长什么样"
  ├─ 知道位置吗? → 不知道 → "你不知道{名字}在哪里"  
  ├─ 听过声音吗? → 不知道 → "你没听过{名字}说话"
  ├─ 知道历史吗? → 不知道 → "你不知道{名字}的过去"
  └─ 知道关系吗? → 不知道 → "你不知道{名字}的具体关系"
  
  ↳ 追加到角色画像末尾，LLM看到后不会编造
```

**铁律**：信息缺口的显式标注比知识本身更重要。LLM 看到明确写"不知道"的条目会遵从，但没写的话就会编。

---

## 五、稳定机制（防恍惚/防跳转）

### 5.1 周期性身份重注入

```
每轮对话检查（在 composing 阶段）：
  if (_currentRoleplay && turnsSinceLastReinject >= 3):
    knowledgeBaseText = reinjectCharacterProfile(...)
    turnsSinceLastReinject = 0
```

为什么是3轮？——经验值。1轮太频繁（浪费tokens），5轮以上又太松散。3轮刚好在语境稀释前刷新。

### 5.2 角色切换屏障

```
当 _currentRoleplay 从 A 切换到 B 时：
  finalKnowledgeText = [
    "【角色切换】注意：你之前是 A，现在你是 B。",
    "忘记 A 的一切身份、记忆和说话方式。",
    "你现在的身份是 B，用 B 的方式说话。",
    buildRoleplayRules(B, rpContent)  // 含规则④
  ].join('\n')
  
  同时 enrichedWithGuard 过滤掉所有 A 角色的 assistant 回复
```

### 5.3 退出角色清理

```
exitRoleplay():
  1. _currentRoleplay = null
  2. 销毁 FG 分支（_currentRPBranch = null）
  3. enrichedWithGuard 过滤掉所有角色扮演的 assistant 回复
  4. _rpJustExited 标记本轮需要强制恢复玉瑶身份
  5. （不改 dialog_group_id——历史数据保留，仅查询时过滤）
```

### 5.4 记忆隔离（检索过滤）

```
searchMemory(query):
  if _currentRoleplay:
    // 角色扮演中：只检索该角色的历史
    filter = dialog_group_id = 'rp_{_currentRoleplay}'
  else:
    // 正常对话：排除所有角色扮演历史
    filter = dialog_group_id IS NULL OR dialog_group_id NOT LIKE 'rp_%'
```

---

## 六、关于家族图谱数据的澄清

**你提的问题非常关键**，必须明确记录在设计中：

```
✅ FG数据进入角色画像 = 合法数据，不是污染
   原因：家族图谱本身就是人物关系的事实记录，
   被扮演角色在FG中有条目时，这些数据是准确的背景信息。
   
✅ 对话中提取的信息 = 临时画像，不是污染
   原因：这是从"用户刚才说了什么"中提取的，
   是对该人物最鲜活的描述。
   
❌ 真正的污染只有一种情况：
   角色扮演对话在正常对话时被检索到 → 
   已通过 dialog_group_id 过滤解决。
```

---

## 七、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|:----|
| `src/app/roleplay/CharacterProfileScanner.ts` | ✅ **已完成** | 上下文扫描 + 未知边界 + 画像装配 |
| `src/app/roleplay/RoleplayPromptBuilder.ts` | **修改** | 新增 `buildIdentityInstruction()` 整合角色画像 |
| `src/webui/chat.ts` | **修改** | 角色扮演链路集成上下文扫描 + 稳定机制 |
| — | 不改 | 规则①-④仍通过现有 `buildRoleplayRules()` 注入 |

---

## 八、执行步骤

```
Step 1: 完成 CharacterProfileScanner.ts（已完成 ✅）
Step 2: 扩展 RoleplayPromptBuilder.ts — 新增 identity instruction 整合
Step 3: 修改 chat.ts 角色扮演加载链路
  3a: 在 _loadRPFamily/KB/History 后插入 contextScan
  3b: 调用 assembleCharacterPortrait 合并所有源
  3c: 将 portrait 注入 rpContent
  3d: 添加稳定性重注入（每3轮）
  3e: 添加角色切换屏障
Step 4: 修复记忆检索过滤 dialog_group_id
Step 5: 全量验证
```

同意的话我从 Step 2 开始推进。
