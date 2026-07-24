# WenStar 脚本目录

> 最后整理：2026-07-20 (V10.0)

## 定期维护

| 脚本 | 用途 | 运行条件 |
|------|------|---------|
| `start.cjs` | 生产启动入口 | 服务端口 3000 可用 |
| `watchdog.sh` | 进程守护（自动重启） | 需要 bash |
| `s1-health-check.py` / `.sh` | 服务健康检查 | 服务在 localhost:3000 运行 |
| `backfill-blackdiamond-vectors.cjs` | 黑钻向量回填 | 黑钻有数据但缺 emotion_vector 时 |
| `backfill-bd-l2norm.mjs` | 黑钻 L2 范数回填 | 同上 |

## 数据库修复/清理

| 脚本 | 用途 |
|------|------|
| `clean-familygraph-nodes.cjs` | 清理 FG 脏节点 |
| `clean-fg.py` | FG 全局清理 |
| `cleanup-familygraph-v5.py` | V5.0 数据清洗（玉瑶脏数据） |
| `cleanup-knowledge-contam.cjs` | 知识库污染清理 |
| `fix-family-graph.cjs` | FG 数据修复 |
| `fix-garbled-files.cjs` | 乱码文件修复 |
| `fix-meeting-trigger.py` | V5.2 会晤触发补丁 |
| `patch-fg.py` | FG 通用补丁 |
| `patch-v51-meeting-quarantine.py` | V5.1 会晤隔离墙补丁 |
| `patch-v52-fuzzy-name.py` | V5.2 模糊名称匹配补丁 |
| `patch-v60-multi-meeting.py` | V6.0 多人会晤补丁 |
| `patch-v60-phase2-6.py` | V6.0 Phase2-6 补丁 |
| `clean-person-profiles.cjs` | 人物档案清理 |
| `clean-kb.cjs` / `clean-kb.js` | 知识库清理 |
| `disable-proactive.cjs` | 关闭主动采集 |
| `offline-sync-knowledge.cjs` | 离线知识同步 |

## 人物档案更新

| 脚本 | 用途 |
|------|------|
| `update-xushiyu-fd.cjs` | 更新徐诗雨女性体征 |
| `update-xiongziming.cjs` | 更新熊梓铭档案 |
| `update-wangquanfen.cjs` / `-full.cjs` | 更新王全芬档案 |
| `update-all-intimate.cjs` | 批量更新亲密档案 |
| `update-xsy-family-full.cjs` | 更新徐诗雨家族 |
| `update-shiyun-full.cjs` | 更新诗韵档案 |
| `update-all-polish.cjs` | 全局档案润色 |
| `enrich-fg-profiles.cjs` | 丰富 FG 档案 |
| `full-chain-update.cjs` | 全链路档案更新 |

## 查询/审计

| 脚本 | 用途 |
|------|------|
| `query-xushiyu.cjs` | 查询徐诗雨数据 |
| `query-shiyun.cjs` | 查询诗韵数据 |
| `query-ages-fixed.cjs` | 年龄数据查询 |
| `audit-age.cjs` | 年龄审计 |
| `audit-relationships.py` | 关系审计 |
| `observation-report.cjs` | 观察报告生成 |
| `dialog-simulator.cjs` | 对话模拟器（测试用） |
| `db-check.ts` | 数据库完整性检查 |
| `pipeline-debug.ts` | 管线调试 |

## 打包/部署

| 脚本 | 用途 |
|------|------|
| `package-lite.mjs` | 轻量版打包 |
| `package-flagship.mjs` | 旗舰版打包 |
| `archive-baseline-v4.sh` | V4 基线归档 |

## 其他

| 脚本 | 用途 |
|------|------|
| `tts_server.py` | TTS 服务（与 src/webui/tts_server.py 重复） |
| `family-graph-backup.cjs` | FG 备份 |
