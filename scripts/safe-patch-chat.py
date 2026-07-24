"""Apply all necessary session patches to chat.ts - safely, with brace checking"""
import re

path = 'D:/tools/wenstar-cc/src/webui/chat.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Patch 1: Remove V5.1 isolation wall
old1 = """    // 🛡️ V5.1: 会晤信息隔离墙 — 清零所有记忆碎片
    if (_meetingEntityName) {
      memoryFragments.length = 0;
      biosGatedMemories = [];
      emotionalMemories.length = 0;
    }
"""
if old1 in content:
    content = content.replace(old1, '\n')
    changes += 1
    print('OK: V5.1 wall removed')
else:
    print('SKIP: V5.1 wall not found')

# Patch 2: Add SelfIdent monitor after FabGuard catch block
fg_end_marker = '} catch (_fabErr) { /* 编造检测失败不阻塞 */ }'
fg_idx = content.find(fg_end_marker)
if fg_idx > 0:
    insert_point = fg_idx + len(fg_end_marker)
    # Find the newline after this block
    nl_idx = content.find('\n', insert_point)

    self_ident_block = """
    // 🆕 V10.5: 会晤模式自称检测 — 检查角色是否在正文中自报姓名
    if (_meetingEntityName && reply && reply.length > 20) {
      try {
        const bodyText = reply.replace(/（[^）]*）/g, '').replace(/\\([^)]*\\)/g, '');
        const short = _meetingEntityName.length >= 2 ? _meetingEntityName.slice(-2) : _meetingEntityName;
        const hasSelfIdent = bodyText.includes(_meetingEntityName) || bodyText.includes(short);
        if (!hasSelfIdent && bodyText.length > 30) {
          console.warn('[SelfIdent] ' + _meetingEntityName + ' 回复未自报姓名');
        }
      } catch {} // 非关键
    }
"""
    content = content[:nl_idx+1] + self_ident_block + content[nl_idx+1:]
    changes += 1
    print('OK: SelfIdent added after FabGuard')
else:
    print('SKIP: FabGuard end marker not found')

# Verify brace balance
depth = 0
for i, ch in enumerate(content):
    if ch == '{': depth += 1
    elif ch == '}': depth -= 1
    if depth < 0:
        line_no = content[:i].count('\n') + 1
        print(f'WARNING: Brace underflow at position {i} (line {line_no})')
        break

if depth == 0:
    print(f'OK: Braces balanced ({changes} changes applied)')
else:
    print(f'WARNING: Braces not balanced! Final depth={depth}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
