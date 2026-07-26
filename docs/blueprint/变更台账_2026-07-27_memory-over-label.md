# WenStarOS 变更台账 — 记忆优先于标签 & 正常模式 warmth 同步

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低

## 根因

两个系统性问题：
1. **分类僵化**：关系标签来自静态映射，无"从无到有"的动态机制
2. **记忆被标签压制**：LLM 同时收到 "你是密友/女儿" 和亲密记忆内容，冲突时选择相信档案标签而非记忆

## 修复

| # | 层次 | 改动 |
|:--:|:---|:---|
| F1 | 正常模式 KnowledgeTextAssembler | +warmth 读取（与会晤模式一致） |
| F2 | 会晤模式 EntityContextBuilder | 新增规则："记忆优先于标签" |
| F3 | 全局  | 新增铁律："记忆即事实——不能否认" |

## 修改

| 文件 | 行数 |
|:---|:--:|
| `src/webui/chat/KnowledgeTextAssembler.ts` | +18 |
| `src/m4/household/EntityContextBuilder.ts` | +2 条规则 |

## S4: 7/7 ✅ | S5: 809/815 | FG 红线: ❌ 零触碰
