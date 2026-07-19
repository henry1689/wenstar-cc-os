# -*- coding: utf-8 -*-
"""
户籍管理体系 V5.0 — 数据清理脚本
Phase 1: 清理脏数据 + 合并重复节点 + 修复分类 + 清理冗余边
"""
import sqlite3, json, sys, shutil, os, io
from datetime import datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB_PATH = 'D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db'
BACKUP_PATH = DB_PATH + f'.backup-{datetime.now().strftime("%Y%m%d-%H%M%S")}'

# 备份
shutil.copy2(DB_PATH, BACKUP_PATH)
print(f'✅ 备份已保存: {BACKUP_PATH}')

db = sqlite3.connect(DB_PATH)
db.execute("PRAGMA foreign_keys = OFF")

# ═══════════════════════════════════════════════════════
# 1. 清理玉瑶脏数据 (TXS-000000001)
# ═══════════════════════════════════════════════════════
print('\n=== 1. 清理玉瑶脏数据 ===')

yy = db.execute("SELECT id, properties FROM nodes WHERE uuid='TXS-000000001'").fetchone()
yy_id, yy_props_str = yy
yy_props = json.loads(yy_props_str) if isinstance(yy_props_str, str) else yy_props_str

# 记录清理前的状态
old_pending_count = len(yy_props.get('dossier', {}).get('selfProfile', {}).get('pendingItems', []))
old_ch_count = len(yy_props.get('_changeHistory', []))
old_household = yy_props.get('dossier', {}).get('misc', {}).get('_household', {})

# 清理
if 'dossier' in yy_props:
    if 'selfProfile' in yy_props['dossier']:
        yy_props['dossier']['selfProfile']['pendingItems'] = []
        print(f'  清空 pendingItems ({old_pending_count} → 0)')
    if 'misc' in yy_props['dossier']:
        yy_props['dossier']['misc']['_household'] = {}
        print(f'  清空 _household ({len(old_household.get("members", []))} members → 0)')

# 精简 changeHistory
if '_changeHistory' in yy_props:
    yy_props['_changeHistory'] = yy_props['_changeHistory'][-5:]
    print(f'  精简 _changeHistory ({old_ch_count} → {len(yy_props["_changeHistory"])})')

db.execute("UPDATE nodes SET properties = ? WHERE id = ?", (json.dumps(yy_props, ensure_ascii=False), yy_id))
print('✅ 玉瑶数据清理完成')

# ═══════════════════════════════════════════════════════
# 2. 合并徐诗雨重复节点 (007 ← 011, 018)
# ═══════════════════════════════════════════════════════
print('\n=== 2. 合并徐诗雨重复节点 ===')

# 找到3个徐诗雨
xsy_nodes = db.execute("""
    SELECT id, uuid, properties FROM nodes
    WHERE name LIKE '%诗雨%' AND category='A'
    ORDER BY uuid
""").fetchall()

print(f'  找到 {len(xsy_nodes)} 个徐诗雨节点:')
for n in xsy_nodes:
    print(f'    id={n[0]} uuid={n[1]}')

if len(xsy_nodes) >= 2:
    primary = xsy_nodes[0]  # TXS-000000007 (最早的)
    duplicates = xsy_nodes[1:]  # 011, 018

    primary_id, primary_uuid = primary[0], primary[1]
    primary_props = json.loads(primary[2]) if isinstance(primary[2], str) else primary[2]

    # 收集所有 legacy_ids
    legacy = primary_props.get('legacy_ids', [])

    for dup in duplicates:
        dup_id, dup_uuid = dup[0], dup[1]
        dup_props = json.loads(dup[2]) if isinstance(dup[2], str) else dup[2]

        # 合并档案: dup的字段如果primary没有，则补上
        if 'dossier' in dup_props:
            for key in ['basicInfo', 'selfProfile', 'socialIdentity', 'lifeMilestones']:
                if key in dup_props['dossier'] and key in primary_props.get('dossier', {}):
                    # 合并: dup的值补到primary
                    dup_val = dup_props['dossier'][key]
                    pri_val = primary_props['dossier'][key]
                    if isinstance(dup_val, dict) and isinstance(pri_val, dict):
                        for k, v in dup_val.items():
                            if v and not pri_val.get(k):
                                pri_val[k] = v
                    elif isinstance(dup_val, list) and isinstance(pri_val, list):
                        for item in dup_val:
                            if item not in pri_val:
                                pri_val.append(item)

        # 迁移所有边: dup → primary
        edges_migrated = 0
        # 以 dup 为 source 的边
        db.execute("UPDATE edges SET source_id = ? WHERE source_id = ?", (primary_id, dup_id))
        edges_migrated += db.total_changes
        # 以 dup 为 target 的边
        db.execute("UPDATE edges SET target_id = ? WHERE target_id = ?", (primary_id, dup_id))
        edges_migrated += db.total_changes

        legacy.append(dup_uuid)
        legacy.extend(dup_props.get('legacy_ids', []))

        # 删除重复节点
        db.execute("DELETE FROM nodes WHERE id = ?", (dup_id,))
        print(f'  ✅ 合并 {dup_uuid} → {primary_uuid}，迁移 {edges_migrated} 条边，删除节点')

    # 更新 primary 的 legacy_ids
    primary_props['legacy_ids'] = list(set(legacy))
    db.execute("UPDATE nodes SET properties = ? WHERE id = ?", (json.dumps(primary_props, ensure_ascii=False), primary_id))
    print(f'✅ 徐诗雨合并完成: 保留 {primary_uuid}，legacy_ids={primary_props["legacy_ids"]}')

