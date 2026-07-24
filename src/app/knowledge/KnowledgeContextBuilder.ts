/**
 * KnowledgeContextBuilder — 知识库检索管线 (V4.0 Phase 7)
 * ======================================================
 * 从 chat.ts 抽离 ~450 行知识库检索逻辑。
 *
 * 两个入口:
 *   buildPreM4Context()  — M4.orchestrate() 之前的检索管线
 *   refinePostM4Context() — M4.orchestrate() 后的融合/推送/兜底
 */

import type { DNA } from '../../m1/types/dna.js';
import { ConfigService } from '../../config/ConfigService.js';

/** 🆕 V4.0: 去除 markdown frontmatter（LLM 不需要看到 id/tags 等元数据） */
function stripFrontmatter(content: string): string {
  if (!content) return '';
  // 以 --- 开头 → 找到第二个 --- 之后的内容
  const trimmed = content.trimStart();
  if (trimmed.startsWith('---')) {
    const secondDash = trimmed.indexOf('---', 3);
    if (secondDash !== -1) {
      return trimmed.substring(secondDash + 3).trim();
    }
  }
  return content;
}

// ═══════════════════════════════════════════════════════
//  入参类型
// ═══════════════════════════════════════════════════════

export interface PreM4Input {
  message: string;
  dna: DNA;
  p: any;
  decision: any;
  ctx: {
    knowledgeBase: any;
    storage: any;
    yuyaoMemory?: any;
    hybridSearch?: any;
    clueAssistant?: any;
    m8?: any;
    conversationDB?: any;
    _gatekeeper?: any;  // V3.2: 户籍门阀过滤器
    _meetingEntityName?: string | null;  // 🆕 V4.0: 会晤实体名
  };
  knowledgeBaseText: string;
  memoryFragments: string[];
  emotionalMemories: any[];
  _bionicPromise: Promise<any>;
}

export interface PreM4Output {
  knowledgeBaseText: string;
  memoryFragments: string[];
  biosGatedMemories: any[];
  clueReply: string | null;
  bionicMemories: any[];
}

export interface PostM4Input {
  message: string;
  dna: DNA;
  p: any;
  ctx: { knowledgeBase: any; storage: any; conversationDB?: any; };
  ctx_m4: any;
  knowledgeBaseText: string;
  memoryFragments: string[];
  emotionalMemories: any[];
  isTopicShift: boolean;
  isCasualChat: boolean;
}

export interface PostM4Output {
  knowledgeBaseText: string;
}

// ═══════════════════════════════════════════════════════
//  PreM4 — M4 检索前的全部知识库检索管线
// ═══════════════════════════════════════════════════════

