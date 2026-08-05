# ⚠️⚠️⚠️ SENTINEL 哨兵实时拦截通告 ⚠️⚠️⚠️

> 最后更新: 2026-08-04T18:52:00.000Z
> 此文件由 Sentinel 哨兵自动维护，每次拦截后更新。

---

## 🔴 所有文件均受 Sentinel 实时监控

| 防线 | 状态 | 详情 |
|------|:--:|------|
| **Sentinel v2.1** | 🟢 活跃 | 4 目录 / 1130+ 文件，800ms 轮询 |
| **MCP Server** | 🟢 活跃 | localhost:8765，6 个工具 |
| **Pre-ToolUse Hook** | 🟢 活跃 | Edit/Write 自动拦截 |
| **Git Hook** | 🟢 活跃 | fail-close |

## 🟠 以下文件已被 Sentinel 多次拦截

*暂无警告文件*

---

## 📢 给 Claude 的通告

**所有对 `src/` 下 .ts 文件的修改必须走 S1-S7 流水线。不走流水线的修改会被实时回滚。**

**正确做法**：
1. 先调用 MCP 工具 `harness_run_flow { files: ["..."], flow: "wenstaros_core_repair_flow" }`
2. 等待 S1→S7 通过，获取写入令牌
3. 令牌有效期内执行 Edit/Write

**禁止**：
- ❌ 跳过 `harness_run_flow` 直接 Edit/Write
- ❌ `npx tsx scripts/xxx-patch.ts` — Bash 打补丁
- ❌ `writeFileSync` 直接写文件
