#!/usr/bin/env python3
"""Show current FG relationships and identify gaps."""
import sqlite3, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

db = sqlite3.connect('data/webui/knowledge/family_graph.db')
c = db.cursor()

c.execute("SELECT properties FROM nodes WHERE type='person'")
people = []
for r in c.fetchall():
    if r[0]:
        p = json.loads(r[0])
        people.append(p.get('name', ''))

c.execute('''SELECT n1.name, e.relation, n2.name FROM edges e
  JOIN nodes n1 ON e.source_id = n1.id
  JOIN nodes n2 ON e.target_id = n2.id
  WHERE n1.type='person' AND n2.type='person' ''')
edges = c.fetchall()

rel_map = {
    'mother_of':'母亲', 'daughter':'女儿', 'sibling_of':'兄弟姐妹', 'sister_in_law_of':'妯娌',
    'cousin_of':'表亲', 'aunt_of':'姑姑', 'niece_of':'侄女', 'spouse_of':'配偶',
    'parent_of':'父母', 'child_of':'孩子', 'acquaintance_of':'认识', 'colleague_of':'同事',
    'subordinate_of':'下属', 'boss_of':'上司', 'father_of':'父亲', 'son':'儿子'
}

adj = {name: [] for name in people if name}
for src, rel, tgt in edges:
    label = rel_map.get(rel, rel)
    if src in adj:
        adj[src].append((tgt, label))
    if tgt in adj and src != tgt:
        pass  # already covered from source side

print('=' * 60)
print('当前关系网（每个人能查到的连接）')
print('=' * 60)
for name in sorted(people):
    if not name: continue
    rels = adj.get(name, [])
    print(f'\n{name}:')
    if rels:
        for tgt, label in sorted(rels, key=lambda x: x[0]):
            print(f'  -> {tgt:10s} = {label}')
    else:
        print('  (无关系边)')

db.close()
