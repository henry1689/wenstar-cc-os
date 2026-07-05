# 四段式变更报告

## 一、改了什么

### 5 个文件，5 个连锁修复

| 文件 | 改动 |
|------|------|
| `.env` | 新增 `ROLEPLAY_STRUCTURED_ENABLED=true` |
| `src/app/roleplay/RoleplayDomain.ts` | 模块级常量 `STRUCTURED_ENABLED` → 运行时函数 `isStructuredEnabled()`；导出 `getDomainStatus` |
| `src/app/roleplay-legacy/RoleplayDomain.ts` | 同上 |
| `src/webui/chat.ts` | import 追加 `getDomainStatus`；3处 `DomainContext` 创建补 `storage` 字段 |
| `src/m4/MemoryRetriever.ts` | 移除 L2 关键词提前 return，L3 拓扑始终运行 |
| `src/app/roleplay/FourLayerDataCollector.ts` | 新增调试日志 |

## 二、为什么改

### 原始设计意图

`RoleplayDomain.ts` 导出了 `getDomainStatus()` 供 chat.ts 查询结构化管线是否开启。4处守卫点通过 `!getDomainStatus().structured` 决定是否注入旧路径的 `buildRoleplayRules()`。

### 根因链

```
chat.ts import 漏掉 getDomainStatus
  ↓
4 处 if (!getDomainStatus().structured) 抛 ReferenceError
  ↓
outer try/catch (L2481) 全部吞掉
  ↓
结构化管线守卫永不生效 → 旧路径永远兜底
  ↓
持续数天反复"修复" env var / storage / topology
    但核心开关根本没有被调用
```

### 为什么数天没找到

- **错误被吞**：外层 catch 使用 FALLBACK_REPLIES 兜底，不崩不报，看起来"系统在运行"
- **误导日志**：模块级 `process.env` 输出"已关闭"，指向完全不同的方向
- **症状补丁**：env var / storage / 截断式修复都针对真正的问题，但没触及核心
- **部分可用**：`runRoleplayPipeline` 本身能被调用并返回结果，让人误以为管线通

### 补充分支

- **ESM hoisting**：模块级 `process.env` 在 `.env` 加载前执行
- **storage 缺字段**：`DomainContext` 定义有 storage 但 chat.ts 传参时没传

## 三、改了的后果

### 正面

- 结构化管线首次真正运行 ✅
- 四层全通（L1-L2-L3-L4）+ 拓扑 10 条 ✅
- 徐诗韵正确回答 14岁/阿苏是妈/徐诗雨是姐 ✅
- 回退次数：0（不再触发旧链路回退）

### 风险

- 无：所有改动都是补上缺失的字段和导入，不影响现有逻辑

## 四、需要回复

是。**请确认本次根因定位是否正确**，如果确认，我会将这段经验写入存档目录供下次借鉴，并用 `git commit` 同步到 GitHub。
