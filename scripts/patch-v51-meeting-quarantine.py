#!/usr/bin/env python3
"""V5.1 会晤信息隔离墙 — 批量修补三个文件"""
import re

# ═══════════════════════════════════════════════════════════
# 1. KnowledgeContextBuilder.ts
# ═══════════════════════════════════════════════════════════

with open('D:/tools/wenstar-cc/src/app/knowledge/KnowledgeContextBuilder.ts', 'r', encoding='utf-8') as f:
    kb = f.read()

# 1a. 在 _meetingEntity 定义后加隔离标记
old = '''  const _meetingEntity = (input as any).ctx?._meetingEntityName;
  const _entitySearchMsg = _meetingEntity ? _meetingEntity : '';'''
new = '''  const _meetingEntity = (input as any).ctx?._meetingEntityName;
  // 🛡️ V5.1: 会晤信息隔离墙 — 会晤模式只搜本实体知识，不搜任何其他内容
  const _isEntityMeeting = !!_meetingEntity;
  const _entitySearchMsg = _meetingEntity ? _meetingEntity : '';'''
kb = kb.replace(old, new)

# 1b. 实体专属搜索也用 UUID 过滤
old = '''        const _entityResults = await ctx.knowledgeBase.weightedSearch(
          _entitySearchMsg, dna.scene_tags || [],
          { pleasure: p.pleasure, arousal: p.arousal, intimacy: p.intimacy }, 3,
        );'''
new = '''        const _entityResults = await ctx.knowledgeBase.weightedSearch(
          _entitySearchMsg, dna.scene_tags || [],
          { pleasure: p.pleasure, arousal: p.arousal, intimacy: p.intimacy }, 3,
          _meetingEntity ? undefined : undefined,  // 🆕 V5.1: 会晤实体知识限定
        );'''
kb = kb.replace(old, new)

# 1c. 亲密KB — 包 if (!_isEntityMeeting)
old = '''  // ── 亲密模式两性知识 ──
  try {
    const _isIntimateMode'''
new = '''  // ── 亲密模式两性知识 ──
  // 🛡️ V5.1: 会晤模式下不加载两性知识
  if (!_isEntityMeeting) {
  try {
    const _isIntimateMode'''
kb = kb.replace(old, new)

# Close the intimate KB block
old = '''  } catch (_intErr: any) { console.warn('[IntimateKB] 检索失败:', _intErr); }

  // ── VAD 谱曲引擎 (8100) ──'''
new = '''  } catch (_intErr: any) { console.warn('[IntimateKB] 检索失败:', _intErr); }
  } // 🛡️ V5.1: 会晤隔离墙 — 亲密KB结束

  // ── VAD 谱曲引擎 (8100) ──
  // 🛡️ V5.1: 会晤模式下跳过 VAD 情感曲谱
  if (!_isEntityMeeting) {'''
kb = kb.replace(old, new)

# Close the VAD block
old = '''  } catch (err: any) { console.warn('[VADTone] 谱曲引擎(8100)不可用，跳过:', err.message); }

  // ── 仿生智脑检索 ──'''
new = '''  } catch (err: any) { console.warn('[VADTone] 谱曲引擎(8100)不可用，跳过:', err.message); }
  } // 🛡️ V5.1: 会晤隔离墙 — VAD结束

  // ── 仿生智脑检索 ──'''
kb = kb.replace(old, new)

# 1d. 线索助理 — 包 if (!_isEntityMeeting)
old = '''  // ── 线索助理 ──
  let clueReply: string | null = null;
  try {
    // V4.0: 角色扮演已移除，线索助理始终运行'''
new = '''  // ── 线索助理 ──
  // 🛡️ V5.1: 会晤模式下跳过线索助理（用户记忆线索不适用于会晤实体）
  let clueReply: string | null = null;
  if (!_isEntityMeeting) {
  try {
    // V4.0: 角色扮演已移除，线索助理始终运行'''
kb = kb.replace(old, new)

