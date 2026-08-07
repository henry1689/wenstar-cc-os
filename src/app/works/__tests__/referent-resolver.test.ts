import { describe, it, expect } from 'vitest';
import { resolveReferent } from '../ReferentResolver.js';
import type { WorkRepository } from '../WorkRepository.js';
import type { WorkRecord } from '../WorkRepository.js';

/** 假 repo（内存作品） */
function makeRepo(works: WorkRecord[]): WorkRepository {
  return {
    findLatestWork(entityUuid?: string | null, workType?: string) {
      const filtered = works.filter(w =>
        (!entityUuid || w.belong_entity_uuid === entityUuid) &&
        (!workType || w.work_type === workType)
      );
      return filtered.length ? filtered[filtered.length - 1] : null;
    },
    findWorkByTitleFuzzy(kw: string, entityUuid?: string | null) {
      const m = works.find(w =>
        w.title.includes(kw) && (!entityUuid || w.belong_entity_uuid === entityUuid)
      );
      return m || null;
    },
  } as unknown as WorkRepository;
}

const novel: WorkRecord = {
  work_id: 'wk_1', title: '星落之城', work_type: 'novel',
  first_sentence: '城外的风', summary: '一座星辰坠落之城的故事',
  full_text: '第一章 星落之城\n' + '城外的风卷着黄沙。\n'.repeat(30),
  belong_entity_uuid: 'TXS-000000001', dna_root_id: null,
  source_conversation_ids: '[]', dialog_group_id: null,
  semantic_vector: null, created_at: '2026-08-07T04:00:00Z', updated_at: '2026-08-07T04:00:00Z',
};

describe('ReferentResolver — 指称解析 (S5 收紧)', () => {
  const repo = makeRepo([novel]);

  it('强指称"我们写的那篇小说" → 命中 + isStrong=true（全文）', () => {
    const r = resolveReferent('我们写的那篇小说', repo, []);
    expect(r.matched).toBe(true);
    expect(r.work?.title).toBe('星落之城');
    expect(r.isStrong).toBe(true);
  });

  it('强指称"那篇小说" → 命中 + isStrong=true', () => {
    const r = resolveReferent('那篇小说', repo, []);
    expect(r.matched).toBe(true);
    expect(r.isStrong).toBe(true);
  });

  it('续写"继续写" → 命中 + isStrong=true', () => {
    const r = resolveReferent('继续写', repo, []);
    expect(r.matched).toBe(true);
    expect(r.isStrong).toBe(true);
  });

  it('讨论句"这篇文章你看了吗" → 弱指称 isStrong=false（仅摘要）', () => {
    const r = resolveReferent('这篇文章你看了吗', repo, []);
    expect(r.matched).toBe(true);      // 命中指称（这篇+文章）
    expect(r.isStrong).toBe(false);    // 但讨论句 → 弱指称
  });

  it('日常句"今天吃什么" → 不触发', () => {
    const r = resolveReferent('今天吃什么', repo, []);
    expect(r.matched).toBe(false);
  });

  it('日常句"开头写得不错" → 不触发（去掉高频词）', () => {
    const r = resolveReferent('开头写得不错', repo, []);
    expect(r.matched).toBe(false);
  });

  it('日常句"再来一个" → 不触发（CONTINUE_RE 收紧）', () => {
    const r = resolveReferent('再来一个', repo, []);
    expect(r.matched).toBe(false);
  });

  it('标题模糊"星落之城" → 命中 + isStrong=false（弱指称）', () => {
    const r = resolveReferent('星落之城', repo, ['TXS-000000001']);
    expect(r.matched).toBe(true);
    expect(r.work?.title).toBe('星落之城');
    expect(r.isStrong).toBe(false);
  });

  it('会晤场景查他人作品 → Resolver 回落 master（权限层 policePasses 拦截）', () => {
    const r = resolveReferent('那篇小说', repo, ['OTHER-XXX']);
    // Resolver 在实体无作品时回落全库（返回 TXS 作品），
    // 但上层 retrieval-stage 的 policePasses 会因 belong 不在 OTHER 白名单而拒绝注入。
    expect(r.matched).toBe(true);
    expect(r.work?.title).toBe('星落之城');  // 回落返回
    // 权限拦截在 retrieval-stage（policePasses），此处验证 Resolver 回落行为
    expect(r.scope).toBe('master');
  });
});
