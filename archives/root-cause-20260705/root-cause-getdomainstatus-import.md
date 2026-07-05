---
name: root-cause-getdomainstatus-import
description: 🔴 结构化管线禁用根因——getDomainStatus未导入导致4处守卫静默抛ReferenceError
metadata: 
  node_type: memory
  type: reference
  originSessionId: 249aa283-e818-4e75-b08d-9e6d27a2c47b
---

# 结构化管线禁用根因分析 (2026-07-05)

## 一句话根因

`chat.ts` 从未 import `getDomainStatus`，却调用了它4次，所有调用在运行时抛 `ReferenceError` 被外层 catch 吞掉。结构化管线自代码诞生之日起从未真正进入执行路径。

## 全链条分析

```
write code: import { runRoleplayPipeline, ... } from './RoleplayDomain.js'
              ↓ 漏掉 getDomainStatus
4 call sites: if (!getDomainStatus().structured) { ... }
              ↓ 运行时 ReferenceError
outer catch: } catch (err) { ... FALLBACK_REPLIES ... }
              ↓ 错误被吞
pipeline:    从不执行
              ↓
result:       旧路径(assembleCharacterPortrait)永远作为兜底运行
```

### 涉及文件

| 文件 | 角色 |
|------|------|
| `src/webui/chat.ts` L134 | import 语句漏了 `getDomainStatus` |
| `src/webui/chat.ts` L1353 | rpMatch路径——第一轮角色扮演守卫 |
| `src/webui/chat.ts` L1627 | 知识注入守卫——buildRoleplayRules注入 |
| `src/webui/chat.ts` L1639 | 知识注入守卫——同上 |
| `src/webui/chat.ts` L1795 | 知识注入守卫——同上 |
| `src/app/roleplay/RoleplayDomain.ts` | `getDomainStatus` 的宿主模块 |

### 为什么这么久没发现

1. **错误被吞**: `processChat` 外层 try/catch (L2481) 捕获后返回 FALLBACK_REPLIES，不崩不报
2. **误导性日志**: 模块级 `const STRUCTURED_ENABLED = process.env[...]` 因 ESM hoisting 在 .env 加载前执行，console 输出 "已关闭"
3. **补丁聚焦症状**: 每次围绕 "env var 没设" / "storage 为空" / "L2提前截断" 打补丁，没人检查 `getDomainStatus` 的调用链是否连通
4. **多路径迷惑**: `runRoleplayPipeline` 本身被 import 且能调用，让人误以为整个模块都可用

### 防复发铁律

**铁律：每次 import 必须逐一核对调用者是否使用了被导入模块的所有导出。**

```typescript
// ❌ 漏掉导出
import { runRoleplayPipeline, clearCache, afterGenerate } from './RoleplayDomain.js';
// 以下调用会运行时崩溃
getDomainStatus()  // ReferenceError

// ✅ 逐一核对
import { runRoleplayPipeline, clearCache, afterGenerate, getDomainStatus } from './RoleplayDomain.js';
```

## 相关修复

### ESM 模块级 process.env 访问

**问题**: 模块级 `const X = process.env['KEY']` 因 ESM import hoisting 在 `.env` 加载前执行，永远是 undefined。

**修复**: 改为运行时函数：
```typescript
// ❌ 模块级常量（ESM unsafe）
const STRUCTURED_ENABLED = process.env['ROLEPLAY_STRUCTURED_ENABLED'] === 'true';

// ✅ 运行时函数
function isStructuredEnabled(): boolean {
  return process.env['ROLEPLAY_STRUCTURED_ENABLED'] === 'true';
}
```

**涉及文件**:
- `src/app/roleplay/RoleplayDomain.ts` L20-L21
- `src/app/roleplay-legacy/RoleplayDomain.ts` L22-L23

### 其他连锁修复

| 修复项 | 文件 | 为什么重要 |
|--------|------|-----------|
| `_domainCtx` 补上 `storage` | `src/webui/chat.ts` L1362, L1413, L1837 | 无 storage 串行检索跳过全部数据库查询 |
| `.env` 加 ROLEPLAY_STRUCTURED_ENABLED=true | `.env` L15 | 环境变量根本不存在 |
| 移除 L2 关键词提前截断 | `src/m4/MemoryRetriever.ts` L312-313 | L2 含"妈妈"但无实际关系数据时拓扑永不运行 |
