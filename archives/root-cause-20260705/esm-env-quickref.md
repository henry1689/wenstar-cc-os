# ⚡ ESM 环境变量读取快速参考

## 铁律

```
模块级 process.env 访问 → 一律禁止
运行时函数/ConfigService → 唯一安全方式
```

## 为什么

ESM 静态 import 会被 hoist 到模块顶部执行。模块级 `process.env` 读取在 `.env` 加载**之前**运行，值永远是 `undefined`。

```
server.ts 执行顺序:
  1. import { X } from './chat.js'          ← chat.ts 模块级代码先执行
  2.   → import { Y } from './RoleplayDomain.js'
  3.     → const X = process.env['KEY']      ← undefined！.env 还没加载
  4. readFileSync('.env') → process.env['KEY'] = 'true'  ← 晚了
```

## 修复模式

### ❌ 禁止
```typescript
// RoleplayDomain.ts 模块级
const STRUCTURED_ENABLED = process.env['ROLEPLAY_STRUCTURED_ENABLED'] === 'true';
// 结论：永远是 false
```

### ✅ 正确
```typescript
// RoleplayDomain.ts 运行时函数
function isStructuredEnabled(): boolean {
  return process.env['ROLEPLAY_STRUCTURED_ENABLED'] === 'true';
}
// 调用时 .env 已加载，值正确
```

## 全局排查

```bash
# 查所有模块级 process.env 访问
grep -rn "process\.env\['" src/ --include='*.ts' | grep -v 'getSQLite\|ConfigService\|test\|spec'
```

## 来源
[[root-cause-getdomainstatus-import]]
[[session-checkpoint-20260705]]
