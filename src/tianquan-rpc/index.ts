/**
 * src/tianquan-rpc/ — 天权 RPC 客户端 + MasterHarris 调度器
 * ==========================================================
 * 原 src/tianquan/ — 为避免与 engine/tianquan/ (仿生智脑四域) 混淆而重命名。
 *
 * tianquan-rpc = RPC + MasterHarris + GlobalBusClient + SpecLoader
 * engine/tianquan/ = 仿生智脑五域 (prefrontal/temporal/heart/knowledge/bus)
 *
 * 旧路径 src/tianquan/ 仍可用 (向后兼容)
 */
export * from '../tianquan/index.js';
