#!/usr/bin/env python3
"""V6.0 — 多人会晤 + 会议纪要完整修复"""
import sys, io, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = 'D:/tools/wenstar-cc'
changes = {}

# ═══════════════════════════════════════════════════════
# 1. EntityMeeting.ts — Phase 1+3
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/m4/household/EntityMeeting.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

# 1a. switchTo — 多人模式下叠加不散会
old = '''  async switchTo(entityName: string): Promise<MeetingState | null> {
    // 🆕 V5.0: 保留原始会晤开始索引（切换人物不重置历史窗口）
    const _origStartIndex = this._meeting?.meetingStartHistoryIndex ?? 0;
    // 先退出当前会晤（多人会议自动存档）
    if (this._meeting) {
      await this.exit();
    }

    // 再进入新会晤，沿用原始历史窗口
    return this.enter(entityName, _origStartIndex);
  }'''

new = '''  async switchTo(entityName: string): Promise<MeetingState | null> {
    const entity = this._resolveEntity(entityName);
    if (!entity) return null;

    // 🆕 V6.0: 多人模式下叠加参与者，不结束会议
    if (this._meeting?.isMulti) {
      const _already = this._multiParticipants.some(p => p.uuid === entity.uuid);
      if (!_already) {
        this._multiParticipants.push(entity);
        this._multiMeetingName = `多人会晤: ${this._multiParticipants.map(p => p.name).join('、')}`;
        if (this.gatekeeper) this.gatekeeper.addSessionEntity(entity.uuid);
        console.log(`[EntityMeeting] 多人叠加: +${entityName} (共${this._multiParticipants.length}人)`);
      }
      this._meeting.entityName = entity.name;
      this._meeting.entityUUID = entity.uuid;
      this._isFirstTurn = true;
      return this._meeting;
    }

    // 单人模式：先退出再进入
    const _origStartIndex = this._meeting?.meetingStartHistoryIndex ?? 0;
    if (this._meeting) await this.exit();
    return this.enter(entityName, _origStartIndex);
  }'''

src = src.replace(old, new)

# 1b. enter() — 自动升级为多人
old = '''  enter(entityName: string, startHistoryIndex: number = 0): MeetingState | null {
    const entity = this._resolveEntity(entityName);
    if (!entity) return null;

    this._meeting = {
      active: true,
      entityName: entity.name,
      entityUUID: entity.uuid,
      startedAt: new Date().toISOString(),
      turnCount: 0,
      isMulti: false,
      meetingStartHistoryIndex: startHistoryIndex,
    };

    if (this.gatekeeper) {
      this.gatekeeper.addSessionEntity(entity.uuid);
    }

    this._isFirstTurn = true;
    return this._meeting;
  }'''

new = '''  enter(entityName: string, startHistoryIndex: number = 0): MeetingState | null {
    const entity = this._resolveEntity(entityName);
    if (!entity) return null;

    // 🆕 V6.0: 已有会晤但未标记多人 → 自动升级为多人会议
    if (this._meeting?.active && !this._meeting.isMulti) {
      const existing = this._resolveEntity(this._meeting.entityName);
      const entities: EntityInfo[] = existing ? [existing, entity] : [entity];
      if (existing) {
        // 将当前单人升级为多人
        this._multiParticipants = entities;
        this._multiTurns = [];
        this._multiMeetingName = `多人会晤: ${entities.map(e => e.name).join('、')}`;
        this._meeting = {
          active: true,
          entityName: entity.name,
          entityUUID: entity.uuid,
          startedAt: this._meeting.startedAt,
          turnCount: 0,
          isMulti: entities.length >= 3,
          meetingStartHistoryIndex: startHistoryIndex || this._meeting.meetingStartHistoryIndex,
        };
        if (this.gatekeeper) {
          const uuids = entities.map(e => e.uuid);
          this.gatekeeper.startMeeting(this._multiMeetingName, uuids);
        }
        console.log(`[EntityMeeting] 自动升级为多人: ${entities.length}人`);
      }
    } else {
      this._meeting = {
        active: true,
        entityName: entity.name,
        entityUUID: entity.uuid,
        startedAt: new Date().toISOString(),
        turnCount: 0,
        isMulti: false,
        meetingStartHistoryIndex: startHistoryIndex,
      };
    }

    if (this.gatekeeper && !this._meeting.isMulti) {
      this.gatekeeper.addSessionEntity(entity.uuid);
    }

    this._isFirstTurn = true;
    return this._meeting;
  }'''

