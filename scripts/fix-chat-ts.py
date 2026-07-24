"""Fix chat.ts - find and fix the orphan try {} catch mismatch"""
path = 'D:/tools/wenstar-cc/src/webui/chat.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The error is at line 1514: orphan try without catch
# This is the injectMemories try block that got its catch removed
# The fix: remove the orphan "try {" and keep only the injectMemories call

# Check what's at line 1506-1516
lines = content.split('\n')
for i in range(1505, 1517):
    print(f'L{i+1}: {lines[i].strip()[:100]}')

# The fix: the structure should be simple - just the injectMemories call, no try/catch wrapper
# Find "    try {\n      finalKnowledgeText = injectMemories"
old = "    try {\n      finalKnowledgeText = injectMemories({"
new = "    finalKnowledgeText = injectMemories({"

if old in content:
    content = content.replace(old, new)
    print("FIXED: Removed orphan try from injectMemories")
else:
    # Try with different whitespace
    import re
    # Find any 'try {' immediately before 'finalKnowledgeText = injectMemories'
    pattern = r'(    )try \{\n      finalKnowledgeText = injectMemories\(\{'
    match = re.search(pattern, content)
    if match:
        content = content[:match.start()] + "    finalKnowledgeText = injectMemories({" + content[match.end():]
        print(f"FIXED: Removed orphan try at position {match.start()}")
    else:
        print("Pattern not found. Searching for context...")
        idx = content.find("finalKnowledgeText = injectMemories({")
        if idx > 0:
            before = content[idx-60:idx]
            print(f"Before injectMemories: {repr(before)}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
