/**
 * paths — 全局路径常量
 *
 * 统一管理所有数据库路径、配置路径、备份路径
 * 消除多处硬编码路径不一致问题（如双份 family_graph.db）
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── 项目根路径（向上3层：common/const/ → src/ → 项目根） ───
export const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// ─── 数据目录 ───
export const DATA_DIR = join(PROJECT_ROOT, 'data');
export const WEBUI_DATA_DIR = join(DATA_DIR, 'webui');
export const KNOWLEDGE_DIR = join(DATA_DIR, 'knowledge');
export const BACKUP_DIR = join(WEBUI_DATA_DIR, 'backups');

// ─── 数据库路径 ───
export const FUSION_MEMORY_DB = join(WEBUI_DATA_DIR, 'fusion_memory.db');
export const FAMILY_GRAPH_DB = join(WEBUI_DATA_DIR, 'knowledge', 'family_graph.db');
export const VAULT_DB = join(PROJECT_ROOT, 'data', 'memory-vault', 'vault.db');

// ─── 备份路径 ───
export const FG_BACKUP_DIR = join(BACKUP_DIR, 'family_graph');

// ─── 旧版FG路径（已废弃，仅用于迁移检查） ───
export const LEGACY_FAMILY_GRAPH_DB = join(KNOWLEDGE_DIR, 'family_graph.db');