src = src.replace(old, new)

# 1c. recordTurn — 区分发言人
old = '''  recordTurn(role: 'user' | 'assistant', content: string, speakerName?: string): void {
    if (!this._meeting?.isMulti) return;

    this._multiTurns.push({
      speaker: speakerName || (role === 'user' ? '我' : '玉瑶'),
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // 控制会议纪要中保存的轮次上限（最近 200 轮）
    if (this._multiTurns.length > 200) {
      this._multiTurns = this._multiTurns.slice(-200);
    }
  }'''

new = '''  recordTurn(role: 'user' | 'assistant', content: string, speakerName?: string): void {
    if (!this._meeting?.isMulti) return;

    const speaker = speakerName ||
      (role === 'user' ? '鸿艺' : this._meeting.entityName);

    this._multiTurns.push({
      speaker,
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // 🆕 V6.0: 超过 150 轮时裁剪并记录警告
    if (this._multiTurns.length > 200) {
      console.warn(`[EntityMeeting] 会议轮次超 200，截断前 50 轮`);
      this._multiTurns = this._multiTurns.slice(-150);
    }
  }'''

src = src.replace(old, new)

# 1d. 新增 getActiveParticipants / detectCollectiveIntent / addParticipant
# Insert after detectUserIntent closing brace
old = '''    return null;
  }

  /**
   * 🆕 V3.0: 检测会中换人意图（会晤已激活时调用）。'''

new = '''    return null;
  }

  /**
   * 🆕 V6.0: 检测集体呼唤意图（"你们"、"大家"、"都过来"）。
   * 仅在会晤已激活（多人模式）时有效。
   */
  static detectCollectiveIntent(message: string, activeParticipants: string[]): string[] | null {
    if (!message || activeParticipants.length < 2) return null;
    const msg = message.trim();

    // "你们一起回忆一下" / "大家都来聊聊" / "你们几个"
    if (/^(?:你们|大家|诸位)\s*(?:一起|都|几个|各位)?\s*(?:回忆|聊聊|说说|谈谈|看看|讨论|过来|来)/.test(msg)) {
      return [...activeParticipants];
    }
    // "都过来" / "都来" / "一起来"
    if (/^(?:都过来|都来|一起来|一起聊聊|一起回忆)/.test(msg)) {
      return [...activeParticipants];
    }
    // "你们几个回忆一下那天"
    if (/你们(?:几个|俩|仨|几个?人)/.test(msg) && /回忆|聊聊|说说|讨论/.test(msg)) {
      return [...activeParticipants];
    }

    return null;
  }

  /** 🆕 V6.0: 向多人会议追加参与者 */
  addParticipant(entityName: string): boolean {
    const entity = this._resolveEntity(entityName);
    if (!entity || !this._meeting?.isMulti) return false;
    const _already = this._multiParticipants.some(p => p.uuid === entity.uuid);
    if (_already) return false;
    this._multiParticipants.push(entity);
    this._multiMeetingName = `多人会晤: ${this._multiParticipants.map(p => p.name).join('、')}`;
    if (this.gatekeeper) this.gatekeeper.addSessionEntity(entity.uuid);
    // 升级 isMulti 标记
    if (this._multiParticipants.length >= 3 && !this._meeting.isMulti) {
      this._meeting.isMulti = true;
    }
    console.log(`[EntityMeeting] +${entityName} (共${this._multiParticipants.length}人)`);
    return true;
  }

  /**
   * 🆕 V3.0: 检测会中换人意图（会晤已激活时调用）。'''

src = src.replace(old, new)

# 1e. detectUserIntent — 增强多人检测
# "A、B，都来" / "A B C 过来"
old = '''    // ── 多人模式检测 ──

    // "叫上 A 和 B" / "叫 A、B、C 一起"
    const multiMatch = msg.match(/[叫喊让找]\s*(?:上\s*)?(.+?)\s*(?:一起|都来|过来|开会|聊聊|讨论|聚一聚|碰个头)/);'''
