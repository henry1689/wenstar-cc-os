// ============================================================
// Agent CNC Harness — Python 三域隔离 Meter
// 检查 GlobalBus 协议和跨域隔离
// 支持 WENSTAR_OS_ROOT 环境变量
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

/**
 * 查找 wenstar_os 根目录
 */
function findWenstarOsRoot(context: HarnessContext): string | null {
  // 1. 环境变量
  const envRoot = process.env['WENSTAR_OS_ROOT'];
  if (envRoot && fileExists(path.join(envRoot, 'global_bus_main.py'))) {
    return envRoot;
  }

  // 2. context 中已解析的路径
  if (context.wenstarOsRoot) {
    return context.wenstarOsRoot;
  }

  // 3. 尝试常见路径
  const candidates = [
    path.join(context.rootDir, '..', 'wenstar_os'),
    'D:/wenstar/wenstar_os',
    'D:/tools/wenstar_os',
  ];

  for (const candidate of candidates) {
    if (fileExists(path.join(candidate, 'global_bus_main.py'))) {
      return candidate;
    }
  }

  return null;
}

export async function runPythonDomainMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('python-domain-meter', 'Python 三域隔离检查', 'A');

  const osRoot = findWenstarOsRoot(context);

  if (!osRoot) {
    result.status = 'skipped';
    result.score = 0;
    result.warnings.push('未找到 wenstar_os 目录，Python 三域检查 skipped');
    result.evidence.push(
      '可通过 WENSTAR_OS_ROOT 环境变量指定 wenstar_os 路径',
    );
    return result;
  }

  result.evidence.push(`wenstar_os 路径: ${osRoot}`);

  // 检查三个域目录
  const domains = ['domain_tianquan', 'domain_yaoling', 'domain_yaoguang'];
  for (const domain of domains) {
    const domainPath = path.join(osRoot, domain);
    if (fileExists(path.join(domainPath, '__init__.py')) || fileExists(domainPath)) {
      result.evidence.push(`✅ ${domain}/ 存在`);
    } else {
      result.warnings.push(`⚠️ ${domain}/ 不存在`);
    }
  }

  // 检查 global_bus_main.py 关键词
  const gbPath = path.join(osRoot, 'global_bus_main.py');
  if (fileExists(gbPath)) {
    result.evidence.push('✅ global_bus_main.py 存在');

    const gbKeywords = [
      'TTL',
      'req_id',
      'allow_cross_domain',
      'RouteStamp',
      'MH-1',
      'MH-4',
      'guard',
      'DENY',
    ];

    let gbFound = 0;
    for (const kw of gbKeywords) {
      const count = countOccurrences(gbPath, kw);
      if (count > 0) {
        gbFound++;
        result.evidence.push(`global_bus_main.py: "${kw}" 出现 ${count} 次`);
      }
    }

    if (gbFound < 3) {
      result.warnings.push(
        `GlobalBus 关键协议关键词覆盖不足: ${gbFound}/${gbKeywords.length}`,
      );
      result.status = 'warn';
      result.score = Math.round((gbFound / gbKeywords.length) * 100);
    } else {
      result.evidence.push(
        `GlobalBus 协议关键词: ${gbFound}/${gbKeywords.length}`,
      );
      result.score = 100;
    }
  } else {
    result.failures.push('global_bus_main.py 不存在');
    result.status = 'fail';
    result.score = 0;
  }

  // 如果 Python 域文件被修改
  const pyChanged = context.changedFiles.some(
    (f) =>
      f.startsWith('domain_tianquan') ||
      f.startsWith('domain_yaoling') ||
      f.startsWith('domain_yaoguang') ||
      f === 'global_bus_main.py',
  );
  if (pyChanged) {
    result.warnings.push(
      '⚠️ Python 三域文件已修改，必须验证 GlobalBus 协议完整性和跨域隔离',
    );
  }

  return result;
}
