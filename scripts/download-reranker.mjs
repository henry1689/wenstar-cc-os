#!/usr/bin/env node
/**
 * 下载 bge-reranker-v2-m3 ONNX 模型文件到 data/models/bge-reranker/
 * 从 HuggingFace Hub 下载 onnx/ 目录下的量化模型
 */
import { createWriteStream, existsSync, mkdirSync, writeFileSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'https';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = join(__dirname, '..', 'data', 'models', 'bge-reranker');

// 国内镜像: hf-mirror.com (HuggingFace 镜像站)
const MIRROR = 'https://hf-mirror.com';
const FILES = {
  'model.onnx': `${MIRROR}/BAAI/bge-reranker-v2-m3/resolve/main/onnx/model.onnx`,
  'tokenizer.json': `${MIRROR}/BAAI/bge-reranker-v2-m3/resolve/main/tokenizer.json`,
  'config.json': `${MIRROR}/BAAI/bge-reranker-v2-m3/resolve/main/config.json`,
  'tokenizer_config.json': `${MIRROR}/BAAI/bge-reranker-v2-m3/resolve/main/tokenizer_config.json`,
};

async function downloadFile(url, dest) {
  if (existsSync(dest)) {
    const stat = statSync(dest);
    if (stat.size > 0) {
      console.log(`  ⏭️  已存在: ${dest.split('/').pop()} (${(stat.size/1024/1024).toFixed(1)}MB)`);
      return;
    }
  }
  return new Promise((resolve, reject) => {
    const fname = url.split('/').pop();
    console.log(`  ⬇ 下载: ${fname} ...`);
    const file = createWriteStream(dest);
    let totalSize = 0;
    const startTime = Date.now();
    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize % (1024 * 1024 * 5) < chunk.length) {
          process.stdout.write(`\r  ⬇ ${fname}: ${(totalSize/1024/1024).toFixed(0)}MB...`);
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\r  ✅ ${fname}: ${(totalSize/1024/1024).toFixed(1)}MB (${elapsed}s)`);
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (existsSync(dest)) unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  if (!existsSync(MODEL_DIR)) mkdirSync(MODEL_DIR, { recursive: true });
  console.log(`模型目录: ${MODEL_DIR}\n`);

  for (const [name, url] of Object.entries(FILES)) {
    const dest = join(MODEL_DIR, name);
    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`  ❌ ${name}: ${err.message}`);
      // 非关键文件不阻塞
    }
  }

  // 检查 model.onnx 是否存在
  const modelPath = join(MODEL_DIR, 'model.onnx');
  if (existsSync(modelPath)) {
    console.log(`\n✅ 模型就绪: ${modelPath}`);
  } else {
    console.log(`\n⚠️ 模型未下载成功，Cross-Encoder 将降级 Noop`);
  }
}

main().catch(console.error);
