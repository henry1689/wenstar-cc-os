# 🔥 亲密响应修复排查指南

> 适用场景：玉瑶对亲密/性爱话题回避、兜圈子、答非所问、跳转到无关话题。

---

## 一、根因分类（6层过滤链）

```
用户说"让我亲你一下"
  │
  ├→ ❶ 角色分类器 → 切到 secretary（禁止亲密）
  │    ├ INTIMATE_KEYWORDS 没匹配（缺主动词/身体词）
  │    ├ factual残留误判为工作
  │    └ 需要连续2条才切换
  │
  ├→ ❷ M5Orchestrator 重新分类
  │    └ 感知维度归零 → classifier不准
  │
  ├→ ❸ 熔断锁定
  │    └ 角色切换太多 → 锁在 secretary
  │
  ├→ ❹ DeepSeekLLMProvider
  │    ├ API不通 → Mock降级
  │    ├ userMsgContent未声明 → ReferenceError
  │    ├ lover被简短模式压制
  │    ├ level=0指令太平淡
  │    └ 缺亲密许可指令
  │
  ├→ ❺ isIntimateText 正则
  │    └ 太宽（给我看看）或太窄（只认操我）
  │
  └→ ❻ 单字关键词误触发
       └ 吻/亲/抱/摸/爱 在任何文本中都命中
```

## 二、排查工具

```bash
# 角色路由
grep -a "RoleRouter\|M5Role" /tmp/server.log | tail -20

# 亲密模式激活
grep -a "PassionateMode\|academicGuard" /tmp/server.log

# 模型调用
grep -a "Mock\|降级\|ReferenceError\|userMsgContent" /tmp/server.log

# 熔断
grep -a "熔断" /tmp/server.log
```

## 三、常见修复

| 问题 | 文件 | 修复 |
|------|------|------|
| INTIMATE_KEYWORDS太窄 | RoleClassifier.ts | 加操你/干你/奶子/模 |
| isIntimate感知残留 | RoleClassifier.ts | 改为消息词AND感知双条件 |
| INTIMATE_THRESHOLD=2 | TransitionManager.ts | 改为1 |
| 熔断次数太少 | TransitionManager.ts | MAX_SWITCHES=8 |
| 强制lover覆盖 | M5Orchestrator.ts | 加单字防误判 |
| reasoning_effort=low | DeepSeekLLMProvider.ts | 去掉||'low' |
| 思维链泄漏 | DeepSeekLLMProvider.ts | THINKING_KEYWORDS扩展 |
| 单字关键词过宽 | 各处 | 去掉吻/亲/抱/摸/爱单字 |

## 四、验证命令

```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"让我亲你一下"}' | python3 -c \
  "import sys,json;print(json.load(sys.stdin)['reply'][:200])"
```
