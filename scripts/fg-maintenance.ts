/**
 * FGMaintenance — FG 关系图维护脚本
 * 
 * 定期运行：清理垃圾边、验证关系合理性
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FamilyGraph } from '../src/m4/household/FamilyGraph.js';
import { FGHealthCheck } from '../src/app/fg/FGHealthCheck.js';
import { FGRelationExtractor } from '../src/app/fg/FGRelationExtractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 显式指向生产库：FamilyGraph 的 DEFAULT_DB_PATH 基于 __dirname（tsx 源码运行时解析到 src/data 假库）
const DB_PATH = join(__dirname, '..', 'data', 'webui', 'knowledge', 'family_graph.db');

async function main() {
  const fg = new FamilyGraph(DB_PATH);
  await fg.initialize();

  const healthCheck = new FGHealthCheck(fg);
  const extractor = new FGRelationExtractor(fg);

  console.log('=== FG 健康检查 ===');
  const report = healthCheck.check();
  console.log(`节点: ${report.totalNodes}, 边: ${report.totalEdges}`);
  console.log(`垃圾节点: ${report.garbageNodes}`);
  console.log(`_auto_fix 边: ${report.autoFixEdges}`);
  console.log(`_inferred 边: ${report.inferredEdges}`);
  console.log(`None 节点边: ${report.noneEdges}`);
  console.log(`重复边: ${report.duplicateEdges}`);
  console.log(`健康状态: ${report.isHealthy ? '✅' : '⚠️'}`);

  if (!report.isHealthy) {
    console.log('\n=== 运行清理 ===');
    const result = healthCheck.runCleanup();
    console.log(`清理了 ${result.cleaned} 条边: ${JSON.stringify(result.details)}`);

    // 清理垃圾实体（需 LLM 时启用；未配置 LLM 时跳过）
    console.log('\n=== 清理垃圾实体 ===');
    const garbageResult = await extractor.cleanupGarbageNodes();
    if (garbageResult.cleaned > 0) {
      console.log(`清理了 ${garbageResult.cleaned} 个垃圾节点: ${garbageResult.garbageNodes.join(', ')}`);
    } else {
      console.log('无垃圾节点（或 LLM 未配置）');
    }
  }

  // 强制落盘并关闭
  (fg as any).flush();
  console.log('\n=== FG 维护完成 ===');
}

main().catch(console.error);
