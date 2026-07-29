#!/usr/bin/env node
/**
 * 端到端模拟 — 完整复制服务端 retrieval-stage.ts 的 V13 调用逻辑
 * 直接测试: MultiRank → searchV13 → Narrative 全链路
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = 'D:/tools/wenstar-cc';

async function main() {
  console.log('='.repeat(60));
  console.log('searchV13 端到端仿真测试');
  console.log('='.repeat(60));

  // 1. 加载 DB
  const SQL = await initSqlJs();
  const buf = readFileSync('../../data/webui/fusion_memory.db');
  const db = new SQL.Database(buf);

  // 验证 DB 状态
  console.log('\n1. DB 状态:');
  console.log('  search_index:', db.exec('SELECT count(*) FROM search_index')[0].values[0][0], '条');
  console.log('  edges:', db.exec('SELECT count(*) FROM memory_associations')[0].values[0][0], '条');
  console.log('  uuid-ziming:', db.exec("SELECT count(*) FROM memories WHERE belong_entity_uuid='uuid-ziming'")[0].values[0][0], '条');

  // 2. 加载模块
  console.log('\n2. 加载模块...');
  const mod = await import('../../dist/m4/UnifiedSearchEngine.js');
  const { searchV13, search } = mod;
  console.log('  searchV13:', typeof searchV13);
  console.log('  search (old):', typeof search);

  const { MemoryAssociationRepository } = await import('../../dist/m4/graph/MemoryAssociationRepository.js');
  console.log('  MemoryAssociationRepository:', typeof MemoryAssociationRepository);

  // 3. 旧管线测试 (V11)
  console.log('\n3. V11 旧管线:');
  const v11Result = search(db, '熊梓铭 学术研究 纪实小说', null, {
    mode: 'full', limit: 5,
    entityUuids: ['uuid-ziming'],
  });
  console.log('  候选:', v11Result.totalCandidates);
  console.log('  结果:', v11Result.items.length, '条');
  for (let i = 0; i < Math.min(3, v11Result.items.length); i++) {
    console.log('    [' + (i + 1) + '] ' + v11Result.items[i].substring(0, 100));
  }

  // 4. 构造 MultiRankResult（模拟 MemoryRetriever.retrieveMultiRank）
  console.log('\n4. 构造 MultiRankResult...');
  function cp(t) { return String(t || '').replace(/[^一-鿿\w]/g, '').trim(); }
  const query = '熊梓铭 学术研究 纪实小说';
  const qc = cp(query);
  const qn = new Set();
  for (let i = 0; i < qc.length - 1; i++) qn.add(qc.substring(i, i + 2));
  for (let i = 0; i < qc.length - 2; i++) qn.add(qc.substring(i, i + 3));

  // n-gram 召回
  const ids = new Set();
  for (const g of [...qn].slice(0, 8)) {
    try {
      const r = db.exec("SELECT source_id FROM search_index WHERE term=? AND source_type='memory' LIMIT 30", [g]);
      if (r.length && r[0].values) for (const v of r[0].values) ids.add(String(v[0]));
    } catch {}
  }
  // LIKE 兜底
  for (const kw of ['熊梓铭', '学术', '研究', '纪实', '小说']) {
    try {
      const r = db.exec('SELECT id FROM memories WHERE raw_input LIKE ? LIMIT 20', ['%' + kw + '%']);
      if (r.length && r[0].values) for (const v of r[0].values) ids.add(String(v[0]));
    } catch {}
  }

  // 转为 RankedItem[] (keyword 路)
  const idArr = [...ids].slice(0, 50);
  const ph = idArr.map(() => '?').join(',');
  let rows = db.exec(
    'SELECT global_uid,substr(raw_input,1,200),calcium_score,created_at,belong_entity_uuid FROM memories WHERE id IN (' + ph + ') AND belong_entity_uuid="uuid-ziming" LIMIT 30',
    idArr
  );
  // 如果没有 uuid-ziming 的，放宽条件
  if (!rows.length || !rows[0]?.values?.length) {
    rows = db.exec(
      'SELECT global_uid,substr(raw_input,1,200),calcium_score,created_at,belong_entity_uuid FROM memories WHERE id IN (' + ph + ') LIMIT 30',
      idArr
    );
  }

  if (!rows.length || !rows[0]?.values?.length) {
    console.log('  ❌ 无法获取任何候选记忆');
    db.close();
    return;
  }

  const keywordItems = rows[0].values
    .map((v, i) => {
      const uid = String(v[0] || '');
      const raw = String(v[1] || '');
      const ca = Number(v[2] || 0);
      const ts = String(v[3] || new Date().toISOString());
      const euuid = String(v[4] || '');
      return {
        id: uid || ('fallback_' + i),
        text: raw.substring(0, 200) || '(no text)',
        score: 1.0 - i * 0.02,
        source: 'keyword',
        entityUuid: euuid,
        calciumScore: ca || 0,
        createdAt: ts,
      };
    })
    .filter(x => x.id && x.id !== 'null' && x.id !== 'undefined');
  console.log('  sample id:', keywordItems[0]?.id, '| text:', keywordItems[0]?.text?.substring(0,60));

  const multiRank = {
    lists: [{ source: 'keyword', items: keywordItems }],
    totalCandidates: keywordItems.length,
    indexHit: false,
    indexedIds: [],
  };
  console.log('  种子数:', multiRank.totalCandidates);

  // 5. searchV13 全链路
  console.log('\n5. searchV13 七层管线:');
  const dagRepo = new MemoryAssociationRepository(db);
  const t0 = Date.now();
  const v13Result = await searchV13(db, multiRank, query, null, {
    mode: 'full', limit: 5,
    entityUuids: ['uuid-ziming'],
  }, {
    enableRRF: true,
    enableDAGClosure: true,
    enableCrossEncoder: false,
    enableForesightFilter: true,
    enableMMR: true,
    enableNarrativeAssembler: true,
  }, dagRepo);
  const elapsed = Date.now() - t0;

  console.log('  总耗时:', elapsed, 'ms');
  console.log('  结果:', v13Result.items.length, '条');
  console.log('  各层延迟 (ms):', JSON.stringify(v13Result.layerLatency));

  if (v13Result.closure) {
    console.log('  DAG 闭包:', v13Result.closure.nodeCount, 'nodes,', v13Result.closure.edgeCount, 'edges,', v13Result.closure.seedCount, 'seeds');
  } else {
    console.log('  DAG 闭包: null');
  }

  if (v13Result.narrative) {
    console.log('\n  📖 叙事组装:');
    console.log('  Title:', v13Result.narrative.title);
    const ct = v13Result.narrative.compactText || '';
    console.log('  compactText (' + ct.length + ' chars):');
    console.log('  ' + ct.substring(0, 500).replace(/\n/g, '\n  '));
    console.log('  Timeline (' + (v13Result.narrative.timeline?.length || 0) + ' entries)');
    console.log('  Relations (' + (v13Result.narrative.relations?.length || 0) + ' edges)');
    if (v13Result.narrative.emotionArc) console.log('  EmotionArc:', v13Result.narrative.emotionArc.summary);
  } else {
    console.log('  📖 叙事: null');
  }

  if (v13Result.degradations?.length) {
    console.log('  ⚠️  降级:', v13Result.degradations.join(', '));
  }

  console.log('\n  Top items:');
  for (let i = 0; i < Math.min(5, v13Result.items.length); i++) {
    console.log('  [' + (i + 1) + '] ' + v13Result.items[i].substring(0, 130));
  }

  // 6. 对比评估
  console.log('\n6. 对比评估:');
  console.log('  V11 旧管线:', v11Result.items.length, '条');
  console.log('  V13 新管线:', v13Result.items.length, '条');
  console.log('  V13 DAG:', v13Result.closure ? v13Result.closure.nodeCount + ' nodes' : 'N/A');
  console.log('  V13 Narrative:', v13Result.narrative ? '✅ ' + (v13Result.narrative.compactText?.length || 0) + ' chars' : '❌');
  console.log('  V13 延迟:', elapsed, 'ms');

  db.close();
  console.log('\n✅ 端到端测试完成');
}
main().catch(e => { console.error('FATAL:', e.stack || e); process.exit(1); });