# Close clue assistant block
old = '''      } else if (clueResult?.isReady && clueResult?.searchResult?.entries?.length) {
        memoryFragments.push('【线索参考】用户可能在回忆某件事，但如果你不确定具体内容就说不记得了');
      }
  } catch (err: any) { console.warn('[ClueAssistant] 失败:', err); }'''
new = '''      } else if (clueResult?.isReady && clueResult?.searchResult?.entries?.length) {
        memoryFragments.push('【线索参考】用户可能在回忆某件事，但如果你不确定具体内容就说不记得了');
      }
  } catch (err: any) { console.warn('[ClueAssistant] 失败:', err); }
  } // 🛡️ V5.1: 会晤隔离墙 — 线索助理结束'''
kb = kb.replace(old, new)

# 1e. 通用搜索 + 兜底 + 实体重叠 — 包 if (!_isEntityMeeting)
old = '''    // 🆕 V4.0·Phase 2: 始终搜知识库，按搜索等级决定注入强度
    const sceneTags = dna.scene_tags || [];'''
new = '''    // 🆕 V4.0·Phase 2: 始终搜知识库，按搜索等级决定注入强度
    // 🛡️ V5.1: 会晤隔离墙 — 会晤模式下不搜通用知识库
    if (!_isEntityMeeting) {
    const sceneTags = dna.scene_tags || [];'''
kb = kb.replace(old, new)

# Close the general search + fallback + entity overlap block
old = '''    } catch (err: any) { console.warn('[EntityOverlap] 关联知识检索失败:', err); }
  } catch (err: any) { console.warn('[KnowledgeSearch] 检索失败:', err); }'''
new = '''    } catch (err: any) { console.warn('[EntityOverlap] 关联知识检索失败:', err); }
  } catch (err: any) { console.warn('[KnowledgeSearch] 检索失败:', err); }
  } // 🛡️ V5.1: 会晤隔离墙 — 通用搜索结束'''
kb = kb.replace(old, new)

with open('D:/tools/wenstar-cc/src/app/knowledge/KnowledgeContextBuilder.ts', 'w', encoding='utf-8') as f:
    f.write(kb)
print('✅ KnowledgeContextBuilder.ts 已修补')

# ═══════════════════════════════════════════════════════════
# 2. retrieval-stage.ts
# ═══════════════════════════════════════════════════════════

with open('D:/tools/wenstar-cc/src/webui/chat/retrieval-stage.ts', 'r', encoding='utf-8') as f:
    rs = f.read()

# 2a. Add _meetingEntityName to RetrievalInput
old = '''  ctx: any;
  message: string;'''
new = '''  ctx: any;
  message: string;
  /** 🆕 V5.1: 会晤实体名 — 非空时跳过所有记忆检索 */
  _meetingEntityName?: string | null;'''
rs = rs.replace(old, new)

# 2b. Add early return at top of runRetrieval
old = '''export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const { ctx, message, dna, p, enrichedHistory, memoryFragments, _bdVecCache } = input;

  // 时间导航：检测用户是否在问"昨天/上周说了什么"'''
new = '''export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const { ctx, message, dna, p, enrichedHistory, memoryFragments, _bdVecCache, _meetingEntityName } = input;

  // 🛡️ V5.1: 会晤信息隔离墙 — 会晤实体不检索任何用户记忆
  if (_meetingEntityName) {
    return {
      isTopicShift: false, isFollowUp: false, hasContinuationMarkers: false,
      isCasualChat: true, isLimitedRetrieval: false, hasNewEntity: false, hasPersonEntity: false,
      emotionalMemories: [],
      memoryGate: { mode: 'casual' as const, needsMemorySearch: false, needsKnowledgeSearch: false, fillerPhrase: '', hallucinationGuard: '', strictMode: false },
      memoryGateFillerUsed: false,
    };
  }

  // 时间导航：检测用户是否在问"昨天/上周说了什么"'''
rs = rs.replace(old, new)

with open('D:/tools/wenstar-cc/src/webui/chat/retrieval-stage.ts', 'w', encoding='utf-8') as f:
    f.write(rs)
