/**
 * 欲望栈单元测试（验证逻辑而非概率）
 */
import { describe, it, expect } from 'vitest';
import { updateDesireStack, defaultDesireStack } from '../desire-stack.js';

describe('desire-stack', () => {
  it('should accumulate longings over threshold', () => {
    const result = updateDesireStack(defaultDesireStack(), 'casual_chat', 'familiar', 72, 24);
    expect(result.stack.longings).toBeGreaterThan(0);
  });

  it('should express desire when urgency reaches threshold', () => {
    const stack = defaultDesireStack();
    stack.slots[0] = { id: 'test', category: '好奇', topic: 'test', urgency: 10, status: 'active', createdAt: new Date().toISOString() };
    const result = updateDesireStack(stack, 'knowledge_query', 'intimate', 1, 24);
    expect(result.hints.length).toBeGreaterThan(0);
    expect(result.stack.slots[0]?.status).toBe('expressed');
  });

  it('should decay urgency each turn', () => {
    const stack = defaultDesireStack();
    stack.slots[0] = { id: 'd1', category: '分享', topic: 'test', urgency: 3, status: 'active', createdAt: new Date().toISOString() };
    const r1 = updateDesireStack(stack, 'casual_chat', 'familiar', 1, 24);
    expect(r1.stack.slots[0]?.urgency).toBeLessThan(3);
  });
});
