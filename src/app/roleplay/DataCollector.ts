/**
 * DataCollector — 角色扮演域·全量数据采集器（第一步）
 *
 * 职责：单次、并行、全量收集所有相关数据，输出结构化数据包供就绪门/装配器使用。
 * 所有采集并行执行，3 秒超时兜底，任一来源失败不影响其他来源。
 */
import type { CollectedData, UserIntent, DomainContext, CharacterClass } from './types.js';
import type { FamilyGraphRoleBranch } from '../alignment/FamilyGraphRoleBranch.js';
import { scanContextForCharacter } from './CharacterProfileScanner.js';
import { PerspectiveFilter } from './PerspectiveFilter.js';

const COLLECT_TIMEOUT = 3000;

/** 意图分类（纯规则，零 LLM） */
export function classifyIntent(message: string): UserIntent {
  if (/谁|名字|叫.*什么|哪个人/.test(message)) return 'ask_person';
  if (/多大了|几岁|你多大|你几岁|年龄|年纪/.test(message)) return 'ask_age';
  if (/说说你自己|讲讲你自己|你是什么样的人|你的故事|介绍一下你自己|说说你的事/.test(message)) return 'ask_background';
  if (/是谁|怎么样|在哪|做什么|什么样/.test(message)) return 'ask_relation';
  return 'chat';
}

/**
 * 全量数据采集
 * 所有来源并行执行，3 秒超时。
 */
export async function collectData(
  ctx: DomainContext,
  message: string,
  roleplay: string,
  characterClass: CharacterClass,
  currentRPBranch: FamilyGraphRoleBranch | null,
): Promise<CollectedData> {
  const intent = classifyIntent(message);

  const withTimeout = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>(r => setTimeout(() => r(fallback), COLLECT_TIMEOUT)),
    ]);

  // ── 并行采集 ──
  const [fgData, kbData, histData, entities] = await Promise.all([
    withTimeout(collectFG(ctx, roleplay, currentRPBranch), {
      branch: currentRPBranch, treeText: '', rootProfile: null, familyMembers: [],
    }),
    withTimeout(collectKB(ctx, message, roleplay, characterClass), []),
    withTimeout(loadPastHistory(ctx, roleplay), []),
    withTimeout(resolveEntities(ctx, message, roleplay, currentRPBranch), { entities: [], kinshipTerms: [], pronounTarget: null }),
  ]);

  // ── 画像（如果有缓存就不重新构建） ──
  let portrait: string | null = null;

  // ── 已知字段汇总 ──
  // 🔴 年龄检查三源：FG.profile.age > 家族树文本 > 对话历史
  const _ageInFg = fgData.rootProfile?.age ? true : /(\d+)岁/.test(fgData.treeText);
  // 从对话历史中检查该角色的年龄（"诗韵才14岁""诗韵今年14"等）
  let _ageInHistory = false;
  if (!_ageInFg) {
    const _histText = histData.map(h => h.content).join(' ');
    try {
      // 优先精确匹配：角色名+数字+岁
      if (new RegExp(roleplay + '.*?(\\d{1,2})岁').test(_histText)) _ageInHistory = true;
      // 其次宽泛匹配：上下文中只要出现角色名 + 任意"数字岁"组合
      else if (/才(\d{1,2})岁|今年(\d{1,2})岁|已经(\d{1,2})岁|(\d{1,2})岁了/.test(_histText) && _histText.includes(roleplay)) {
        _ageInHistory = true;
      }
    } catch (_) {}
  }
  const knownFields = {
    hasAge: _ageInFg || _ageInHistory,
    hasRelations: fgData.familyMembers.length > 0,
    hasAppearance: false,
    hasOccupation: false,
    hasPersonality: false,
    askedPersonFound: false,
  };

  // askedPersonFound：排除亲属称呼后，检查是否有实体在 FG/KB 中有实际数据
  const _realEntities = entities.entities.filter(e => !/姐姐|妹妹|哥哥|弟弟|妈妈|爸爸|奶奶|爷爷|老婆|老公|阿姨|叔叔/.test(e));
  knownFields.askedPersonFound = _realEntities.some(e =>
    fgData.familyMembers.includes(e) || kbData.some(k => k.title.includes(e) || k.content.includes(e))
  );

  return {
    fg: fgData,
    kb: kbData,
    history: histData,
    portrait,
    context: {
      message,
      entities: entities.entities,
      kinshipTerms: entities.kinshipTerms,
      pronounTarget: entities.pronounTarget,
      intent,
    },
    knownFields,
  };
}

// ── 家族图谱采集 ──

