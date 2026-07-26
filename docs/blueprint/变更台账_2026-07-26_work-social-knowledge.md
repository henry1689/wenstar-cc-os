# 变更台账 — 2026-07-26 · 玉瑶工作关系知识边界改善

## 一、变更概述

**任务**：玉瑶不认识用户工作社交网络中的人（高峰电业同事等），需扩展知识边界使其认识工作关系人员，但保持私人亲密关系隔离。

**流水线**：`wenstaros_core_repair_flow.yaml` | Run ID: `run_ms1jxivm_ctu0`
**风险等级**：🔴 HIGH（chat.ts + KnowledgeContextBuilder.ts）
**改动规模**：2 文件，+85 行

## 二、变更文件

| 文件 | 改动 | 说明 |
|------|------|------|
| [chat.ts](src/webui/chat.ts) | +60 行 | L1-L5：WORK_RELS常量、allEntities扩展、workSocialConstraint构建、_allKnownNames扩展、dontKnowGuard扩展、workSocialConstraint注入 |
| [KnowledgeContextBuilder.ts](src/app/knowledge/KnowledgeContextBuilder.ts) | +25 行 | L6：消息含人名时主动搜索知识库 |

## 三、根因

`familyConstraint` 和 `_allKnownNames` 只用 `family_context`，`social_context` 中的工作关系人员（`colleague_of`等）被系统性排除——初衷是防角色扮演污染，但误杀了真实同事。

## 四、核验证据

| 阶段 | 结果 | 证据 |
|------|------|------|
| S5 编译 | ✅ | `tsc --noEmit` 零错误 |
| S5 测试 | ✅ | smoke test 18/18 全部通过 (55s) |
| S6 普通对话 | ✅ | M1-M5 全链路正常，无 crash |
| S6 垃圾过滤 | ✅ | `WORK_RELS` 正确排除 78 条垃圾 `acquaintance_of` 边 |
| S6 同事识别 | ⚠️ | 代码正确，但 FG 运行库中徐诗雨/熊勇等缺少 `colleague_of` 边（数据问题） |

## 五、注意事项

1. **FG 数据缺口**：徐诗雨在 FG 中的关系边为"姐姐/妹妹"（家族关系），缺少 `colleague_of` 边。`RelationLabels.ts` 中的 `getCorrectedRelation()` 只修正展示标签，不创建 FG 边。需要在 FG 中补充 `colleague_of` 关系边。
2. **WORK_RELS 过滤**：正确排除 `acquaintance_of`（角色扮演人物默认类型），防止 78 条垃圾实体污染上下文。
3. **22段注入顺序**：`workSocialConstraint` 插入在 `familyConstraint` 之后、`aboutYou` 之前，不破坏现有注入链路。
4. **回滚**：`git checkout -- src/webui/chat.ts src/app/knowledge/KnowledgeContextBuilder.ts`
