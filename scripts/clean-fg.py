#!/usr/bin/env python3
"""Clean FG: delete garbage nodes, correct profiles, add missing persons."""
import sqlite3, json, uuid

def uid():
    return uuid.uuid4().hex[:24]

db = sqlite3.connect('data/webui/knowledge/family_graph.db')
c = db.cursor()
now = '2026-07-08T14:00:00.000Z'

# ─── 1. Garbage node ids ───
c.execute("SELECT id, properties FROM nodes WHERE type='person'")
garbage_ids = []
for nid, props_str in c.fetchall():
    if not props_str:
        garbage_ids.append(nid)
        continue
    p = json.loads(props_str)
    name = p.get('name', '')
    age = p.get('age')
    occ = (p.get('occupation') or '').strip()
    if age or occ:
        continue
    if name == '父亲':
        continue
    garbage_ids.append(nid)

# Also delete "客户"
c.execute("SELECT id FROM nodes WHERE name='客户'")
row = c.fetchone()
if row:
    garbage_ids.append(row[0])

# Delete edges + nodes
for nid in garbage_ids:
    c.execute("DELETE FROM edges WHERE source_id=? OR target_id=?", (nid, nid))
    c.execute("DELETE FROM nodes WHERE id=?", (nid,))
print(f'Deleted {len(garbage_ids)} garbage nodes')

# ─── 2. Update profiles ───
now_ts = now
updates = {
    '陈斌': {'occupation': '研发部样板工程师', 'relation_to_user': '林土锋下属/研发部样板工程师', 'mention_count': 1, 'last_mentioned': now_ts},
    '刘云新': {'name': '刘云新', 'occupation': '高峰电业生产部经理', 'relation_to_user': '同事/高峰电业生产部经理', 'mention_count': 1, 'last_mentioned': now_ts},
    '赖晨喜': {'name': '赖陈喜', 'occupation': '高峰电业PMC计划员', 'relation_to_user': '同事/高峰电业PMC计划员', 'mention_count': 1, 'last_mentioned': now_ts},
    '曾美容': {'occupation': '集团采购部经理兼高峰电业采购部经理', 'relation_to_user': '同事/采购部经理', 'mention_count': 1, 'last_mentioned': now_ts},
    '宁清华': {'occupation': '高峰电业品质部主管', 'relation_to_user': '同事/品质部主管', 'mention_count': 1, 'last_mentioned': now_ts},
    '陈雪花': {'occupation': '高峰电业品质部组长', 'relation_to_user': '品质部组长/宁清华老婆', 'mention_count': 1, 'last_mentioned': now_ts},
}

for old_name, upd in updates.items():
    c.execute("SELECT id, properties FROM nodes WHERE name=?", (old_name,))
    row = c.fetchone()
    if row:
        nid, props_str = row
        p = json.loads(props_str) if props_str else {}
        for k, v in upd.items():
            p[k] = v
        # If name changed, update name column
        new_name = upd.get('name')
        if new_name and new_name != old_name:
            c.execute("UPDATE nodes SET name=?, properties=?, updated_at=? WHERE id=?",
                      (new_name, json.dumps(p, ensure_ascii=False), now_ts, nid))
            print(f'Renamed {old_name} -> {new_name}')
        else:
            c.execute("UPDATE nodes SET properties=?, updated_at=? WHERE id=?",
                      (json.dumps(p, ensure_ascii=False), now_ts, nid))
            print(f'Updated {old_name}')
    else:
        # Create new node if not exists
        nid = uid()
        props = {'name': old_name, **upd, 'completeness': 0.5}
        c.execute("INSERT INTO nodes (id, type, name, properties, created_at, updated_at) VALUES (?, 'person', ?, ?, ?, ?)",
                  (nid, old_name, json.dumps(props, ensure_ascii=False), now_ts, now_ts))
        print(f'Created {old_name}')

# ─── 3. Add new persons ───
new_persons = {
    '熊梓玥': {'name': '熊梓玥', 'age': 8, 'occupation': '学生', 'relation_to_user': '熊勇的小女儿'},
    '罗权斌': {'name': '罗权斌', 'occupation': '营运总监兼集团财务经理', 'relation_to_user': '同事/营运总监兼集团财务经理'},
}

for name, props in new_persons.items():
    c.execute("SELECT COUNT(*) FROM nodes WHERE name=?", (name,))
    if c.fetchone()[0] == 0:
        nid = uid()
        props['mention_count'] = 1
        props['last_mentioned'] = now_ts
        props['completeness'] = 0.5
        c.execute("INSERT INTO nodes (id, type, name, properties, created_at, updated_at) VALUES (?, 'person', ?, ?, ?, ?)",
                  (nid, name, json.dumps(props, ensure_ascii=False), now_ts, now_ts))
        # acquaintance edge
        c.execute("SELECT id FROM nodes WHERE name='我'")
        me = c.fetchone()
        if me:
            eid = uid()
            c.execute("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, 'acquaintance_of', '{}', ?, ?)",
                      (eid, me[0], nid, now_ts, now_ts))
        print(f'Added {name}')

# ─── 4. Family edges ───
def add_family_edge(parent_name, child_name, parent_rel, child_rel):
    c.execute("SELECT id FROM nodes WHERE name=?", (parent_name,))
    p_id = c.fetchone()
    c.execute("SELECT id FROM nodes WHERE name=?", (child_name,))
    c_id = c.fetchone()
    if not p_id or not c_id:
        return
    exists = c.execute("SELECT COUNT(*) FROM edges WHERE source_id=? AND target_id=?", (p_id[0], c_id[0])).fetchone()[0]
    if exists == 0:
        eid1 = uid()
        eid2 = uid()
        c.execute("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)",
                  (eid1, p_id[0], c_id[0], parent_rel, now_ts, now_ts))
        c.execute("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)",
                  (eid2, c_id[0], p_id[0], child_rel, now_ts, now_ts))
        print(f'Added {parent_rel}: {parent_name} <-> {child_name}')

add_family_edge('熊勇', '熊梓玥', 'parent_of', 'child_of')
add_family_edge('熊梓铭', '熊梓玥', 'sibling_of', 'sibling_of')
add_family_edge('宁清华', '陈雪花', 'spouse_of', 'spouse_of')
add_family_edge('林土锋', '陈斌', 'subordinate_of', 'boss_of')

db.commit()
db.close()
print('\nAll done!')
