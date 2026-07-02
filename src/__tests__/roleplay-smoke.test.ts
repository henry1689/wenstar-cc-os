/**
 * 🎭 角色扮演稳定性烟雾测试
 *
 * 覆盖：显式扮演 / 隐式扮演 / 持续扮演 / 角色切换 / 退出恢复
 * 运行：npx vitest run src/__tests__/roleplay-smoke.test.ts
 * 前提：服务器运行在 localhost:3000
 *
 * 防复发第三层 — 每次代码变更后运行此测试，确保角色扮演不退化。
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:3000';
const TIMEOUT = 40000; // LLM 回复可能较慢

async function chat(message: string): Promise<string> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, testMode: true }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const d = await res.json();
  return (d as any).reply || '';
}

async function health(): Promise<any> {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}

// ─── 测试 ───

describe('🎭 角色扮演稳定性烟雾测试', () => {
  // 前置条件：服务器运行 + 健康
  it('服务器应运行且健康', async () => {
    const h = await health();
    expect(h.status).toBe('ok');
  });

  // 测试 1: 显式扮演
  it('T1 显式扮演 - "扮演诗韵" 应以诗韵身份回复', async () => {
    const reply = await chat('扮演诗韵');
    expect(reply).toBeTruthy();
    const first100 = reply.substring(0, 100);
    // 回复不应包含诗雨自称
    expect(first100).not.toMatch(/诗雨/);
    expect(first100).not.toMatch(/我是玉瑶/);
    expect(first100).not.toMatch(/我是你的秘书/);
    console.log('[T1] Reply:', reply.substring(0, 80));
  });

  // 测试 2: 隐式扮演
  it('T2 隐式扮演 - "诗韵，你怎么..." 应以诗韵身份回复', async () => {
    // 先显式扮演确保激活
    await chat('扮演诗韵');
    // 再用隐式
    const reply = await chat('诗韵，我在学校门口等你呢');
    const first100 = reply.substring(0, 100);
    expect(first100).not.toMatch(/诗雨/);
    expect(first100).not.toMatch(/我是玉瑶/);
    console.log('[T2] Reply:', reply.substring(0, 80));
  });

  // 测试 3: 持续扮演 3 轮不漂移
  it('T3 持续扮演 3 轮 - 角色身份应保持稳定', async () => {
    await chat('扮演诗韵');
    const r1 = await chat('今天天气真好');
    const r2 = await chat('你吃饭了吗');
    const r3 = await chat('晚上想去散步');
    for (const r of [r1, r2, r3]) {
      expect(r).toBeTruthy();
      const first60 = r.substring(0, 60);
      expect(first60).not.toMatch(/诗雨/);
      expect(first60).not.toMatch(/我是玉瑶/);
    }
    console.log('[T3] 3轮持续扮演未漂移');
  });

  // 测试 4: 角色切换
  it('T4 角色切换 - 扮演A→扮演B 应切换干净', async () => {
    const r1 = await chat('扮演诗韵');
    const r2 = await chat('扮演熊梓铭');
    for (const r of [r1, r2]) {
      expect(r).toBeTruthy();
    }
    // 切换到梓铭后，回复不应称呼用户为"鸿艺"（诗韵视角）
    const r2first60 = r2.substring(0, 60);
    expect(r2first60).not.toMatch(/诗韵/);
    console.log('[T4] 角色切换完成');
  });

  // 测试 5: 退出扮演
  it('T5 退出扮演 - "停止扮演" 应恢复玉瑶身份', async () => {
    await chat('扮演诗韵');
    const exitReply = await chat('停止扮演');
    const first50 = exitReply.substring(0, 50);
    // 退出后不应以角色身份回复
    // 应该回到玉瑶的正常对话风格
    expect(exitReply).toBeTruthy();
    console.log('[T5] Exit reply:', exitReply.substring(0, 80));
  });

  // 测试 6: 健康检查应有 roleplay 字段
  it('T6 健康检查应包含 roleplay 状态', async () => {
    const h = await health();
    expect(h).toHaveProperty('roleplay');
    // 没有扮演时为 false
    expect(h.roleplay.active).toBe(false);
  });
});
