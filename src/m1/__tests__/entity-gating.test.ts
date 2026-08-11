/**
 * entity-gating.test.ts — P1-3 实体提取条件化信号检测
 * ==============================================
 * hasEntitySignal：消息含人名/称谓/家庭/事件/情绪信号 → 走 LLM；纯闲聊 → 跳过
 */
import { describe, it, expect } from 'vitest';
import { hasEntitySignal, regexFallback, extractEntitiesLLM } from '../LLMEntityExtractor.js';

describe('hasEntitySignal — P1-3 实体信号检测', () => {
  it('人名形态（姓氏开头具体人名）→ true', () => {
    expect(hasEntitySignal('王小明的电话是多少')).toBe(true);
    expect(hasEntitySignal('帮我查一下李总的行程')).toBe(true);
  });
  it('昵称人名（阿X/小X）→ true（S4-M4: 防止 entity_genes 缺失级联漏采集）', () => {
    expect(hasEntitySignal('阿珍今年40岁')).toBe(true);
    expect(hasEntitySignal('小美也来了')).toBe(true);
  });
  it('职场称谓（张总/王经理）→ true', () => {
    expect(hasEntitySignal('张总今天来吗')).toBe(true);
    expect(hasEntitySignal('王经理约你明天开会')).toBe(true);
  });
  it('家庭称谓（我妈/爸爸）→ true', () => {
    expect(hasEntitySignal('我妈明天过来')).toBe(true);
    expect(hasEntitySignal('爸爸在做饭')).toBe(true);
  });
  it('情绪词（好难过）→ true', () => {
    expect(hasEntitySignal('我今天好难过')).toBe(true);
    expect(hasEntitySignal('他好像有点焦虑')).toBe(true);
  });
  it('事件词（去旅游/考试）→ true', () => {
    expect(hasEntitySignal('我们周末去旅游吧')).toBe(true);
    expect(hasEntitySignal('下周要考试了')).toBe(true);
  });
  it('纯闲聊（无实体信号）→ false', () => {
    expect(hasEntitySignal('今天天气真不错哈哈')).toBe(false);
    expect(hasEntitySignal('嗯嗯好的知道了')).toBe(false);
    expect(hasEntitySignal('随便逛逛')).toBe(false);
  });
  it('空/短输入 → false', () => {
    expect(hasEntitySignal('')).toBe(false);
    expect(hasEntitySignal('好')).toBe(false);
  });
  it('regexFallback 保留 emotion/event 召回（跳过 LLM 时兜底）', () => {
    const fb = regexFallback('我好难过，我们去旅游吧');
    const names = fb.map(e => e.name);
    expect(names).toContain('难过');
    expect(names).toContain('旅游');
  });

  it('extractEntitiesLLM 端到端: 阿X/小X 昵称通过过滤（S4-M4）', async () => {
    const llmGenerate = async () => JSON.stringify({ entities: [{ name: '小美', type: 'person' }, { name: '阿珍', type: 'person' }] });
    const result = await extractEntitiesLLM('小美和阿珍今天来了', llmGenerate);
    const names = result.map(e => e.name);
    expect(names).toContain('小美');
    expect(names).toContain('阿珍');
  });
});
