/**
 * @deprecated engine/brain/ 已重命名为 engine/reflex/
 * 此文件为向后兼容 re-export stub，Phase 3 迁移完成后删除。
 *
 * "brain" = 脑干反射层 (L0Classifier + SafetyInterceptor + CommunicationMode)
 * 注意: 此目录与 app/brain/ (海马体模块 re-export stubs) 完全不同
 */
export * from '../reflex/index.js';
