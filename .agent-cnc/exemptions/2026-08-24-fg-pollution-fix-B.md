# 豁免记录：FG 污染治理 方案B（V10.1 代码修复）

- **日期**: 2026-08-24
- **任务**: FG 污染治理（LLM 实体识别前置的阶段 B）
- **方式**: 分支2（`exemptions-core.cjs.addExemption`，Sentinel 放行 60 分钟）

## 修改文件

`src/m4/household/FamilyGraph.ts`（5 处，均已验证持久化 + tsc 待验）

| # | 位置 | 改动 | 目标 |
|:-:|------|------|------|
| 1 | 模块级 | 新增 `_lastFullAcqFixTs` 24h 冷却时间戳 | 防止每次启动全量补 acquaintance 反向边 |
| 2 | `addEdge()` | 同源同目标同关系重复边拦截（先 query 后 INSERT） | 防止 RAG 反复写入同一关系导致边数膨胀 |
| 3 | `inferFamilyLinks()` + 新增 `_getNodeAge()`/`_isParentAgePlausible()` | 亲子关系年龄验证（父母≥16 且 > 孩子，未知放行） | 防止"14 岁当妈"类血缘推理错误 |
| 4 | ⑮ 全员双向认识 | 重写：只补"已有单向"的反向边 + 24h 冷却 + 500 条批量上限（不再全对生成 + 暴力全删） | 根治每次启动批量创建 acquaintance 双向网络 |
| 5 | ⑯ REV_MAP | 移除 `'acquaintance_of':'acquaintance_of'` | 阻止 ⑯ 绕过冷却持续补 acquaintance 反向边 |
| 6 | ⑪ GARBAGE 名单 | 移除 `'我'`（V10.1 追加修复） | ⑪ 把用户锚点节点 SELF-00001 当垃圾删除，导致 2026-08-24 服务启动后"我"节点连同 3 条核心边（含 sibling_of 徐诗韵）丢失，已恢复数据并修复代码 |

## 数据事故记录（⑪ 删除"我"节点）

- **触发**: 2026-08-24 服务启动 → fgIntegrityGuard ⑪ 按 `name='我'` 命中 SELF-00001 → DELETE 节点 + 全部边
- **损失**: SELF-00001 节点 + 3 条边（我→徐诗雨 acquaintance、我→徐诗韵 acquaintance、我→徐诗韵 sibling_of）
- **恢复**: 从 `family_graph.clean-20260824-1945.db` 复制节点 + 3 边（脚本 `D:\tmp\fg-restore-self-20260824.cjs`），清理 1 条孤儿边
- **验证**: 重启后 nodes=24，"我"节点稳定，edges=153 无膨胀

## 背景

RAG 侧把"认识的人"误判成 acquaintance_of 单向边写入主 FG；启动时 `fgIntegrityGuard` ⑮ 为其补全双向边，形成全量两两认识网络。2026-08-24 实测一次启动边数从 24 节点膨胀到 150+ 条 acquaintance。方案A 已清理数据库，方案B 在代码层收敛触发频率。

## 红线判定

11 条 FG 角色扮演红线全部不触碰（修改限定主 FG 数据卫生层，不涉及 RoleBranch/chat.ts 角色路径）。
