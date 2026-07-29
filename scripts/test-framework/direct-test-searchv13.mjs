#!/usr/bin/env node
// 直接测试 searchV13 on 真实 DB — 从 D:\tools\wenstar-cc 运行
import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.argv[1], '../../..'); // scripts/test-framework/ → root

async function main() {
  const { searchV13 } = await import(resolve(ROOT, 'dist/m4/UnifiedSearchEngine.js'));
  const { MemoryAssociationRepository } = await import(resolve(ROOT, 'dist/m4/graph/MemoryAssociationRepository.js'));
  const { MemoryRetriever } = await import(resolve(ROOT, 'dist/m4/MemoryRetriever.js'));
  const { FusionStorageAdapter } = await import(resolve(ROOT, 'dist/m2/FusionStorageAdapter.js'));

  const SQL = await initSqlJs();
  const buf = readFileSync(resolve(ROOT, 'data/webui/fusion_memory.db'));
  const db = new SQL.Database(buf);

  const storage = new FusionStorageAdapter(resolve(ROOT, 'data/webui'));
  await storage.initialize?.();

  const retriever = new MemoryRetriever(storage);
  const multiRank = await retriever.retrieveMultiRank('default', [
    { name: '熊梓铭', type: 'person' },
    { name: '学术', type: 'event' },
    { name: '研究', type: 'event' },
    { name: '纪实', type: 'event' },
    { name: '小说', type: 'event' },
  ], { entityUuids: ['uuid-ziming'] });

  console.log('MultiRank:', multiRank.lists.length, 'lists,', multiRank.totalCandidates, 'candidates');
  for (const l of multiRank.lists) console.log('  ' + l.source + ': ' + l.items.length + ' items');

  const dagRepo = new MemoryAssociationRepository(db);
  const result = await searchV13(db, multiRank, '熊梓铭 学术研究 纪实小说', null, {
    mode: 'full', limit: 5, entityUuids: ['uuid-ziming'],
  }, {
    enableRRF: true, enableDAGClosure: true, enableMMR: true,
    enableForesightFilter: true, enableNarrativeAssembler: true, enableCrossEncoder: false,
  }, dagRepo);

  console.log('\n=== searchV13 结果 ===');
  console.log('Items:', result.items.length);
  console.log('Layers:', JSON.stringify(result.layerLatency));
  if (result.narrative) {
    console.log('Narrative compactText:');
    console.log(result.narrative.compactText?.substring(0, 600));
  }
  console.log('\nTop items:');
  for (let i = 0; i < Math.min(5, result.items.length); i++) {
    console.log('  [' + (i + 1) + '] ' + result.items[i].substring(0, 150));
  }

  if (result.closure) {
    console.log('\nDAG Closure: ' + result.closure.nodeCount + ' nodes, ' + result.closure.edgeCount + ' edges');
  }
  if (result.degradations?.length) {
    console.log('Degradations:', result.degradations.join(', '));
  }

  db.close();
  console.log('\nDone');
}
main().catch(e => { console.error(e); process.exit(1); });