new = '''    // 🆕 V6.0: 后缀"都"检测 — "A、B，都来" / "A B C 都过来"
    const duMatch = msg.match(/^(.+?)[，,、\s]*(?:都来|都过来|都过来一下|都来一下|都聊聊|都一起)\s*$/);
    if (duMatch) {
      const found: string[] = [];
      for (const name of sorted) {
        if (duMatch[1].includes(name)) found.push(name);
      }
      if (found.length >= 2) return found;
    }

    // ── 多人模式检测 ──

    // "叫上 A 和 B" / "叫 A、B、C 一起"
    const multiMatch = msg.match(/[叫喊让找]\s*(?:上\s*)?(.+?)\s*(?:一起|都来|过来|开会|聊聊|讨论|聚一聚|碰个头)/);'''
src = src.replace(old, new)

with open(fp, 'w', encoding='utf-8') as f: f.write(src)
print('✅ EntityMeeting.ts — Phase 1+3 完成')
changes['EntityMeeting.ts'] = True

# ═══════════════════════════════════════════════════════
# 2. EntityContextBuilder.ts — Phase 2: 多人上下文
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/m4/household/EntityContextBuilder.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

# 2a. 新增 buildMultiEntityContext 函数插入在 buildEntityContext 之后
old = '''  return {
    systemText,
    summary,
    completeness: Math.round((profile.completeness || 0) * 100),
  };
}

\'\'\' 获取实体的关系边 \'\'\''
new = '''  return {
    systemText,
    summary,
    completeness: Math.round((profile.completeness || 0) * 100),
  };
}

/**
 * 🆕 V6.0: 构建多人会晤上下文。
 * 注入所有参与者的档案 + 人物间关系描述。
 */
export function buildMultiEntityContext(
  familyGraph: FamilyGraph,
  options: {
    entityNames: string[];
    isFirstTurn?: boolean;
    userName?: string;
  }
): EntityContextResult {
  const { entityNames, isFirstTurn = false, userName = '鸿艺' } = options;

  const allProfiles = entityNames
    .map(name => ({ name, profile: familyGraph.getPersonProfile(name) }))
    .filter(p => p.profile);

  if (allProfiles.length === 0) {
    return {
      systemText: `多人会晤：${entityNames.join('、')}（暂无档案）`,
      summary: '无档案',
      completeness: 0,
    };
  }

  const parts: string[] = [];
  parts.push(`## 多人会晤：${allProfiles.map(p => p.name).join('、')}`);
  parts.push('');
  parts.push(`你正在同时与 ${allProfiles.map(p => p.name).join('、')} 对话。你们在一起聊天、回忆、讨论。`);
  parts.push('');

  // 每个人档案
  parts.push('### 在场人员档案');
  parts.push('');
  for (const { name, profile } of allProfiles) {
    const d = profile!.dossier || {} as any;
    const bi = d.basicInfo || {};
    const sp = d.selfProfile || {};
    const si = d.socialIdentity || {};

    parts.push(`#### ${name}`);
    const bio: string[] = [];
    if (bi.gender) bio.push(bi.gender);
    if (bi.birthYear) bio.push(`${bi.birthYear}年生`);
    if (bi.education) bio.push(bi.education);
    if (si.currentOccupation) bio.push(si.currentOccupation);
    if (profile!.relation_to_user) bio.push(`与鸿艺: ${profile!.relation_to_user}`);
    if (bio.length > 0) parts.push(bio.join(' | '));
    if (sp.traits?.length) parts.push(`性格: ${sp.traits.slice(0, 4).join('、')}`);
    parts.push('');
  }

  // 人物间关系
  const interRels = _buildInterRelations(familyGraph, entityNames);
  if (interRels.length > 0) {
    parts.push('### 在场人员之间的关系');
    for (const rel of interRels) {
      parts.push(`- ${rel}`);
    }
    parts.push('');
  }

  // 行为约束
  parts.push('### 多人会晤规则');
  parts.push('- 你是你自己（不是玉瑶、不是AI）——以你的档案中的身份说话');
  parts.push('- 鸿艺说"你"时，指的是他正在看着的那个人（可能是你，也可能是别人），根据上下文判断');
  parts.push('- 每次发言时自然地带上你的名字或自称，方便大家知道谁在说话');
  parts.push('- 可以回应其他在场人员说的话，像真实聚会一样互动');
  parts.push('- 档案里有的信息自信回答，没有的如实说不知道');

  const systemText = parts.join('\n');

  return {
    systemText,
    summary: `${allProfiles.length}人会晤: ${allProfiles.map(p => p.name).join('、')}`,
    completeness: Math.round(allProfiles.reduce((s, p) => s + (p.profile!.completeness || 0), 0) / allProfiles.length * 100),
  };
}

