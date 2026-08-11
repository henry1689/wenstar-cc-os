/**
 * pae-shortcircuit.test.ts — P1-4 PAE 信号短路 + S4-M5 会晤旁路
 * ==============================================
 * 无档案信号 + 非会晤 → 短路（LLM 不被调）
 * 有档案信号 → 走 LLM
 * 会晤(isMeeting) + 无信号 → 不短路（旁路完整）
 */
import { describe, it, expect, vi } from 'vitest';
import { ProfileAcquisitionEngine } from '../ProfileAcquisitionEngine.js';

function makePAE() {
  const rawLLMCall = vi.fn().mockResolvedValue(JSON.stringify({ persons: [] }));
  const familyGraph = {
    getAllPersonNames: () => [],
    getPersonProfile: () => null,
    addPendingItem: async () => {},
    setDossierField: async () => {},
    addProfileChange: async () => {},
  } as any;
  const pae = new ProfileAcquisitionEngine(familyGraph, rawLLMCall as any);
  return { pae, rawLLMCall };
}

describe('PAE — P1-4 信号短路 + S4-M5 会晤旁路', () => {
  it('无档案信号 + 非会晤 → 短路，LLM 不被调', async () => {
    const { pae, rawLLMCall } = makePAE();
    const report = await pae.acquire('小王昨天也来了', ['小王'], { mode: 'pre_generation', source: 'user_message' });
    expect(rawLLMCall).not.toHaveBeenCalled();
    expect(report.fieldsWritten).toBe(0);
  });

  it('有档案信号（职业）→ 走 LLM，不被短路', async () => {
    const { pae, rawLLMCall } = makePAE();
    await pae.acquire('我在华为上班', ['小王'], { mode: 'pre_generation', source: 'user_message' });
    expect(rawLLMCall).toHaveBeenCalledTimes(1);
  });

  it('会晤(isMeeting) + 无信号 → 不短路（S4-M5 旁路完整）', async () => {
    const { pae, rawLLMCall } = makePAE();
    await pae.acquire('小王昨天也来了', ['小王'], { mode: 'pre_generation', source: 'user_message', isMeeting: true });
    expect(rawLLMCall).toHaveBeenCalledTimes(1);
  });
});
