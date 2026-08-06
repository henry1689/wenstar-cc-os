/**
 * perception-40d-config — 40D 感知向量双轨开关
 * ============================================================
 * 🔴 双轨制：24D（Perception24D）全链路保留不动；
 * 40D（PerceptionV40）通过此开关渐进启用，验证后切默认值。
 *
 * 开关行为：
 *   PERCEPTION_40D=false（默认）→ 24D 全链路不变，40D 只旁路写 perception_40d（不参与检索）
 *   PERCEPTION_40D=true        → 检索读 perception_40d(40D)，写入双写两列
 *   回退：开关关回即恢复 24D 检索，零数据迁移成本
 */
import { ConfigService } from './ConfigService.js';

/** 40D 感知向量双轨开关（默认 false，env 读取） */
export function isPerception40DEnabled(): boolean {
  return ConfigService.getBool('PERCEPTION_40D', false);
}

/** 40D 感知向量旁路写入开关（独立控制：即使检索未启用，也持续收集 v2 数据） */
export function isPerception40DCollectEnabled(): boolean {
  return ConfigService.getBool('PERCEPTION_40D_COLLECT', true);
}
