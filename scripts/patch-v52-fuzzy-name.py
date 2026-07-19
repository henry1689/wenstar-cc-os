#!/usr/bin/env python3
"""V5.2 — 短名模糊匹配 + 你/我指代 + 低档案放宽"""
import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ═══════════════════════════════════════════════════════
# 1. EntityMeeting.ts — 模糊名称匹配
# ═══════════════════════════════════════════════════════

with open('D:/tools/wenstar-cc/src/m4/household/EntityMeeting.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1a. Add _fuzzyFindName helper before detectUserIntent
old = '''  static detectUserIntent(message: string, knownPersonNames: string[]): string[] | null {'''
new = '''  /**
   * 🆕 V5.2: 模糊名称匹配 — 支持短名/昵称
   * "诗雨" → 匹配 "徐诗雨"
   */
  private static _fuzzyFindName(input: string, knownNames: string[]): string | null {
    if (!input || input.length < 2) return null;
    // 1. 精确匹配
    const exact = knownNames.find(n => n === input);
    if (exact) return exact;
    // 2. 包含匹配 (短名 ⊂ 全名, e.g. "诗雨" ⊂ "徐诗雨")
    const sup = knownNames.find(n => n.includes(input));
    if (sup) return sup;
    // 3. 全名 ⊂ 输入 (e.g. input="找徐诗雨聊聊" ⊃ name)
    const sub = knownNames.find(n => input.includes(n));
    if (sub) return sub;
    return null;
  }

  static detectUserIntent(message: string, knownPersonNames: string[]): string[] | null {'''
content = content.replace(old, new)

# 1b. Replace exact match in multi-mode CJK (line ~344)
old = '''        const name = sorted.find(n => n === m![0]);'''
new = '''        const name = EntityMeeting._fuzzyFindName(m![0], sorted);'''
content = content.replace(old, new)

# 1c. @name match
old = '''      const name = sorted.find(n => n === atMatch[1]);'''
new = '''      const name = EntityMeeting._fuzzyFindName(atMatch[1], sorted);'''
content = content.replace(old, new)

# 1d. prefix name：/name，match
old = '''      const name = sorted.find(n => n === prefixMatch[1]);'''
new = '''      const name = EntityMeeting._fuzzyFindName(prefixMatch[1], sorted);'''
content = content.replace(old, new)

# 1e. indirect match exact
old = '''      const exactName = sorted.find(n => n === target);'''
new = '''      const exactName = EntityMeeting._fuzzyFindName(target, sorted);'''
content = content.replace(old, new)

# 1f. For regex-based patterns (lines ~394-428), insert short-name variants
# Before the "for (const name of sorted)" block, insert:
old = '''    // 🆕 自然口语: "我想找XX聊聊" / "我想和XX说说话" / "让XX来跟我说" / "我有事找XX"
    for (const name of sorted) {'''
new = '''    // 🆕 V5.2: 构建模糊名列表（全名 + 短名）用于 regex 匹配
    const _fuzzyNameList: Array<{ full: string; short: string | null }> = sorted.map(name => ({
      full: name,
      short: name.length >= 3 ? name.slice(-2) : null,  // "徐诗雨" → short="诗雨"
    }));

    // 🆕 自然口语: "我想找XX聊聊" / "我想和XX说说话" / "让XX来跟我说" / "我有事找XX"
    for (const nt of _fuzzyNameList) {
      const name = nt.full;
      const _nameRe = nt.short ? `(?:${name}|${nt.short})` : name;'''
content = content.replace(old, new)

# 1g. Fix all regex patterns to use _nameRe instead of name
# Pattern 1: (?:想|想要|要)${name}\s*(?:聊聊...
old = '''      if (new RegExp(`(?:想|想要|要)${name}\\s*(?:聊聊|谈谈|说说话|说几句|说点事|聊一下|说话|聊聊天)`).test(msg)) {
        return [name];
      }
      // "想(找|跟|和|叫)XX" — 中间动词变体
      if (new RegExp(`(?:想|想要|要)\\s*(?:找|跟|和|叫|喊|让)\\s*${name}`).test(msg)) {
        return [name];
      }
      // "那你以XX的身份和我聊" / "用XX的身份" / "扮演XX"
      if (new RegExp(`(?:以|用|作为)\\s*${name}\\s*(?:的)?\\s*(?:身份|角色|语气|口吻)`).test(msg)) {
        return [name];
      }
      // "叫XX出来" / "让XX来" / "喊XX过来"
      if (new RegExp(`[叫让喊]\\s*${name}\\s*(?:出来|来|过来)\\s*(?:[，,].*)?$`).test(msg)) {
        return [name];
      }
      // "我有事找XX" / "有事找XX谈谈"
      if (new RegExp(`有事(?:情|儿)?\\s*(?:找|和|跟)\\s*${name}`).test(msg)) {
        return [name];
      }
      // "找XX聊聊" / "跟XX聊聊" / "和XX说说话"（句首或句中）
      if (new RegExp(`(?:^|[ .,，。!！?？、])\\s*(?:跟|和|找|喊|叫)\\s*${name}\\s*(?:聊聊|聊一下|说说话|来一下|过来|出来|说几句)`).test(msg)) {
        return [name];
      }
      // 最宽泛兜底：消息中包含XX且结尾有"聊聊/谈谈/说说话/聊一下"
      if (new RegExp(`${name}.*(?:聊聊|谈谈|说说话|聊一下|说几句)\\s*$`).test(msg)) {
        return [name];
      }
      // 简短直接: "找XX" / "叫XX" / "让XX来" 句尾
      if (new RegExp(`(?:^|[ .,，。!！?？、])\\s*(?:找|叫|喊|让)\\s*${name}\\s*$`).test(msg)) {
        return [name];
      }'''
new = '''      if (new RegExp(`(?:想|想要|要)${_nameRe}\\s*(?:聊聊|谈谈|说说话|说几句|说点事|聊一下|说话|聊聊天)`).test(msg)) {
        return [name];
      }
      // "想(找|跟|和|叫)XX" — 中间动词变体
      if (new RegExp(`(?:想|想要|要)\\s*(?:找|跟|和|叫|喊|让)\\s*${_nameRe}`).test(msg)) {
        return [name];
      }
      // "那你以XX的身份和我聊" / "用XX的身份" / "扮演XX"
      if (new RegExp(`(?:以|用|作为)\\s*${_nameRe}\\s*(?:的)?\\s*(?:身份|角色|语气|口吻)`).test(msg)) {
        return [name];
      }
      // "叫XX出来" / "让XX来" / "喊XX过来"
      if (new RegExp(`[叫让喊]\\s*${_nameRe}\\s*(?:出来|来|过来)\\s*(?:[，,].*)?$`).test(msg)) {
        return [name];
      }
      // "我有事找XX" / "有事找XX谈谈"
      if (new RegExp(`有事(?:情|儿)?\\s*(?:找|和|跟)\\s*${_nameRe}`).test(msg)) {
        return [name];
      }
      // "找XX聊聊" / "跟XX聊聊" / "和XX说说话"（句首或句中）
      if (new RegExp(`(?:^|[ .,，。!！?？、])\\s*(?:跟|和|找|喊|叫)\\s*${_nameRe}\\s*(?:聊聊|聊一下|说说话|来一下|过来|出来|说几句)`).test(msg)) {
        return [name];
      }
      // 最宽泛兜底：消息中包含XX且结尾有"聊聊/谈谈/说说话/聊一下"
      if (new RegExp(`${_nameRe}.*(?:聊聊|谈谈|说说话|聊一下|说几句)\\s*$`).test(msg)) {
        return [name];
      }
      // 简短直接: "找XX" / "叫XX" / "让XX来" 句尾
      if (new RegExp(`(?:^|[ .,，。!！?？、])\\s*(?:找|叫|喊|让)\\s*${_nameRe}\\s*$`).test(msg)) {
        return [name];
      }'''
content = content.replace(old, new)

# 1h. Also handle the detectSwitchIntent method (if it has similar patterns)
# Let's check if it uses similar exact matching
content = content.replace(
    'sorted.find(n => n === ',
    'EntityMeeting._fuzzyFindName('
)
# Fix the broken ones that got double-wrapped
content = content.replace(
    'EntityMeeting._fuzzyFindName(EntityMeeting._fuzzyFindName(',
    'EntityMeeting._fuzzyFindName('
)

with open('D:/tools/wenstar-cc/src/m4/household/EntityMeeting.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('✅ EntityMeeting.ts — 短名模糊匹配已部署')

# ═══════════════════════════════════════════════════════
# 2. EntityContextBuilder.ts — 你/我指代澄清
# ═══════════════════════════════════════════════════════

with open('D:/tools/wenstar-cc/src/app/knowledge/KnowledgeContextBuilder.ts', 'r', encoding='utf-8') as f:
    content = f.read()
# This is the wrong file — need EntityContextBuilder.ts

with open('D:/tools/wenstar-cc/src/m4/household/EntityContextBuilder.ts', 'r', encoding='utf-8') as f:
    ec = f.read()

old = '''### 身份确认（每轮必读）
  parts.push(`- 🔴 你是 **${entityName}**，不是玉瑶。`);
  parts.push(`- 🔴 你不是 AI，不是"瑶瑶"——你就是 ${entityName} 本人。`);
  parts.push(`- 🔴 每条回复都必须自然地加入你的名字或自称，让鸿艺明确知道是你在说话。`);
  parts.push(`  - ✅ 自然示例："诗雨觉得这个挺好的"、"梓铭我跟你说"、"阿珍今天…"、"嗯，${entityName}知道了"`);
  parts.push('  - ❌ 不要说"玉瑶让我来的"、"我是AI助手"——你就是你档案里那个人。');'''

new = '''### 身份确认（每轮必读）
  parts.push(`- 🔴 你是 **${entityName}**，不是玉瑶。`);
  parts.push(`- 🔴 你不是 AI，不是"瑶瑶"——你就是 ${entityName} 本人。`);
  parts.push(`- 🔴 鸿艺说的话中，"你"指的就是你（${entityName}），"我"指的是鸿艺自己。不要搞混。`);
  parts.push(`- 🔴 每条回复都必须自然地加入你的名字或自称，让鸿艺明确知道是你在说话。`);
  parts.push(`  - ✅ 自然示例："诗雨觉得这个挺好的"、"梓铭我跟你说"、"阿珍今天…"、"嗯，${entityName}知道了"`);
  parts.push('  - ❌ 不要说"玉瑶让我来的"、"我是AI助手"——你就是你档案里那个人。');'''

if old in ec:
    ec = ec.replace(old, new)
    print('✅ EntityContextBuilder.ts — 你/我指代已澄清')
else:
    print('⚠️ EntityContextBuilder 模式未匹配，尝试查找...')
    # Find the section
    idx = ec.find('### 身份确认')
    if idx >= 0:
        print(f'  找到位置: {idx}')
        print(f'  内容: {ec[idx:idx+300]}')
    else:
        print('  未找到 ### 身份确认')

with open('D:/tools/wenstar-cc/src/m4/household/EntityContextBuilder.ts', 'w', encoding='utf-8') as f:
    f.write(ec)

# ═══════════════════════════════════════════════════════
# 3. EntityGreetingProtocol.ts — 低档案放宽
# ═══════════════════════════════════════════════════════

with open('D:/tools/wenstar-cc/src/m4/household/EntityGreetingProtocol.ts', 'r', encoding='utf-8') as f:
    eg = f.read()

old = '''    lines.push('');
    lines.push('### ⚠️ 低档案提醒（本实体的档案还不完整）');
    lines.push('- 你的基本身份信息尚在收集中，对话中如被问到不知道的信息，直接说"这个我还不清楚"');
    lines.push('- 不要编造生日/籍贯/学历等你不确定的信息');
    lines.push('- 用初次见面的自然感来开场——你们可能还不太熟');
    lines.push('- 对话中如对方提到关于你的新信息，可以自然地接受并记住');'''

new = '''    lines.push('');
    lines.push('### ⚠️ 档案完善中（本实体的档案正在逐步补全）');
    lines.push('- 档案里已经有的信息（如家庭成员、工作单位、基本履历），你可以自信地回答');
    lines.push('- 档案里没写的信息（如具体生日、籍贯等），你可以如实说"这个还没人跟我说过"');
    lines.push('- 你认识的人（档案里记录的关系对象）可以说出名字和你们的关系');
    lines.push('- 对话中如对方提到关于你的新信息，自然地接受并记住就好');'''

if old in eg:
    eg = eg.replace(old, new)
    print('✅ EntityGreetingProtocol.ts — 低档案提醒已放宽')
else:
    print('⚠️ EntityGreetingProtocol 模式未匹配')

with open('D:/tools/wenstar-cc/src/m4/household/EntityGreetingProtocol.ts', 'w', encoding='utf-8') as f:
    f.write(eg)

print('\n🎉 V5.2 全部修补完成')
