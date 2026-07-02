#!/usr/bin/env node
/**
 * 清理knowledge-md中乱码文件
 * 策略：有正常版的删乱码版，可修复的重命名，无法修复的删除
 */
const fs = require('fs');
const path = require('path');

const dir = 'D:/wenstar/data/knowledge-md';
const cabDir = 'D:/wenstar/data/knowledge-cabinet/docs';

const log = [];
function fixFile(bytes) {
  return Buffer.from(bytes).toString('utf-8').replace(/^# /, '').replace(/^#+/, '').trim();
}
function hasChinese(s) {
  return [...s].some(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
}
const garbledRe = /[ÃÅÆÇÉÐÝÞßàáâãäåæçèéêëìíîïðòóôõöøùúûüýþ]/;

const files = fs.readdirSync(dir);
const garbledFiles = files.filter(f => garbledRe.test(f));

let deleted = 0, renamed = 0;

for (const gf of garbledFiles) {
  const bytes = [];
  for (let i = 0; i < gf.length; i++) bytes.push(gf.charCodeAt(i));
  const fixed = fixFile(bytes);
  const hasCn = hasChinese(fixed);
  const fixOk = hasCn && !garbledRe.test(fixed);

  // 检查是否有正常版本
  let hasNormal = false;
  if (fixOk) {
    const cleanFixed = fixed.replace(/^#\s*/, '').replace(/^#+/, '').trim();
    for (const f of files) {
      if (f === gf || garbledRe.test(f)) continue;
      if (f === cleanFixed || cleanFixed.startsWith(f) || f.startsWith(cleanFixed)) {
        hasNormal = true; break;
      }
    }
  }

  const gfPath = path.join(dir, gf);
  const cabPath = path.join(cabDir, gf.replace(/\.md$/, '.txt'));

  if (hasNormal) {
    // 有正常版 → 删除乱码文件
    fs.unlinkSync(gfPath);
    if (fs.existsSync(cabPath)) fs.unlinkSync(cabPath);
    deleted++;
    log.push(`🗑️ 删除(有正常版): ${gf.substring(0,40)}`);
  } else if (fixOk) {
    // 可修复 → 重命名
    const newName = fixed;
    const newPath = path.join(dir, newName);
    if (!fs.existsSync(newPath)) {
      // 修复文件内容（可能内容也乱码）
      let content = fs.readFileSync(gfPath, 'utf-8');
      // 检查内容是否也乱码
      if (garbledRe.test(content)) {
        // 尝试修复内容
        const contentBytes = [];
        for (let i = 0; i < content.length; i++) contentBytes.push(content.charCodeAt(i));
        const fixedContent = Buffer.from(contentBytes).toString('utf-8');
        if (hasChinese(fixedContent) && !garbledRe.test(fixedContent)) {
          content = fixedContent;
          log.push(`  (内容也修复了)`);
        }
      }
      fs.writeFileSync(newPath, content, 'utf-8');
      fs.unlinkSync(gfPath);
      renamed++;
      log.push(`🔄 重命名: ${gf.substring(0,30)} → ${newName.substring(0,40)}`);
    }
  } else {
    // 无法修复直接删
    fs.unlinkSync(gfPath);
    if (fs.existsSync(cabPath)) fs.unlinkSync(cabPath);
    deleted++;
    log.push(`🗑️ 删除(无法修复): ${gf.substring(0,40)}`);
  }
}

console.log(`✅ 完成: 删除 ${deleted} 个, 重命名 ${renamed} 个`);
console.log('');
for (const l of log) console.log(l);

// 验证
const remaining = fs.readdirSync(dir);
const stillGarbled = remaining.filter(f => garbledRe.test(f));
console.log(`\n残留乱码文件: ${stillGarbled.length} 个`);
if (stillGarbled.length > 0) for (const f of stillGarbled) console.log('  ⚠️ ' + f);