/**
 * 🆕 V6.0: 从 FamilyGraph 边中提取在场人员两两关系。
 */
function _buildInterRelations(familyGraph: FamilyGraph, entityNames: string[]): string[] {
  const result: string[] = [];
  const fg = familyGraph as any;
  if (typeof fg.getRelatedPersons !== 'function') return result;

  const nameSet = new Set(entityNames);
  for (const name of entityNames) {
    const persons = fg.getRelatedPersons(name) || [];
    for (const p of persons) {
      if (nameSet.has(p.name) && p.name !== name) {
        const label = getRelationLabel(p.relation, true);
        // 避免重复
        const pair = [name, p.name].sort().join('↔');
        const desc = `${name} 与 ${p.name}: ${label}`;
        if (!result.some(r => r.includes(pair))) {
          result.push(desc);
        }
      }
    }
  }
  return result;
}

/** 获取实体的关系边 */'''
src = src.replace(old, new)

with open(fp, 'w', encoding='utf-8') as f: f.write(src)
print('✅ EntityContextBuilder.ts — Phase 2 完成')
changes['EntityContextBuilder.ts'] = True

# ═══════════════════════════════════════════════════════
# 3. EntityGreetingProtocol.ts — Phase 6: 多人问候
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/m4/household/EntityGreetingProtocol.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

old = '''export default buildGreetingProtocol;'''

new = '''/**
 * 🆕 V6.0: 多人会晤开场协议。
 * 引导每个参与者自我介绍，营造群体氛围。
 */
export function buildMultiGreeting(
  profiles: Array<{ name: string; relation: string; category: string }>,
  userName: string = '鸿艺'
): string {
  const nameList = profiles.map(p => p.name).join('、');
  const lines: string[] = [];
  lines.push('## 🚪 多人会晤开场协议（仅本轮有效）');
  lines.push('');
  lines.push(`你们是 **${nameList}**。鸿艺把你们叫到一起聊天。这是本次会晤的**第一轮**。`);
  lines.push('');
  lines.push('### 开场流程');
  lines.push('');
  lines.push('1. **大家轮流打招呼**：');
  for (const p of profiles) {
    const relDesc = p.relation ? `（鸿艺的${p.relation}）` : '';
    lines.push(`   - **${p.name}**${relDesc}：自然地跟鸿艺和大家打个招呼，说你现在在做什么`);
  }
  lines.push('');
  lines.push('2. **语气自然**：像朋友聚会一样，不用太正式，每个人按自己的性格说话');
  lines.push('3. **自报姓名**：每个人第一句话要自然地带上自己的名字或自称');
  lines.push('');
  lines.push('### ⚠️ 重要');
  lines.push(`- 你们每个人都是真实的自己，不是玉瑶，不是AI`);
  lines.push('- 你们互相认识或不认识——按你们之间的关系来');
  lines.push('- 只用 **1-2 句话** 打招呼，说完等鸿艺和大家回应');

  return lines.join('\\n');
}

