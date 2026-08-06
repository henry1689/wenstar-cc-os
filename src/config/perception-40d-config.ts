/**
 * perception-40d-config — 40D 感知向量双轨开关
 * ============================================================
 * 🔴 双轨制：24D（Perception24D）全链路保留不动；
 * 40D（PerceptionV40）通过此开关渐进启用，验证后切默认值。
 *
 * 开关行为：
 *   PERCEPTION_40D=false → 40D 不参与检索（24D 全链路）
 *   PERCEPTION_40D=true（默认）→ 40D 参与检索（混合检索 + 40D 重排）
 *   回退：开关关回即恢复 24D 检索，零数据迁移成本
 * 🔴 默认 true：40D 已全链路验证（覆盖率100%），作为目标态默认开启；降级时置 false
 */
import { ConfigService } from './ConfigService.js';

/** 40D 感知向量双轨开关（默认 true，env 读取） */
export function isPerception40DEnabled(): boolean {
  return ConfigService.getBool('PERCEPTION_40D', true);
}

/** 40D 感知向量旁路写入开关（独立控制：即使检索未启用，也持续收集 v2 数据） */
export function isPerception40DCollectEnabled(): boolean {
  return ConfigService.getBool('PERCEPTION_40D_COLLECT', true);
}