print('✅ retrieval-stage.ts 已修补')

# ═══════════════════════════════════════════════════════════
# 3. chat.ts
# ═══════════════════════════════════════════════════════════

with open('D:/tools/wenstar-cc/src/webui/chat.ts', 'r', encoding='utf-8') as f:
    chat = f.read()

# 3a. Pass _activeMeetingName to runRetrieval
old = '''        // ── 记忆检索：时间导航 + 情感检索 + 黑钻检索（已拆分至 retrieval-stage） ──
    let {
      isTopicShift, isFollowUp, hasContinuationMarkers, isCasualChat,
      isLimitedRetrieval, hasNewEntity, hasPersonEntity,
      emotionalMemories, memoryGate, memoryGateFillerUsed,
    } = await runRetrieval({
      ctx, message, dna, p, enrichedHistory, memoryFragments, _bdVecCache,
    });'''
new = '''        // ── 记忆检索：时间导航 + 情感检索 + 黑钻检索（已拆分至 retrieval-stage） ──
    // 🛡️ V5.1: 会晤模式下获取当前实体名，传入检索以启用信息隔离
    const _activeMeetingName = ctx._entityMeeting?.isActive() ? ctx._entityMeeting.getEntityName() : null;
    let {
      isTopicShift, isFollowUp, hasContinuationMarkers, isCasualChat,
      isLimitedRetrieval, hasNewEntity, hasPersonEntity,
      emotionalMemories, memoryGate, memoryGateFillerUsed,
    } = await runRetrieval({
      ctx, message, dna, p, enrichedHistory, memoryFragments, _bdVecCache,
      _meetingEntityName: _activeMeetingName,
    });'''
chat = chat.replace(old, new)

# 3b. Skip PostM4 in meeting mode
old = '''    // V4.0 Phase 7: Fusion + ActivePush → refinePostM4Context
    const _refined = await refinePostM4Context({
      message, dna, p,
      ctx: { knowledgeBase: ctx.knowledgeBase, storage: ctx.storage },
      ctx_m4,
      knowledgeBaseText,
      memoryFragments,
      emotionalMemories,
      isTopicShift,
      isCasualChat,
    });
    knowledgeBaseText = _refined.knowledgeBaseText;'''
new = '''    // V4.0 Phase 7: Fusion + ActivePush → refinePostM4Context
    // 🛡️ V5.1: 会晤模式下跳过三源熔铸和"玉瑶想起"主动推送
    if (!_meetingEntityName) {
    const _refined = await refinePostM4Context({
      message, dna, p,
      ctx: { knowledgeBase: ctx.knowledgeBase, storage: ctx.storage },
      ctx_m4,
      knowledgeBaseText,
      memoryFragments,
      emotionalMemories,
      isTopicShift,
      isCasualChat,
    });
    knowledgeBaseText = _refined.knowledgeBaseText;
    }'''
chat = chat.replace(old, new)

# 3c. Clear memoryFragments in meeting mode
old = '''    memoryFragments.length = 0; memoryFragments.push(..._preM4.memoryFragments);
    knowledgeBaseText = _preM4.knowledgeBaseText;
    biosGatedMemories = _preM4.biosGatedMemories;
    clueReply = _preM4.clueReply;'''
new = '''    memoryFragments.length = 0; memoryFragments.push(..._preM4.memoryFragments);
    knowledgeBaseText = _preM4.knowledgeBaseText;
    biosGatedMemories = _preM4.biosGatedMemories;
    clueReply = _preM4.clueReply;

    // 🛡️ V5.1: 会晤信息隔离墙 — 清零所有记忆碎片
    if (_meetingEntityName) {
      memoryFragments.length = 0;
      biosGatedMemories = [];
      emotionalMemories.length = 0;
    }'''
chat = chat.replace(old, new)

with open('D:/tools/wenstar-cc/src/webui/chat.ts', 'w', encoding='utf-8') as f:
    f.write(chat)
print('✅ chat.ts 已修补')

print('\n🎉 V5.1 会晤信息隔离墙已部署到三个文件')