async function collectFG(
  ctx: DomainContext,
  roleplay: string,
  currentRPBranch: FamilyGraphRoleBranch | null,
): Promise<CollectedData['fg']> {
  if (!ctx.m4) return { branch: currentRPBranch, treeText: '', rootProfile: null, familyMembers: [] };

  let treeText = '';
  let rootProfile: Record<string, any> | null = null;
  let familyMembers: string[] = [];
  const familyProfiles: Record<string, Record<string, any>> = {};

  if (currentRPBranch) {
    treeText = currentRPBranch.getFamilyTreeText?.() || '';
    familyMembers = currentRPBranch.getAllNames?.() || [];
  }

  // 从主 FG 取角色本人 + 所有家族成员的画像
  try {
    const fg = ctx.m4.getFamilyGraph?.();
    if (fg) {
      // 角色本人
      const p = fg.getPersonProfile?.(roleplay);
      if (p) rootProfile = p;

      // 🔴 所有家族成员：加载 age/occupation/appearance/traits 等字段
      for (const _name of familyMembers) {
        if (_name === roleplay || _name === '我') continue;
        try {
          const _profile = fg.getPersonProfile?.(_name);
          if (_profile) {
            // 只保留有数据价值的字段
            const _compact: Record<string, any> = {};
            if (_profile.age) _compact.age = _profile.age;
            if (_profile.occupation) _compact.occupation = _profile.occupation;
            if (_profile.appearance) _compact.appearance = _profile.appearance;
            if (_profile.traits?.length) _compact.traits = _profile.traits;
            if (_profile.personality) _compact.personality = _profile.personality;
            if (_profile.relation_to_user) _compact.relation = _profile.relation_to_user;
            if (_profile.description) _compact.description = _profile.description;
            if (Object.keys(_compact).length > 0) {
              familyProfiles[_name] = _compact;
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  return { branch: currentRPBranch, treeText, rootProfile, familyMembers, familyProfiles };
}

// ── 知识库采集 ──

async function collectKB(
  ctx: DomainContext,
  message: string,
  roleplay: string,
  characterClass: CharacterClass,
): Promise<Array<{ title: string; content: string }>> {
  if (!ctx.knowledgeBase) return [];

  const results: Array<{ title: string; content: string }> = [];

  // 搜索角色名
  try {
    const hits = await ctx.knowledgeBase.search(roleplay, 3);
    if (hits.length > 0 && characterClass) {
      const filtered = PerspectiveFilter.apply({
        results: hits, roleName: roleplay, characterClass,
        age: null, knownEntities: [roleplay],
      });
      results.push(...filtered.filtered);
    } else {
      results.push(...hits);
    }
  } catch (_) {}

  // 额外搜索当前消息中的人名实体
  const names = message.match(/[一-龥]{2,4}(?=[，。！？\s]|的|了|是|有|在|说)/g) || [];
  for (const n of [...new Set(names)]) {
    if (n === roleplay || n === '我') continue;
    try {
      const hits = await ctx.knowledgeBase.search(n, 2);
      for (const h of hits) {
        if (!results.find(r => r.title === h.title)) results.push(h);
      }
    } catch (_) {}
  }

  return results;
}

// ── 历史对话采集 ──

async function loadPastHistory(
  ctx: DomainContext,
  roleplay: string,
): Promise<Array<{ role: string; content: string }>> {
  if (!ctx.conversationDB?.searchByRoleplay) return [];

  try {
    const rows = ctx.conversationDB.searchByRoleplay(roleplay, 20);
    return rows?.map((r: any) => ({ role: r.role, content: r.content })) || [];
  } catch (_) {
    return [];
  }
}

// ── 实体解析（DNA + 亲属 + 代词） ──

async function resolveEntities(
  ctx: DomainContext,
  message: string,
  roleplay: string,
  currentRPBranch: FamilyGraphRoleBranch | null,
): Promise<{ entities: string[]; kinshipTerms: string[]; pronounTarget: string | null }> {
  const entities: string[] = [];
  const kinshipTerms: string[] = [];
  let pronounTarget: string | null = null;

  // DNA 实体
  if (ctx.dna?.entity_genes) {
    for (const g of ctx.dna.entity_genes) {
      if (g.type === 'person' && g.name !== '我' && g.name !== roleplay && !entities.includes(g.name)) {
        entities.push(g.name);
      }
    }
  }

  // FG 亲属解析
  if (currentRPBranch && /妈妈|妈|爸爸|爸|姐姐|妹妹|哥哥|弟弟|老婆|老公/.test(message)) {
    for (const kw of ['妈妈','妈','爸爸','爸','母亲','父亲','姐姐','妹妹','哥哥','弟弟','老婆','老公']) {
      if (message.includes(kw)) {
        kinshipTerms.push(kw);
        const resolved = currentRPBranch.resolveKinship(kw);
        for (const rn of resolved) {
          if (!entities.includes(rn)) entities.push(rn);
        }
      }
    }
  }

  // 代词解析：纯亲属称呼 → 查历史
  const onlyRel = entities.length > 0 && entities.every(e => /姐姐|妹妹|哥哥|弟弟|妈妈|爸爸/.test(e));
  if ((entities.length === 0 || onlyRel) && (/[她他]/.test(message) || onlyRel)) {
    const recent = ctx.conversationHistory.slice(-5).filter(t => t.role === 'user').map(t => t.content).join(' ');
    const names = recent.match(/[一-龥]{2,4}(?=[，。！？\s]|的|了|是|有|在|说)/g) || [];
    const real = (names as string[]).find(n =>
      n !== roleplay && n !== '我' && n.length >= 2 && !/姐姐|妹妹|哥哥|弟弟|妈妈|爸爸/.test(n)
    );
    if (real) {
      entities.push(real);
      pronounTarget = real;
    }
  }

  return { entities, kinshipTerms, pronounTarget };
}
