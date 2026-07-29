# Agent CNC Evidence Report

## 1. Summary

- **Project:** WenStarOS
- **Time:** 2026-07-28T07:44:55.520Z
- **Mode:** offline_deterministic_guard
- **Result:** PASS
- **Overall Risk:** high
- **Gate Decision:** PASS

## 2. Changed Files

| File | Risk | Reason |
|:---|:---|:---|
| package-lock.json | medium | 未匹配任何风险规则，默认为中风险 |
| package.json | medium | 未匹配任何风险规则，默认为中风险 |
| src/m2/MigrationManager.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/M4Orchestrator.ts | medium | 中风险区域文件 |
| src/m4/MemoryRetriever.ts | medium | 中风险区域文件 |
| src/m4/UnifiedSearchEngine.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m5/DeepSeekLLMProvider.ts | high | LLM API 调用、提示词组装、reasoning_content 清洗 |
| src/m5/prompts/core-rules.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/webui/chat/dialog-group-stage.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/webui/chat/retrieval-stage.ts | medium | 中风险区域文件 |
| tsconfig.json | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/PLAN_TEMPLATE.md | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/README.md | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/config.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/meeting-identity.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/persistence-restart.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/prompt-injection-order.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/python-globalbus.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/reasoning-content-clean.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/roleplay-ab-isolation.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/roleplay-exit.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/golden/uuid-ownership.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/harness.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/inspection-matrix.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/behavior-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/fg-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/llm-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/mode-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/persist-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/prompt-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/python-domain-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/trace-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/meters/uuid-meter.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/precision-spec.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/project-genome.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/chat-injection-points.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/fg-roleplay-redlines.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/llm-provider-rules.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/meeting-propagation-chain.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/python-three-domain-rules.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/sqlite-persistence-rules.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/redlines/uuid-ownership-rules.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/.gitkeep | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/current-plan.md | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/evidence-report-20260728-152831.json | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/evidence-report-20260728-152831.md | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/evidence-report-20260728-152911.json | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/evidence-report-20260728-152911.md | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/latest-result.json | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/latest-scan.json | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/reports/latest.md | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/risk-map.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/chat-ts-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/familygraph-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/high-risk-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/llm-provider-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/low-risk-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/medium-risk-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/meeting-mode-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/python-domain-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/roleplay-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/sqlite-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| .agent-cnc/workflows/uuid-chain-change.yaml | medium | 未匹配任何风险规则，默认为中风险 |
| "docs/blueprint//345/217/230/346/233/264/345/217/260/350/264/246_2026-07-27_entity-context-manager.md" | medium | 未匹配任何风险规则，默认为中风险 |
| docs/postmortem-2026-07-28-search-test-failures.md | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/apply-migrations.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/build-dag-edges.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/comprehensive-audit.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/full-pipeline-run.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/search-xushiyu.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/atomic-fix-and-test.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/baselines/baseline-v2.json | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/direct-test-searchv13.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/e2e-search-v13.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/fix-and-retest.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/last-report.json | medium | 未匹配任何风险规则，默认为中风险 |
| scripts/test-framework/ten-dimension-suite.mjs | medium | 未匹配任何风险规则，默认为中风险 |
| src/__tests__/full-pipeline-xuziming.test.ts | low | 匹配模式: **/__tests__/** |
| src/__tests__/real-search-xuziming.test.ts | low | 匹配模式: **/__tests__/** |
| src/__tests__/search-v12.test.ts | low | 匹配模式: **/__tests__/** |
| src/__tests__/search-v13-full-pipeline.test.ts | low | 匹配模式: **/__tests__/** |
| src/agent-cnc/cli.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/command-runner.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/config.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/git.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/base.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/behavior-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/fg-integrity-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/index.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/llm-provider-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/meeting-mode-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/prompt-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/python-domain-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/roleplay-isolation-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/sqlite-persist-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/meters/uuid-ownership-meter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/report.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/risk-router.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/types.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/utils.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/validators.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/agent-cnc/workflow-router.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/app/entity/EntityContextCompressor.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/app/entity/EntityContextManager.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/app/entity/EntityContextStore.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/app/entity/EntityContextStrategy.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/app/entity/EntityIndexMaintainer.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/app/entity/index.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m3/ForesightDetector.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m3/SurprisalGate.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m3/__tests__/ForesightDetector.test.ts | low | 匹配模式: **/__tests__/** |
| src/m3/__tests__/SurprisalGate.test.ts | low | 匹配模式: **/__tests__/** |
| src/m4/MMRDiversifier.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/RRFFusion.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/SearchConfig.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/__tests__/DAGClosureSearch.test.ts | low | 匹配模式: **/__tests__/** |
| src/m4/__tests__/MMRDiversifier.test.ts | low | 匹配模式: **/__tests__/** |
| src/m4/__tests__/RRFusion.test.ts | low | 匹配模式: **/__tests__/** |
| src/m4/__tests__/Sprint3Modules.test.ts | low | 匹配模式: **/__tests__/** |
| src/m4/filters/ForesightValidityFilter.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/CausalSkeletonPruner.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/DeltaGraphMaintenanceJob.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/MemoryAssociationRepository.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/MemoryAssociationTypes.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/MemoryClosureRetriever.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/OfflineEmotionEdgeBuilder.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/OfflineSemanticEdgeBuilder.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/OnlineCausalEdgeBuilder.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/graph/OnlineEntityEdgeBuilder.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/narrative/MemoryNarrativeAssembler.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/rerank/CrossEncoderReranker.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/rerank/NoopCrossEncoderReranker.ts | medium | 未匹配任何风险规则，默认为中风险 |
| src/m4/types/retrieval.ts | medium | 未匹配任何风险规则，默认为中风险 |

## 3. Triggered Workflows

- chat_ts_change
- sqlite_change
- llm_provider_change

## 4. Commands

| Command | Exit Code | Duration | Result |
|:---|:---|:---|:---|
| npx tsc --noEmit | 0 | 15512ms | ✅ PASS |

## 5. Meter Results

| Meter | Status | Score | Severity |
|:---|:---|:---|:---|
| ✅ Prompt 注入完整性检查 | pass | 100 | S |
| ✅ 会晤模式隔离检查 | pass | 100 | S |
| ✅ 行为回归检查 | pass | 100 | A |
| ✅ SQLite 持久化检查 | pass | 100 | S |
| ⚠️ UUID 归属检查 | warn | 100 | S |
| ✅ LLM Provider 输出清洁性检查 | pass | 100 | S |

### UUID 归属检查
- ⚠️ Historical UUID annotation rate below target. This is a data-quality warning, not a structural chain failure.
- ⚠️ memories 标注率 0% < 80%（历史数据债务）
- ⚠️ Historical UUID annotation rate below target. This is a data-quality warning, not a structural chain failure.
- ⚠️ conversations 标注率 64% < 80%（历史数据债务）
- ℹ️ src/webui/chat/persistence-stage.ts: "belong_entity_uuid" 出现 2 次
- ℹ️ src/m2/SQLiteAdapter.ts: "belong_entity_uuid" 出现 25 次
- ℹ️ src/m2/SQLiteAdapter.ts: "black_diamond" 出现 18 次
- ℹ️ src/app/knowledge/KnowledgeEngine.ts: "belong_entity_uuid" 出现 3 次
- ℹ️ src/m4/household/UUIDGatekeeper.ts: "UUIDGatekeeper" 出现 3 次
- ℹ️ src/webui/chat/MeetingContextPipeline.ts: "belong_entity_uuid" 出现 7 次
- ℹ️ UUID 归属关键词共出现 58 次（结构完整）
- ℹ️ memories: 0/1587 已标注 (0%)
- ℹ️ conversations: 3092/4822 已标注 (64%)

## 6. Deviation Vector

```yaml
prompt_injection_order_risk: 0
meeting_identity_leakage: 0
roleplay_fg_pollution: 0
role_state_residue: 0
uuid_misownership: 0
uuid_annotation_rate_drop: 0.5
familygraph_schema_drift: 0
sqlite_persistence_loss: 0
llm_reasoning_content_leak: 0
behavior_regression: 0
python_domain_isolation_break: 0
globalbus_protocol_violation: 0
```

## 7. Gate Decision

**GATE: PASS**

## 8. Required Human Review

_(无)_

## 9. Next Steps

- Gate 已通过，可继续开发
