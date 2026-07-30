/**
 * 修复熊梓铭 — 第二轮：socialIdentity + 时间感知
 * 执行: npx tsx scripts/fix-xzm-v2.ts
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'webui', 'knowledge', 'family_graph.db');

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(DB_PATH));

  const r = db.exec("SELECT id, properties FROM nodes WHERE name = '熊梓铭'");
  if (r.length === 0) { console.error('未找到'); db.close(); return; }

  const id = r[0].values[0][0];
  const p = JSON.parse(r[0].values[0][1] as string);

  // ── 清理 socialIdentity ──
  let dossier = p.dossier;
  if (typeof dossier === 'string') dossier = JSON.parse(dossier);
  if (!dossier || typeof dossier !== 'object') dossier = {};

  const before = JSON.stringify((dossier as any).socialIdentity || {});
  (dossier as any).socialIdentity = {};
  console.log('socialIdentity: ' + before + ' → {}');

  // 确保 education
  if (!(dossier as any).basicInfo) (dossier as any).basicInfo = {};
  (dossier as any).basicInfo.gender = '女';
  (dossier as any).basicInfo.birthYear = 2008;
  (dossier as any).basicInfo.education = '大学在读';
  console.log('basicInfo: ' + JSON.stringify((dossier as any).basicInfo));

  // 顶级字段
  p.gender = '女';
  p.dossier = dossier;

  db.run('UPDATE nodes SET properties = (?) WHERE id = (?)', [JSON.stringify(p), id]);
  writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('✅ 已落盘');

  // 验证
  const v = db.exec("SELECT name, properties FROM nodes WHERE name = '熊梓铭'");
  const vp = JSON.parse(v[0].values[0][1] as string);
  const vd = vp.dossier || {};
  console.log('\n=== 验证 ===');
  console.log('gender: ' + vp.gender);
  console.log('basicInfo: ' + JSON.stringify(vd.basicInfo));
  console.log('socialIdentity: ' + JSON.stringify(vd.socialIdentity));
  console.log('currentOccupation: ' + ((vd.socialIdentity as any)?.currentOccupation || '(已清除)'));
  db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
