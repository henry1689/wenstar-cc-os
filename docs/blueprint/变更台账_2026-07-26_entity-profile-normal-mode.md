# WenStarOS 变更台账 — 正常模式下 FG 实体档案注入

> **流程**: S1→S2→S3→S4→S5→S6→S7 | **日期**: 2026-07-26 | **风险**: 🟢 低
> **Bug 分类**: 架构边界破坏

## 根因

正常模式下问"徐诗韵是谁"→ LLM 回复"我不记得"。

**5 Why**:
1. LLM 收到的 `finalKnowledgeText` 中无徐诗韵的身份/关系信息
2. `_entityContextText` 在正常模式下为空（`chat.ts:1208`）
3. EntityContextBuilder 被 `if (ctx._entityMeeting?.isActive())` 包裹（`chat.ts:676`）
4. 架构设计时把 FG 档案当成"会晤专属上下文"
5. 从未设计过"提到某人时自动注入其 FG 档案"的机制

## 修复方案

KnowledgeTextAssembler 新增 `withEntityProfiles()` 方法（#17 注入段），从 `FamilyGraph.getPersonProfile` 提取基本信息构建"关于XX"的参考文本。正常模式下 `chat.ts` 在第 1208 行之后调用此方法，仅当非会晤模式且 entity_genes 含 person 实体时生效。

格式 ≠ identity（不含"你就是XX本人"），仅作 LLM 参考信息。会晤模式行为不变。

## 修改文件

| 文件 | 改动 | 行数 |
|:---|:---|:--:|
| `src/webui/chat/KnowledgeTextAssembler.ts` | 新增 `withEntityProfiles()` 方法 | +25 |
| `src/webui/chat.ts` | 行 1208-1224 新增实体档案注入块 | +16 |

## S4 评审结果

| CK | 结果 |
|:---|:--:|
| CK-01 管线依赖 | ✅ pass |
| CK-02 PFC 薄调度 | ⚠️ 预存（chat.ts 2263>2000，本次 +16行） |
| CK-03 FG 户籍 | ✅ pass |
| CK-04 UUID | ✅ pass |
| CK-05 meetingEntityName | ⚠️ 预存（行号已演进，本次不改会晤逻辑） |
| CK-06 save() | ✅ pass |
| CK-07 依赖扫描 | ⚠️ 预存（46 imports，本次无新增） |

## S5 测试

- 编译: 零错误
- 测试: 809/820 通过（6 预存失败 = EntityMeeting.detectSwitchIntent，无关本次改动）

## FG 11 条红线：零触碰

本次只读主 FG (`getPersonProfile`)，不写、不涉及角色分支、不改会晤逻辑。

## 回滚

```bash
git checkout -- src/webui/chat/KnowledgeTextAssembler.ts src/webui/chat.ts
```
