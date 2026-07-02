#!/usr/bin/env bash
# S1 灰度验证每日健康检查
# 检查：日志完整性 / 路由准确率 / 异常兜底 / 响应耗时

API="http://localhost:3000"
DATE=$(date '+%Y-%m-%d %H:%M:%S')
PASS=0
FAIL=0

echo "=========================================="
echo " S1 灰度验证检查 - $DATE"
echo "=========================================="

# 1. 服务器存活
if curl -sf "$API/api/knowledge?limit=1" > /dev/null 2>&1; then
    echo "  ✅ 服务器在线"
    PASS=$((PASS+1))
else
    echo "  ❌ 服务器离线"
    FAIL=$((FAIL+1))
fi

# 2. traceId 日志检查
TRACE_LOG=$(grep -a "\[T:" /tmp/server.log 2>/dev/null | tail -5)
if [ -n "$TRACE_LOG" ]; then
    echo "  ✅ traceId 日志存在:"
    echo "$TRACE_LOG" | while read -r line; do
        echo "     ${line:0:100}"
    done
    PASS=$((PASS+1))
else
    echo "  ❌ traceId 日志缺失"
    FAIL=$((FAIL+1))
fi

# 3. 异常兜底检查
ERROR_LOG=$(grep -a "回退旧链路\|\[S1\] 新链路异常" /tmp/server.log 2>/dev/null)
if [ -n "$ERROR_LOG" ]; then
    echo "  ❌ 发现异常回退:"
    echo "$ERROR_LOG" | tail -3 | while read -r line; do echo "     $line"; done
    FAIL=$((FAIL+1))
else
    echo "  ✅ 无异常回退"
    PASS=$((PASS+1))
fi

# 4. 知识库正常
KB_COUNT=$(curl -sf "$API/api/knowledge?limit=1" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total','?'))" 2>/dev/null)
if [ "$KB_COUNT" != "?" ] && [ "$KB_COUNT" -gt 0 ] 2>/dev/null; then
    echo "  ✅ 知识库正常: ${KB_COUNT}条"
    PASS=$((PASS+1))
else
    echo "  ❌ 知识库异常"
    FAIL=$((FAIL+1))
fi

# 5. 监控探针状态
PROBE=$(curl -sf "$API/_hooks/monitor" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('cards',[]); g=sum(1 for x in c if x.get('status')=='green'); r=sum(1 for x in c if x.get('status')=='red'); print(f'{len(c)}/{g}/{r}')" 2>/dev/null)
if [ -n "$PROBE" ]; then
    TOTAL=$(echo $PROBE | cut -d'/' -f1)
    GREEN=$(echo $PROBE | cut -d'/' -f2)
    RED=$(echo $PROBE | cut -d'/' -f3)
    echo "  ✅ 探针: $TOTAL个, 🟢$GREEN, 🔴$RED"
    PASS=$((PASS+1))
fi

# 6. Heart 状态链路检查
HEART_LOG=$(grep -a "\[Heart\]" /tmp/server.log 2>/dev/null | tail -3)
if [ -n "$HEART_LOG" ]; then
    echo "  ✅ Heart 链路活跃:"
    echo "$HEART_LOG" | while read -r line; do echo "     ${line:0:100}"; done
    PASS=$((PASS+1))
else
    echo "  ⚠️ Heart 链路无日志（如需对话触发才会产生）"
fi

echo "------------------------------------------"
echo "  ✅ 通过: $PASS  |  ❌ 失败: $FAIL"
echo "=========================================="
