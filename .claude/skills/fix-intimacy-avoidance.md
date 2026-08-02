---
name: fix-intimacy-avoidance
description: 🔥 修复玉瑶亲密回避问题 — 6维度排查到修复的完整流程
---

# /fix-intimacy-avoidance — 亲密响应修复

## 触发条件

玉瑶对亲密/性爱话题回避、兜圈子、答非所问、跳转到无关话题时调用。

## 排查与修复（逐级查找，找到断点即停）

### 第1层：API连接
`grep -a "Mock\|降级" /tmp/server.log` → 有则检查API密钥

### 第2层：角色分类器
`grep -a "RoleRouter" /tmp/log | tail -5` → 检查是否切到lover
修复: `src/app/role/RoleClassifier.ts` — INTIMATE_KEYWORDS + isIntimate

### 第3层：熔断阈值
`grep -a "熔断" /tmp/log` → 检查是否被锁定
修复: `src/app/role/TransitionManager.ts` — INTIMATE_THRESHOLD=1

### 第4层：M5Orchestrator 覆盖
`grep -a "M5Role" /tmp/log` → 与 RoleRouter 不一致则修复
修复: `src/m5/M5Orchestrator.ts` — 加强制lover切换

### 第5层：DeepSeekLLMProvider
`grep -a "userMsgContent\|ReferenceError\|reasoning_effort" /tmp/log`
修复: `src/m5/DeepSeekLLMProvider.ts` — 6个子项

### 第6层：isIntimateText 正则
修复: `src/m5/DeepSeekLLMProvider.ts` — 收窄`给我`，加身体词

## 验证
```bash
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"message":"让我亲你一下"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['reply'][:200])"
```
验收：回复含身体动作 + 日志显示lover角色

详情: `docs/troubleshooting-intimacy-guide.md`
