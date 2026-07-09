#!/usr/bin/env tsx
/**
 * pipeline-debug — 全链路调试
 *
 * 发送一条消息并打印全链路日志：
 *   DNA → 感知向量 → 角色分类 → 钙化分 → 回复
 *
 * 用法: npx tsx scripts/pipeline-debug.ts <消息>
 * 示例: npx tsx scripts/pipeline-debug.ts "你好"
 */
const msg = process.argv.slice(2).join(' ') || '你好';

async function main() {
  const url = 'http://localhost:3000/api/chat';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg }),
  });
  const data = await resp.json();

  console.log('=== 全链路调试 ===');
  console.log(`消息: "${msg}"`);
  console.log(`\n回复: ${(data.reply || '').substring(0, 200)}`);
  console.log(`\n[M1] DNA: ${JSON.stringify(data.m1 || {})}`);
  console.log(`[M3] 决策: calcium=${data.m3?.calcium_score?.toFixed(2)} level=${data.m3?.calcium_level}`);
  console.log(`[M4] 记忆: ${data.m4?.memory_summary?.timeline?.length || 0}条`);
  console.log(`[M4] 家族: ${data.m4?.family_context?.length || 0}条`);
  console.log(`[M5] 策略: ${JSON.stringify(data.m5 || {})}`);
  console.log(`轮次: ${data.turn_count}`);
}

main().catch(e => { console.error('失败:', e.message); process.exit(1); });