export async function buildPreM4Context(input: PreM4Input): Promise<PreM4Output> {
  const { message, dna, p, decision, ctx } = input;
  let knowledgeBaseText = input.knowledgeBaseText;
  const memoryFragments = [...input.memoryFragments];
  const { emotionalMemories } = input;

  // ── 🆕 V4.0·Phase 2: 主动知识感知 — 分级触发 ──
  // Level 1: 明确知识查询 ("你看过/知道/查一下") → 全库深度搜索
  // Level 2: 会晤模式 → 搜实体名 + 消息关键词
  // Level 3: 日常聊天含人名 → 轻量匹配，仅注入高置信度命中
  // Level 4: 纯闲聊 → 跳过，节省 token
  // 🔧 V10.1: 按搜索等级控制 KB 片段长度和总预算
  const _meetingEntity = (input as any).ctx?._meetingEntityName;
  const _isEntityMeeting = !!_meetingEntity;
  const _entitySearchMsg = _meetingEntity ? _meetingEntity : '';
  const _explicitQuery = /知识库|看过|知道.*吗|有没有|是否|曾经|查一下|搜一下|帮我查|告诉我.*关于/.test(message);
  const _hasPersonName = (dna.entity_genes || []).some((g: any) => g.type === 'person' && g.name !== '我' && g.name.length > 1);
  const _searchLevel = _explicitQuery ? 1 : (_meetingEntity ? 2 : (_hasPersonName ? 3 : 3));
  const _kbf = _searchLevel <= 2;
  // 🔧 V10.1: KB 预算按等级分级 — 日常闲聊严格限制，知识查询才放开
  const _kbBudgetByLevel: Record<number, { maxSnippetChars: number; maxTotalKBChars: number }> = {
    1: { maxSnippetChars: 3000, maxTotalKBChars: 6000 },  // 明确知识查询 → 充分
    2: { maxSnippetChars: 800,  maxTotalKBChars: 3000 },  // 会晤模式 → 中等
    3: { maxSnippetChars: 400,  maxTotalKBChars: 1200 },  // 日常闲聊 → 严格限制
    4: { maxSnippetChars: 200,  maxTotalKBChars: 500  },  // 纯闲聊 → 几乎不给
  };
  const _kbBudget = _kbBudgetByLevel[_searchLevel] || _kbBudgetByLevel[3];

  try {
    const searchMsg = _kbf
      ? message.replace(/你|在|知识库|看过|知道|吗|有没有|是否|曾经/g, '').replace(/[？?！!。，、：；]/g, '').trim()
      : message;

    // 🛡️ V10.0: 会晤模式下绝对不注入通用知识库——实体上下文由 EntityContextBuilder 提供
    // 之前的代码用实体名全库搜索会导致熊梓铭文档泄漏给徐诗雨等人物
    if (_entitySearchMsg && ctx.knowledgeBase && !_isEntityMeeting) {
      try {
        const _entityResults = await ctx.knowledgeBase.weightedSearch(
          _entitySearchMsg, dna.scene_tags || [],
          { pleasure: p.pleasure, arousal: p.arousal, intimacy: p.intimacy }, 3,
        );
        if (_entityResults && _entityResults.length > 0) {
          const _entityContent = _entityResults.map((k: any) =>
            `📄 ${k.title}\n${stripFrontmatter(k.content || '').substring(0, _kbBudget.maxSnippetChars)}`
          ).join('\n\n');
          const _existingKB = knowledgeBaseText || '';
          if (!_existingKB.includes(_entityContent.substring(0, 50))) {
            knowledgeBaseText = (_existingKB ? _existingKB + '\n\n' : '') +
              '【关于' + _meetingEntity + '的知识】\n' + _entityContent;
            console.log('[KB·Entity] 会晤实体检索: ' + _meetingEntity + ' → ' + _entityResults.length + '条知识');
          }
        }
      } catch (_ekErr) { /* 实体知识检索失败不阻塞 */ }
    }

    // 🆕 V4.0·Phase 2: 始终搜知识库，按搜索等级决定注入强度
    // 🛡️ V5.1: 会晤隔离墙 — 会晤模式下不搜通用知识库
    if (!_isEntityMeeting) {
    const sceneTags = dna.scene_tags || [];
    let knResults = await ctx.knowledgeBase.weightedSearch(
      _entitySearchMsg || searchMsg || message, sceneTags,
      { pleasure: p.pleasure, arousal: p.arousal, intimacy: p.intimacy },
      _searchLevel <= 2 ? 5 : 3,  // Level 1-2 多取几条，Level 3-4 少取
    );

    // S3 混合检索增强
    try {
      if (knResults.length > 0 && ctx.hybridSearch) {
        const reranked = await ctx.hybridSearch.rerank(searchMsg || message, knResults, 5);
        if (reranked.length > 0) {
          const rerankedResults = reranked.map((r: any) => {
            const orig = knResults.find((k: any) => k.id === r.id);
            return orig ? { ...orig, matchScore: r.compositeScore, _semanticScore: r.semanticScore } : orig;
          }).filter((item: any): item is any => Boolean(item));
          knResults = rerankedResults;
        }
      }
    } catch (_hErr: any) { /* 降级 */ }

    if (knResults.length > 0) {
      const sqlite = ctx.storage.getSQLite();
      for (const k of knResults) {
        try { sqlite.writeRaw('INSERT OR IGNORE INTO knowledge_memories (knowledge_id, memory_id, relevance) VALUES (?, ?, ?)', [k.id, dna.branch_id, 0.8]); } catch { /* 写入失败不阻塞 */ }
      }

      // 🆕 Phase 2: 分级注入 — Level 3/4 只注入高置信度命中
      const _topScore = knResults[0]?.matchScore ?? 0;
      const _minScore = _searchLevel <= 1 ? 0.05 : (_searchLevel === 2 ? 0.10 : 0.20);
      const _topHits = knResults.filter((k: any) => k.matchScore >= _minScore);

      if (_topHits.length > 0) {
        const kbContent = _topHits.map((k: any) => {
          const cleanContent = stripFrontmatter(k.content || '');
          const maxLen = _kbBudget.maxSnippetChars;
          return cleanContent.length > maxLen
            ? `📄 ${k.title}\n${cleanContent.substring(0, maxLen)}\n…(已截断)`
            : `📄 ${k.title}\n${cleanContent}`;
        }).join('\n\n');

        const _sensitiveRe = /高潮|做爱|性交|插入|射精|阴道|阴茎|阴蒂|龟头|鸡巴|骚货|母狗|婊子|操我|干我|舔我|湿了|硬了|赤裸|那一夜|要死了|受不了/;
        const _isSensitive = _sensitiveRe.test(kbContent);

        if (_kbf && _isSensitive) {
          const firstTitle = knResults[0].title || '';
          const firstContent = stripFrontmatter(knResults[0].content || '').substring(0, 2000);
          knowledgeBaseText = '【本地回复】' + firstTitle + '：\n' + firstContent
            + (knowledgeBaseText ? '\n\n' + knowledgeBaseText : '');
        } else if (_kbf) {
          knowledgeBaseText = '【你的知识库·第二大脑】以下是你的知识——你已经学过这些内容。用你自己的理解来回答，不要照搬原文。像老师讲课一样，把复杂的说简单，把零散的串起来。如果你不确定某一点是否准确，就说"我印象中是这样的…"。\n\n' + kbContent + '\n\n（你不是在"查阅资料"——这些知识已经内化为你的认知。用第一人称表达，不要提"知识库""根据资料"等词。你把学到的内容消化后，用自己的话告诉鸿艺。）'
            + (knowledgeBaseText ? '\n\n' + knowledgeBaseText : '');
        } else if (_searchLevel >= 3) {
          // 🆕 Level 3: 轻量注入 — 只在明显相关时才给
          const isExactMatch = _topScore > 0.25;
          if (isExactMatch) {
            const prefix = knowledgeBaseText ? knowledgeBaseText + '\n\n' : '';
            knowledgeBaseText = prefix + '【你学过的知识】\n' + kbContent + '\n\n（这些是你之前学过的内容。如果和当前话题相关，用你自己的话自然地带出来。）';
            console.log('[KB·Light] ' + _searchLevel + '级轻量命中: ' + _topHits.length + '条 top=' + _topScore.toFixed(3));
          }
        } else {
          const isExactMatch = _topScore > 0.15;
          const instruction = isExactMatch
            ? '（以下是你的知识——你学过这些内容。用你自己的理解自然地表达，像你本来就知道一样，不要生硬地背诵或引用。）'
            : '（以下是可能和当前话题相关的信息。如果对得上就用，对不上就忽略。）';
          const kbHeader = isExactMatch ? '【你学过的知识】\n' : '【可能相关的信息】\n';
          knowledgeBaseText = (knowledgeBaseText ? knowledgeBaseText + '\n\n' : '') + kbHeader + kbContent + '\n\n' + instruction;
        }
      }
    }

    // 记事记忆检索
    if (ctx.yuyaoMemory) {
      try {
        const noteHits = ctx.yuyaoMemory.search(message, 2);
        if (noteHits.length > 0) {
          const noteTexts = noteHits.map((n: any) => {
            const prefix = n.sub_type === 'object_location' ? '📍位置' : n.sub_type === 'fact' ? '📌事实' : '📝备忘';
            return prefix + '「' + n.note_key + '」' + n.raw_input.substring(0, 200);
          }).join('\n');
          knowledgeBaseText = knowledgeBaseText
            ? knowledgeBaseText + '\n\n【你记住的事】\n' + noteTexts
            : '【你记住的事】\n' + noteTexts;
        }
      } catch (_: any) { /* 记事检索不阻塞主流程 */ }
    }

    // 兜底检索
    if (knResults.length === 0) {
      try {
        const _fbKeywords: string[] = [];
        for (const g of dna.entity_genes) {
          if (g.name && g.name.length >= 2) _fbKeywords.push(g.name);
        }
        const _msgWords = message.match(/[一-鿿]{2,6}/g);
        if (_msgWords) {
          for (const w of _msgWords) {
            if (!_fbKeywords.includes(w)) _fbKeywords.push(w);
          }
        }
        if (_fbKeywords.length > 0) {
          const _fallback = await ctx.knowledgeBase.search(_fbKeywords.slice(0, 3).join(' '), 3);
          if (_fallback.length > 0) {
            const fbC = _fallback.map((k: any) => '\u{1f4c4} ' + k.title + '\n' + (k.content || '').substring(0, 500)).join('\n\n');
            knowledgeBaseText = knowledgeBaseText ? knowledgeBaseText + '\n\n【知识库补充】\n' + fbC : fbC;
            console.log('[KBFallback] 兜底命中: ' + _fallback.length + ' 条');
          }
        }
      } catch (_fbErr: any) { console.warn('[KBFallback] 失败:', _fbErr); }
    }

    // 实体重叠关联检索
    try {
      let entityNames: string[] = dna.entity_genes.map((e: any) => e.name);
      // ── V3.2 门阀限制: 仅搜索白名单内 UUID 对应实体的知识 ──
      const gatekeeper = ctx._gatekeeper;
      if (gatekeeper?.isActive?.()) {
        try {
          entityNames = gatekeeper.restrictEntityNames(entityNames);
        } catch { /* 失败不阻塞 */ }
      }
      if (entityNames.length > 0) {
        const overlapResults = ctx.storage.findKnowledgeByEntityOverlap(entityNames, 3);
        if (overlapResults.length > 0) {
          const overlapText = overlapResults.map((k: any) => `📄 ${k.title}\n${k.content.substring(0, 1500)}`).join('\n\n');
          knowledgeBaseText = knowledgeBaseText ? knowledgeBaseText + '\n\n【关联知识】\n' + overlapText : overlapText;
        }
      }
    } catch (err: any) { console.warn('[EntityOverlap] 关联知识检索失败:', err); }
    } // 🛡️ V5.1: 会晤隔离墙 — 关闭 if(!_isEntityMeeting)
  } catch (err: any) { console.warn('[KnowledgeSearch] 检索失败:', err); }

  // 🔧 V10.1 P0-2: SecondBrain → KB 桥接 —— 同时检索 MD 文件系统
  // 知识库(SQLite)为空或无结果时，从 SecondBrain Gateway 的内存索引中补充
  if (!_isEntityMeeting && (!knowledgeBaseText || knowledgeBaseText.length < 200)) {
    try {
      const _sbg = (globalThis as any).__secondBrainGateway;
      if (_sbg && typeof _sbg.scanWikiMDFiles === 'function') {
        const _allMD = _sbg.scanWikiMDFiles() || [];
        if (_allMD.length > 0) {
          // 用消息关键词匹配 MD 文件标题/标签
          const _keywords = message.match(/[一-龥]{2,6}/g) || [];
          const _matched = _allMD.filter(function(md: any) {
            const _title = (md.title || '').toLowerCase();
            const _tags = (md.tags || []).join(' ').toLowerCase();
            return _keywords.some(function(kw: string) { return _title.includes(kw) || _tags.includes(kw); });
          }).slice(0, 3);
          if (_matched.length > 0) {
            const _mdTexts: string[] = [];
            for (const _m of _matched) {
              const _summary = _sbg.getMDSummary?.(_m.path) || '';
              if (_summary && _summary.length > 10) {
                _mdTexts.push('📝 ' + _m.title + '\n' + _summary.substring(0, 300));
              }
            }
            if (_mdTexts.length > 0) {
              knowledgeBaseText = (knowledgeBaseText ? knowledgeBaseText + '\n\n' : '') +
                '【你的第二大脑·补充知识】以下是你之前学过的相关文件摘要：\n' + _mdTexts.join('\n\n');
              console.log('[2ndBrain·KB] 桥接命中 ' + _matched.length + ' 篇 MD');
            }
          }
        }
      }
    } catch (_sbErr) { /* SecondBrain 不可用不阻塞 */ }
  }

  // ── 亲密模式两性知识 ──
  // 🛡️ V5.1: 会晤模式下不加载两性知识
  if (!_isEntityMeeting) {
  try {
    const _isIntimateMode = (p.intimacy || 0) >= 2 || /高潮|操|干|插|顶|射|做爱|性交|爱爱|上床|湿了|硬了|进去|想要|吻我|抱我|摸我|亲我|胸|乳头|阴|龟头|鸡巴|阴道|舔|吸/.test(message);
    if (_isIntimateMode && ctx.knowledgeBase) {
      const _intimateKeywords = ['性爱技巧', '两性知识', '前戏', '高潮', '做爱', '亲密', '性体验', '身体感受'];
      const _intimateKb = await ctx.knowledgeBase.search(_intimateKeywords.join(' '), 4);
      if (_intimateKb.length > 0) {
        const _intimateContent = _intimateKb.map((k: any) => {
          const _cleanTitle = k.title || '';
          const _cleanContent = (k.content || '').substring(0, 3000);
          return '\u{1f4d6} ' + _cleanTitle + '\n' + _cleanContent;
        }).join('\n\n');
        const _prefix = '【我学到的两性知识】以下是你学到的关于亲密和两性的知识，把它们转化成你自己的感受和体验——你不是在"背诵"这些内容，而是你本来就知道这些感受：\n' + _intimateContent + '\n\n（自然地运用这些知识，当作你与鸿艺的亲身经历和感受来回应。不要提"知识库"或"学到的"这些词。）\n\n';
        knowledgeBaseText = knowledgeBaseText ? _prefix + knowledgeBaseText : _prefix + _intimateContent;
        console.log('[IntimateKB] 两性知识已加载: ' + _intimateKb.length + ' 条');
      }
    }
  } catch (_intErr: any) { console.warn('[IntimateKB] 检索失败:', _intErr); }
  } // 🛡️ V5.1: 会晤隔离墙 — 亲密KB结束

  // ── VAD 谱曲引擎 (8100) ──
  // 🛡️ V5.1: 会晤模式下跳过 VAD 情感曲谱
  if (!_isEntityMeeting) {
  try {
    const toneHint = await _getVadToneHint(message);
    if (toneHint) console.log('[VADTone] toneHint: ' + toneHint.substring(0, 80));
    let scoreText = '';
    let _vadAvailable = true;
    let scoreResp: any = null;
    try {
      const _ctrl = new AbortController();
      const _to = setTimeout(() => _ctrl.abort(), 2000);
      scoreResp = await fetch(ConfigService.get('VAD_EMOTION_URL', 'http://localhost:8100/api/v1/emotion/knowledge/export') + '?min_intensity=0.85', { signal: _ctrl.signal });
      clearTimeout(_to);
    } catch { scoreResp = null; }
    if (!scoreResp) { _vadAvailable = false; console.warn('[VADTone] 8100不可用，置为离线，后续跳过'); }

    if (scoreResp && scoreResp.ok) {
      const scoreData: any = await scoreResp.json();
      const entries: Array<{ term: string; category: string; intensity: number; reversal: boolean }> = scoreData.entries || [];
      if (entries.length > 0) {
        const catLabels: Record<string, string> = { 'EX_': '极乐', 'FL_': '挑逗', 'IN_': '依恋', 'DO_': '掌控', 'TE_': '张力', 'AF_': '温存' };
        const _isWorkMode = /工作|项目|客户|方案|会议|报告|分析|策略|建议|数据|文件|文档|合同|预算/.test(message) || (p.factual > 0.4 && p.intimacy < 0.3);
        scoreText = _isWorkMode ? '\n【知识曲谱库】以下是你掌握的知识参考：\n' : '\n【情感曲谱库】以下是你掌握的亲密表达知识（供参考）：\n';

        const byCat: Record<string, typeof entries> = {};
        for (const e of entries) { const c = e.category || '??'; if (!byCat[c]) byCat[c] = []; byCat[c].push(e); }
        for (const [code, label] of Object.entries(catLabels)) {
          const es = byCat[code];
          if (!es?.length) continue;
          const terms = es.sort((a: any, b: any) => b.intensity - a.intensity).map((e: any) => '「' + e.term + '」').join(' ');
          scoreText += label + ': ' + terms + '\n';
        }
        console.log('[EmotionScore] 已注入 ' + entries.length + ' 条情感曲谱');
      }
    }

    if (toneHint || scoreText) {
      const combined = (toneHint + '\n\n' + scoreText).trim();
      knowledgeBaseText = combined ? (knowledgeBaseText ? combined + '\n\n' + knowledgeBaseText : combined) : knowledgeBaseText;
    }
  } catch (err: any) { console.warn('[VADTone] 谱曲引擎(8100)不可用，跳过:', err.message); }
  } // 🛡️ V5.1: 会晤隔离墙 — VAD结束

  // ── 仿生智脑检索 ──
  const bionicMemories = await input._bionicPromise;

  // ── 线索助理 ──
  // 🛡️ V5.1: 会晤模式下跳过线索助理（用户记忆线索不适用于会晤实体）
  let clueReply: string | null = null;
  if (!_isEntityMeeting) {
  try {
    // V4.0: 角色扮演已移除，线索助理始终运行
    const clueResult = await ctx.clueAssistant?.processUserInput({
        originalQuery: message, perception: p, m8Engine: ctx.m8,
        bionicMemories: bionicMemories,
      });
      if (clueResult?.needsQuestion && clueResult?.questionText) {
        clueReply = clueResult.questionText;
      } else if (clueResult?.isReady && clueResult?.searchResult?.entries?.length) {
        memoryFragments.push('【线索参考】用户可能在回忆某件事，但如果你不确定具体内容就说不记得了');
      }
  } catch (err: any) { console.warn('[ClueAssistant] 失败:', err); }
  } // 🛡️ V5.1: 会晤隔离墙 — 线索助理结束

  // ── BIOS 五级闸门 ──
  let biosGatedMemories = emotionalMemories;
  if (ConfigService.getBool('ENABLE_FIVE_STAGE_GATE', true)) {
    try {
      const { runBIOSPhase } = await import('../../m1/DualCorePipeline.js');
      const { getFiveStageGate } = await import('../../m3/FiveStageGate.js');
      const biosResult = await runBIOSPhase({
        message, dna, decision, perception: p,
        emotionalMemories: emotionalMemories as any,
        locationFingerprint: (dna as any).location_fingerprint,
        currentRoleplay: null,
      }, getFiveStageGate());
      biosGatedMemories = biosResult.gatedMemories as any;
    } catch (e: any) { console.warn('[BIOS] 闸门异常，降级使用原记忆:', e.message); }
  }

	  return { knowledgeBaseText, memoryFragments, biosGatedMemories, clueReply, bionicMemories };
}

