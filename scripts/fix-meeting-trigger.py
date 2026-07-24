#!/usr/bin/env python3
"""Fix meeting trigger: move _safeNames before the if block"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('D:/tools/wenstar-cc/src/webui/chat.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the meeting trigger section
marker = "// ── V3.0 实体会晤意图检测 + 激活（含间接呼唤/自然口语） ──"
idx = content.find(marker)
if idx < 0:
    print("MARKER NOT FOUND!")
    # Try alternative
    idx = content.find("实体会晤意图检测")
    if idx < 0:
        print("ALTERNATIVE NOT FOUND EITHER!")
        sys.exit(1)

# Find the next line
newline_idx = content.index('\n', idx)
ctx_if_idx = content.index('if (ctx._entityMeeting', newline_idx)

# The section between the marker comment and the if condition: replace it
between = content[newline_idx+1:ctx_if_idx]
print(f"Between comment and if: {repr(between[:100])}")

# Build the replacement: comment + safeNames + if block
new_section = """
    // ── V3.0 实体会晤意图检测 + 激活（含间接呼唤/自然口语） ──
    const fg = ctx.m4?.getFamilyGraph?.();
    const _rawNames: string[] = fg?.getAllPersonNames?.() || [];
    // V9.0: FG未返回人名时硬编码兜底，确保会晤触发不依赖FG加载时序
    const _safeNames = _rawNames.length > 0 ? _rawNames : [
      '徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟',
      '熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜',
      '张小龙','罗权斌','邱工','刘云新','妹妹','老婆','妈妈'
    ];
    if (ctx._entityMeeting && !ctx._entityMeeting.isActive()) {"""

# Replace from the marker to the if
old_section = content[idx:ctx_if_idx]
content = content.replace(old_section, new_section)

# Now remove the duplicate const fg/allNames/_safeNames that was inside the if block
old_dup = """      const fg = ctx.m4?.getFamilyGraph?.();
      const allNames: string[] = fg?.getAllPersonNames?.() || [];
      // V9.0: FG未返回时用硬编码兜底，确保会晤触发不依赖FG加载时序
      const _safeNames = allNames.length > 0 ? allNames : [
        '徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟',
        '熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜',
        '张小龙','罗权斌','邱工','刘云新','妹妹','老婆','妈妈'
      ];
      const intentNames = EntityMeeting.detectUserIntent(message, _safeNames);"""

new_dedup = """      const intentNames = EntityMeeting.detectUserIntent(message, _safeNames);"""

if old_dup in content:
    content = content.replace(old_dup, new_dedup)
    print("Removed duplicate safeNames block")
else:
    print("Duplicate block NOT FOUND (may already be fixed)")
    # Find what's after the if
    if_idx = content.find("if (ctx._entityMeeting && !ctx._entityMeeting.isActive()) {")
    if if_idx >= 0:
        next_30 = content[if_idx:if_idx+300]
        print(f"After if: {repr(next_30[:200])}")

with open('D:/tools/wenstar-cc/src/webui/chat.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("DONE")