# ═══════════════════════════════════════════════════════
# 3. 修复 "我" 的分类 (TXS-000000024)
# ═══════════════════════════════════════════════════════
print('\n=== 3. 修复 "我" 的分类 ===')

wo = db.execute("SELECT id, uuid, category FROM nodes WHERE uuid='TXS-000000024'").fetchone()
if wo and wo[2] == 'S':
    db.execute("UPDATE nodes SET category = 'G' WHERE uuid = 'TXS-000000024'")
    print(f'✅ "我" (TXS-000000024) category: S → G')

# 确认只有玉瑶是 S
s_nodes = db.execute("SELECT name, uuid, category FROM nodes WHERE category='S'").fetchall()
for s in s_nodes:
    print(f'  S类: {s[0]} ({s[1]})')
if len(s_nodes) == 1 and s_nodes[0][1] == 'TXS-000000001':
    print('✅ S类只保留玉瑶，正确')
else:
    print(f'⚠️ S类还有 {len(s_nodes)} 个节点')

# ═══════════════════════════════════════════════════════
# 4. 清理冗余 acquaintance_of 边
# ═══════════════════════════════════════════════════════
print('\n=== 4. 清理冗余 acquaintance_of 边 ===')

# 统计清理前
before_count = db.execute("SELECT COUNT(*) FROM edges WHERE relation='acquaintance_of'").fetchone()[0]
print(f'  清理前: {before_count} 条 acquaintance_of')

# 删除非必要的 acquaintance_of:
# 规则: 如果两人之间有 family 关系边 (parent_of/child_of/sibling_of/spouse_of等),
# 则 acquaintance_of 是冗余的
family_relations = ['parent_of', 'child_of', 'mother_of', 'father_of',
                    'sibling_of', 'elder_sister_of', 'younger_sister_of',
                    'spouse_of', 'aunt_of', 'uncle_of', 'niece_of',
                    'grandmother_of', 'grandfather_of', 'cousin_of']

placeholders = ','.join('?' * len(family_relations))
# 找到所有两端节点之间已有 family 边的 acquaintance_of
redundant = db.execute(f"""
    SELECT a.id FROM edges a
    WHERE a.relation = 'acquaintance_of'
    AND EXISTS (
        SELECT 1 FROM edges f
        WHERE f.relation IN ({placeholders})
        AND (
            (f.source_id = a.source_id AND f.target_id = a.target_id)
            OR (f.source_id = a.target_id AND f.target_id = a.source_id)
        )
    )
""", family_relations).fetchall()

if redundant:
    redundant_ids = [r[0] for r in redundant]
    placeholders2 = ','.join('?' * len(redundant_ids))
    db.execute(f"DELETE FROM edges WHERE id IN ({placeholders2})", redundant_ids)
    print(f'  删除 {len(redundant_ids)} 条与family关系重复的 acquaintance_of')

# 删除所有由"我"发出的 acquaintance_of (用户不需要熟人边)
wo_id = db.execute("SELECT id FROM nodes WHERE uuid='TXS-000000024'").fetchone()
if wo_id:
    db.execute("DELETE FROM edges WHERE relation='acquaintance_of' AND source_id = ?", (wo_id[0],))
    print(f'  删除 "我" 发出的 acquaintance_of: {db.total_changes} 条')

after_count = db.execute("SELECT COUNT(*) FROM edges WHERE relation='acquaintance_of'").fetchone()[0]
print(f'  清理后: {after_count} 条 acquaintance_of')
print(f'✅ 共清理 {before_count - after_count} 条冗余边')

# ═══════════════════════════════════════════════════════
# 5. 验证
# ═══════════════════════════════════════════════════════
print('\n' + '=' * 60)
print('验证结果')
print('=' * 60)

# 5.1 玉瑶不再含"阿苏"
yy_props2 = json.loads(db.execute("SELECT properties FROM nodes WHERE uuid='TXS-000000001'").fetchone()[0])
has_asu = '阿苏' in json.dumps(yy_props2, ensure_ascii=False)
print(f'{"❌" if has_asu else "✅"} 玉瑶 properties 中{"仍含" if has_asu else "不含"}"阿苏"')

# 5.2 pendingItems 已清空
pi = yy_props2.get('dossier', {}).get('selfProfile', {}).get('pendingItems', [])
print(f'{"❌" if pi else "✅"} 玉瑶 pendingItems = {len(pi)} 条')

# 5.3 徐诗雨只剩1个
xsy_count = db.execute("SELECT COUNT(*) FROM nodes WHERE name LIKE '%诗雨%' AND category='A'").fetchone()[0]
print(f'{"❌" if xsy_count > 1 else "✅"} 徐诗雨节点数 = {xsy_count}')

# 5.4 S类只有玉瑶
s_count = db.execute("SELECT COUNT(*) FROM nodes WHERE category='S'").fetchone()[0]
print(f'{"❌" if s_count > 1 else "✅"} S类节点数 = {s_count} (应=1)')

# 5.5 边数统计
total_edges = db.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
total_nodes = db.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
print(f'✅ 总节点: {total_nodes}, 总边: {total_edges}')

db.commit()
db.close()

print('\n✅ Phase 1 数据清理全部完成!')
print(f'如需回滚: cp {BACKUP_PATH} {DB_PATH}')