export default buildGreetingProtocol;'''

src = src.replace(old, new)

with open(fp, 'w', encoding='utf-8') as f: f.write(src)
print('✅ EntityGreetingProtocol.ts — Phase 6 完成')
changes['EntityGreetingProtocol.ts'] = True

# ═══════════════════════════════════════════════════════
# 4. MeetingMinutesStore.ts — Phase 4: LLM摘要
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/m4/household/MeetingMinutesStore.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

# 4a. generateAndStore 支持传入 LLM 摘要
old = '''  generateAndStore(
    name: string,
    participants: string[],
    turns: MeetingTurn[],
    summary?: string,
  ): MeetingMinutes {'''

new = '''  generateAndStore(
    name: string,
    participants: string[],
    turns: MeetingTurn[],
    summary?: string,
    /** 🆕 V6.0: LLM 摘要生成回调 */
    generateSummary?: (turns: MeetingTurn[], participants: string[]) => Promise<string>,
  ): MeetingMinutes {'''

src = src.replace(old, new)

# 4b. 自动摘要改为支持异步 LLM
old = '''    // 系统自动生成摘要（如果 LLM 未提供）
    const autoSummary = summary || this._generateAutoSummary(name, participantNames, turns);'''

new = '''    // 🆕 V6.0: LLM 摘要优先，失败降级为词频统计
    let autoSummary = summary || '';
    if (!autoSummary && generateSummary) {
      try {
        autoSummary = await (generateSummary(turns, participantNames) as any);
      } catch {
        autoSummary = this._generateAutoSummary(name, participantNames, turns);
      }
    }
    if (!autoSummary) {
      autoSummary = this._generateAutoSummary(name, participantNames, turns);
    }'''

src = src.replace(old, new)

# 4c. 函数改为 async
old = '''  generateAndStore('''
src = src.replace('''  generateAndStore(''', '''  async generateAndStore(''')

with open(fp, 'w', encoding='utf-8') as f: f.write(src)
print('✅ MeetingMinutesStore.ts — Phase 4 完成')
changes['MeetingMinutesStore.ts'] = True

# ═══════════════════════════════════════════════════════
# 5. KnowledgeEngine.ts — Phase 5: 索引 meetings/
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/app/knowledge/KnowledgeEngine.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

# Find the initialization section where it scans directories
old = '''  // 初始化索引'''
if old not in src:
    old = '// 知识库初始化'

# Look for where knowledge files are scanned
old2 = 'async function initKnowledgeBase'
idx = src.find(old2)
if idx >= 0:
    # Find a good insertion point — after the directory scan setup
    scan_point = src.find("console.log('[KB]", idx)
    if scan_point < 0:
        scan_point = src.find("console.log('[KB]", 0)

    # Add meetings directory to knowledge sources
    # Insert into the file discovery section
    old_scan = "const mdFiles: string[] = []"
    if old_scan in src:
        new_scan = '''const mdFiles: string[] = [];

  // 🆕 V6.0: 扫描 meetings/ 目录中的会议纪要
  const meetingsDir = path.join(dataDir, '..', 'meetings');
  try {
    if (existsSync(meetingsDir)) {
      const meetingFiles = readdirSync(meetingsDir).filter(f => f.endsWith('.md'));
      for (const mf of meetingFiles) {
        const fullPath = path.join(meetingsDir, mf);
        mdFiles.push(fullPath);
        console.log(`[KB] 索引会议纪要: ${mf}`);
      }
    }
  } catch { /* meetings 目录不存在 */ }'''
        src = src.replace(old_scan, new_scan)
        print('✅ KnowledgeEngine.ts — Phase 5 (meetings 索引) 完成')
        changes['KnowledgeEngine.ts'] = True
    else:
        print('⚠️ KnowledgeEngine: mdFiles scan not found')

with open(fp, 'w', encoding='utf-8') as f: f.write(src)

# ═══════════════════════════════════════════════════════
# 6. KnowledgeContextBuilder.ts — Phase 5: 会晤注入纪要
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/app/knowledge/KnowledgeContextBuilder.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

# After entity-specific KB search, add meeting minutes search
old = '''        if (_entityResults && _entityResults.length > 0) {
          const _entityContent = _entityResults.map((k: any) =>
            `📄 ${k.title}\\n${stripFrontmatter(k.content || '').substring(0, 800)}`
          ).join('\\n\\n');
          const _existingKB = knowledgeBaseText || '';
          if (!_existingKB.includes(_entityContent.substring(0, 50))) {
            knowledgeBaseText = (_existingKB ? _existingKB + '\\n\\n' : '') +
              '【关于' + _meetingEntity + '的知识】\\n' + _entityContent;
            console.log('[KB·Entity] 会晤实体检索: ' + _meetingEntity + ' → ' + _entityResults.length + '条知识');
          }
        }'''

new = '''        if (_entityResults && _entityResults.length > 0) {
          const _entityContent = _entityResults.map((k: any) =>
            `📄 ${k.title}\\n${stripFrontmatter(k.content || '').substring(0, 800)}`
          ).join('\\n\\n');
          const _existingKB = knowledgeBaseText || '';
          if (!_existingKB.includes(_entityContent.substring(0, 50))) {
            knowledgeBaseText = (_existingKB ? _existingKB + '\\n\\n' : '') +
              '【关于' + _meetingEntity + '的知识】\\n' + _entityContent;
            console.log('[KB·Entity] 会晤实体检索: ' + _meetingEntity + ' → ' + _entityResults.length + '条知识');
          }
        }

        // 🆕 V6.0: 会晤模式下额外搜索会议纪要
        try {
          const _meetingKw = '会议纪要 ' + _meetingEntity;
          const _mtgResults = await ctx.knowledgeBase.weightedSearch(
            _meetingKw, dna.scene_tags || [],
            { pleasure: p.pleasure, arousal: p.arousal, intimacy: p.intimacy }, 2,
          );
          if (_mtgResults && _mtgResults.length > 0) {
            const _mtgContent = _mtgResults
              .filter((k: any) => (k.title || '').includes('会议纪要'))
              .map((k: any) => `📋 ${k.title}\\n${stripFrontmatter(k.content || '').substring(0, 500)}`)
              .join('\\n\\n');
            if (_mtgContent) {
              knowledgeBaseText = (knowledgeBaseText || '') + '\\n\\n【历史会议纪要】\\n' + _mtgContent;
              console.log('[KB·Meeting] 会议纪要检索: ' + _meetingEntity + ' → 命中');
            }
          }
        } catch { /* 纪要检索不阻塞 */ }'''

src = src.replace(old, new)

with open(fp, 'w', encoding='utf-8') as f: f.write(src)
print('✅ KnowledgeContextBuilder.ts — Phase 5 (纪要注入) 完成')
changes['KnowledgeContextBuilder.ts'] = True

# ═══════════════════════════════════════════════════════
# 7. chat.ts — Phase 2+3: 多人上下文 + recordTurn
# ═══════════════════════════════════════════════════════
fp = f'{ROOT}/src/webui/chat.ts'
with open(fp, 'r', encoding='utf-8') as f: src = f.read()

# 7a. 多人上下文构建
old = '''      try {
        _meetingEntityName = ctx._entityMeeting.getEntityName();
        if (_meetingEntityName) {
          // 🆕 V5.0: 会晤模式下过滤历史——只保留会晤开始之后的对话，隔离玉瑶旧对话
          const _meetingStartIdx = (ctx._entityMeeting as any).getMeetingStartHistoryIndex?.() ?? 0;
          if (_meetingStartIdx > 0 && enrichedHistory.length > 0) {
            enrichedHistory = enrichedHistory.slice(_meetingStartIdx);
            console.log(`[EntityMeeting] 历史过滤: ${ctx.conversationHistory.length} → ${enrichedHistory.length} 条 (从索引 ${_meetingStartIdx} 开始)`);
          }

          const { buildEntityContext } = await import('../m4/household/EntityContextBuilder.js');
          const isFirstTurn = ctx._entityMeeting.isFirstTurn?.() ?? false;'''

new = '''      try {
        _meetingEntityName = ctx._entityMeeting.getEntityName();
        if (_meetingEntityName) {
          // 🆕 V5.0: 会晤模式下过滤历史——只保留会晤开始之后的对话，隔离玉瑶旧对话
          const _meetingStartIdx = (ctx._entityMeeting as any).getMeetingStartHistoryIndex?.() ?? 0;
          if (_meetingStartIdx > 0 && enrichedHistory.length > 0) {
            enrichedHistory = enrichedHistory.slice(_meetingStartIdx);
            console.log(`[EntityMeeting] 历史过滤: ${ctx.conversationHistory.length} → ${enrichedHistory.length} 条 (从索引 ${_meetingStartIdx} 开始)`);
          }

          // 🆕 V6.0: 多人会晤 — 注入所有参与者档案
          const _isMulti = ctx._entityMeeting.isMultiParty?.() ?? false;
          const { buildEntityContext, buildMultiEntityContext } = await import('../m4/household/EntityContextBuilder.js');
          const isFirstTurn = ctx._entityMeeting.isFirstTurn?.() ?? false;'''

src = src.replace(old, new)

# 7b. 多人上下文构建分支
old = '''          const ecResult = buildEntityContext(ctx.m4.getFamilyGraph?.(), {
            entityName: _meetingEntityName,
            recentHistoryCount: isFirstTurn ? 3 : 5,
            isFirstTurn,
            userName: '鸿艺',
            recentConversations,
          });'''

new = '''          let ecResult;
          if (_isMulti) {
            // 多人会晤：注入所有参与者档案
            const _participants = ctx._entityMeeting.getParticipants?.() || [];
            const _allNames = _participants.map((p: any) => p.name);
            ecResult = buildMultiEntityContext(ctx.m4.getFamilyGraph?.(), {
              entityNames: _allNames.length > 0 ? _allNames : [_meetingEntityName],
              isFirstTurn,
              userName: '鸿艺',
            });
            console.log(`[EntityMeeting] 多人上下文: ${_allNames.length}人`);
          } else {
            ecResult = buildEntityContext(ctx.m4.getFamilyGraph?.(), {
              entityName: _meetingEntityName,
              recentHistoryCount: isFirstTurn ? 3 : 5,
              isFirstTurn,
              userName: '鸿艺',
              recentConversations,
            });
          }'''

src = src.replace(old, new)

# 7c. recordTurn 改为传正确发言人
old = '''    // V4.0 实体会晤：多人会议时记录用户发言
    if (ctx._entityMeeting?.isMultiParty()) {
      ctx._entityMeeting.recordTurn('user', message, '我');
    }'''

new = '''    // 🆕 V6.0 实体会晤：多人会议时记录发言（区分发言人）
    if (ctx._entityMeeting?.isMultiParty()) {
      ctx._entityMeeting.recordTurn('user', message, '鸿艺');
    }'''

src = src.replace(old, new)

# 7d. AI reply recordTurn
old = '''    // V4.0 实体会晤：多人会议时记录 AI 回复
    if (ctx._entityMeeting?.isMultiParty()) {
      const speakerName = ctx._entityMeeting.getEntityName() || '玉瑶';
      ctx._entityMeeting.recordTurn('assistant', reply, speakerName);
    }'''

new = '''    // 🆕 V6.0 实体会晤：多人会议时记录 AI 回复（用当前实体名）
    if (ctx._entityMeeting?.isMultiParty()) {
      const _curEntity = ctx._entityMeeting.getEntityName();
      // 尝试从回复中提取自称（如"诗雨觉得"→"诗雨"）
      let speakerName = _curEntity || '玉瑶';
      if (_curEntity && _curEntity.length >= 3) {
        const short = _curEntity.slice(-2);  // "徐诗雨" → "诗雨"
        if (reply.includes(short)) speakerName = _curEntity;
      }
      ctx._entityMeeting.recordTurn('assistant', reply, speakerName);
    }'''

src = src.replace(old, new)

# 7e. 集体呼唤在会中检测
old = '''    // V4.0 实体会晤：会议中检测用户退出意图
    if (ctx._entityMeeting?.isActive()) {'''

new = '''    // 🆕 V6.0: 多人会晤中检测集体呼唤（"你们一起回忆一下"）
    if (ctx._entityMeeting?.isMultiParty()) {
      const _activeNames = ctx._entityMeeting.getParticipants().map((p: any) => p.name);
      const _collIntent = EntityMeeting.detectCollectiveIntent(message, _activeNames);
      if (_collIntent) {
        console.log('[EntityMeeting] 集体呼唤: ' + _activeNames.join('、'));
      }
    }

    // V4.0 实体会晤：会议中检测用户退出意图
    if (ctx._entityMeeting?.isActive()) {'''

src = src.replace(old, new)

with open(fp, 'w', encoding='utf-8') as f: f.write(src)
print('✅ chat.ts — Phase 2+3 完成')
changes['chat.ts'] = True

print(f'\n🎉 V6.0 全部 {len(changes)} 个文件已修补')
for f in changes: print(f'  ✅ {f}')