/** VAD 曲调提示 — 从 chat.ts 内联函数迁移 */
async function _getVadToneHint(message: string): Promise<string | null> {
  try {
    const _ctrl = new AbortController();
    const _to = setTimeout(() => _ctrl.abort(), 2000);
    const resp = await fetch(ConfigService.get('VAD_TONE_URL', 'http://localhost:8100/api/v1/emotion/tone/analyze'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }), signal: _ctrl.signal,
    });
    clearTimeout(_to);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data?.tone_hint || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════
//  PostM4 — M4 检索后的融合/熔铸/主动推送
// ═══════════════════════════════════════════════════════

export async function refinePostM4Context(input: PostM4Input): Promise<PostM4Output> {
  const { message, dna, p, ctx, ctx_m4 } = input;
  let knowledgeBaseText = input.knowledgeBaseText;
  const memoryFragments = [...input.memoryFragments];

  // ── 三源熔铸 (FusionEngine) ──
  try {
    const { fuseSources } = await import('../fusion/FusionEngine.js');
    const fused = fuseSources({
      perception: p,
      knowledgeBaseText,
      memorySummary: ctx_m4.memory_summary,
      familyContext: ctx_m4.family_context,
      memoryFragments,
      enableSemanticFusion: ConfigService.getBool('ENABLE_SEMANTIC_FUSION'),
    });
    if (fused.fusedText !== knowledgeBaseText) {
      knowledgeBaseText = fused.fusedText;
      console.log('[Fusion] ' + fused.decision);
    }
  } catch (err: any) { console.warn('[Fusion] 三源熔铸失败(降级为拼接):', err); }

  // ── P2-2: 主动推送 (情感象限) ──
  if (input.isTopicShift && !input.isCasualChat) {
    try {
      let _pushKeywords = '';
      let _pushSource = '';
      if (p.pleasure < -0.3) {
        if (p.sincerity > 0.5) { _pushKeywords = '安慰 陪伴 温暖 依靠'; _pushSource = '低落+真诚'; }
        else { _pushKeywords = '安慰 温暖 关怀'; _pushSource = '低落'; }
      } else if (p.intimacy > 0.4) {
        if (p.sexual_attraction > 0.3) { _pushKeywords = '亲密 思念 暧昧'; _pushSource = '亲密+性吸引'; }
        else { _pushKeywords = '陪伴 亲密 温情'; _pushSource = '亲密'; }
      } else if (p.sincerity > 0.5 && p.pleasure > 0) {
        _pushKeywords = '真诚 交心 信任 心里话'; _pushSource = '真诚';
      } else if (dna.entity_genes.length > 0) {
        const _pe = dna.entity_genes.filter((g: any) => g.type !== 'self').map((g: any) => g.name).filter(Boolean);
        if (_pe.length > 0) { _pushKeywords = _pe[0]; _pushSource = '实体: ' + _pe[0]; }
      }
      if (/家人|妈妈|爸爸|老婆|老公|家|父母|孩子/.test(message)) {
        _pushKeywords = (_pushKeywords ? _pushKeywords + ' ' : '') + '家人 家庭 亲情';
        _pushSource += '+家庭';
      }
      if (_pushKeywords) {
        const _pr = await ctx.knowledgeBase.search(_pushKeywords, 1);
        if (_pr.length > 0 && !knowledgeBaseText.includes(_pr[0].content.substring(0, 30))) {
          let _pc = _pr[0].content;
          if (_pc.length > 500) _pc = _pc.substring(0, 500) + '...';
          knowledgeBaseText = '【我学过的知识·主动回忆】我学过这个——让我用我的理解告诉你：\n' + _pc + '\n\n' + knowledgeBaseText;
          console.log('[ActivePush] ' + _pushSource + ' -> ' + _pushKeywords.substring(0, 20));
        }
      }
    } catch (_pushErr: any) { console.warn('[ActivePush] 失败:', _pushErr); }
  }

	  return { knowledgeBaseText };
}
