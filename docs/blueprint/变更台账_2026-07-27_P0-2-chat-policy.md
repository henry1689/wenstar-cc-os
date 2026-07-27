# WenStarOS 变更台账 — P0-2 ChatMode + ChatPolicy 状态机

> **流程**: S1→S2→S3→S4→S5→S7 | **日期**: 2026-07-27 | **风险**: 🟢 低（新增模块，不改变已有逻辑）

## S1 审计

chat.ts 中 `_meetingEntityName` 在 12 个位置手动判断，无统一策略层。

## S3 实施

| # | 改动 | 文件 | 风险 |
|:--:|:---|:---|:--:|
| 1 | 新建 `ChatMode` 类型 + `ChatPolicy` 类 + 工厂函数 | `src/app/chat/ChatPolicy.ts` 新建 135行 | 🟢 |
| 2 | chat.ts 中 PromptAssembler 区域构建 ChatPolicy + 使用 policy.canUseUnknownGuard()/canUseRoleHint() | `chat.ts` +5行 | 🟢 |

### ChatMode 类型

```typescript
type ChatMode =
  | { kind: 'normal' }
  | { kind: 'entity_meeting'; entityUuid: string; entityName: string }
  | { kind: 'roleplay'; branchId: string; roleId: string; roleName: string; allowMainFgRead: false }
  | { kind: 'secretary' }
  | { kind: 'task'; taskType: string };
```

### ChatPolicy 权限矩阵

| 方法 | normal | entity_meeting | roleplay | secretary |
|:---|:---:|:---:|:---:|:---:|
| canInjectM6() | ✅ | ❌ | ❌ | ✅ |
| canUseMainFG() | ✅ | ✅ | ❌ | ✅ |
| canPersistToMainFG() | ✅ | ✅ | ❌ | ✅ |
| canUseRoleHint() | ✅ | ❌ | ❌ | ✅ |
| canUseUnknownGuard() | ✅ | ❌ | ✅ | ✅ |
| canRetrieveMemories() | ✅ | ❌ | ✅ | ✅ |
| canUsePFCKnowledgeRefine() | ✅ | ❌ | ❌ | ✅ |
| canUseKnowledgeBase() | ✅ | ✅ | ❌ | ✅ |

## S4 编译: 零错误 | S5 测试: 842/854 (0新增) | FG 红线: ❌

## 迁移路径

当前阶段：ChatPolicy 仅用于 PromptAssembler 中的 2 个判断点（unknownGuard / roleHint）。后续逐步将 chat.ts 中其余 10 个判断点迁移。每迁移一处即删除一处裸 if (!_meetingEntityName)。
