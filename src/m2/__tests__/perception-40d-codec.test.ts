/**
 * PerceptionVector40DCodec — 40D 编码版本标识（__v）单测
 * V12.4 数据安全过渡：编码标识码向后兼容 v1/v2/v0 三种格式。
 * 覆盖：
 *   encode 输出 v2 `{__v:2, dims:[40]}` 格式
 *   decode 兼容 v2/v1纯数组/v0命名对象
 *   detect 版本识别
 *   坏数据/null 边界
 */
import { describe, it, expect } from 'vitest';
import {
  encodePerceptionV40,
  decodePerceptionV40,
  detectPerceptionV40Version,
  PERCEPTION_40D_ENCODING_VERSION,
} from '../PerceptionVector40DCodec.js';
import { createEmptyPerceptionV40, PERCEPTION_40D_KEYS } from '../../m3/types/perception-40d.js';

function makeP(partial: Record<string, number>) {
  const p = createEmptyPerceptionV40();
  for (const [k, v] of Object.entries(partial)) (p as any)[k] = v;
  return p;
}

describe('encodePerceptionV40 (v2 带 __v 标识)', () => {
  it('输出 JSON 对象含 __v=2 + dims 数组(40)', () => {
    const p = makeP({ d12_enjoyment: 0.7, d33_sexual_attraction: 0.8 });
    const s = encodePerceptionV40(p);
    const obj = JSON.parse(s);
    expect(obj.__v).toBe(2);
    expect(Array.isArray(obj.dims)).toBe(true);
    expect(obj.dims.length).toBe(40);
  });

  it('dims 顺序与 PERCEPTION_40D_KEYS 一致', () => {
    const p = makeP({ d01_muscle_load: 0.3, d40_possessiveness: 0.9 });
    const obj = JSON.parse(encodePerceptionV40(p));
    expect(obj.dims[0]).toBe(0.3);
    expect(obj.dims[39]).toBe(0.9);
    expect(obj.dims[11]).toBe(0); // d12 未设 → 0
  });

  it('版本常量 = 2', () => {
    expect(PERCEPTION_40D_ENCODING_VERSION).toBe(2);
  });
});

describe('decodePerceptionV40 (向后兼容)', () => {
  it('v2 对象格式解码', () => {
    const p = makeP({ d15_partner_attachment: 0.6 });
    const dec = decodePerceptionV40(encodePerceptionV40(p));
    expect(dec?.d15_partner_attachment).toBe(0.6);
  });

  it('v1 纯数组（40 元素）解码', () => {
    const arr = new Array(40).fill(0);
    arr[11] = 0.5; // d12
    const dec = decodePerceptionV40(JSON.stringify(arr));
    expect(dec?.d12_enjoyment).toBe(0.5);
  });

  it('v0 命名对象（无 dims）解码', () => {
    const dec = decodePerceptionV40(JSON.stringify({ d12_enjoyment: 0.9 }));
    expect(dec?.d12_enjoyment).toBe(0.9);
  });

  it('长度不对返回 null', () => {
    expect(decodePerceptionV40('[1,2,3]')).toBeNull();
    expect(decodePerceptionV40(JSON.stringify({ __v: 2, dims: [1, 2, 3] }))).toBeNull();
  });

  it('v2 中 dims 非数组 → null（S4 P2 修复）', () => {
    expect(decodePerceptionV40(JSON.stringify({ __v: 2, dims: 'not-array' }))).toBeNull();
    expect(decodePerceptionV40(JSON.stringify({ __v: 2 }))).toBeNull();
  });

  it('__v 不匹配当前版本 → 走 v0 命名对象解析', () => {
    // __v:1 不是当前版本，但对象无 dims → 走 v0 命名对象分支
    const dec = decodePerceptionV40(JSON.stringify({ __v: 1, d12_enjoyment: 0.5 }));
    expect(dec?.d12_enjoyment).toBe(0.5);
  });

  it('null/空/坏 JSON 返回 null', () => {
    expect(decodePerceptionV40(null)).toBeNull();
    expect(decodePerceptionV40('')).toBeNull();
    expect(decodePerceptionV40('not-json')).toBeNull();
  });
});

describe('detectPerceptionV40Version', () => {
  it('识别 v2 对象', () => {
    const p = makeP({});
    expect(detectPerceptionV40Version(encodePerceptionV40(p))).toBe(2);
  });

  it('识别 v1 纯数组', () => {
    expect(detectPerceptionV40Version(JSON.stringify(new Array(40).fill(0)))).toBe(1);
  });

  it('识别 v0 命名对象', () => {
    expect(detectPerceptionV40Version(JSON.stringify({ d12_enjoyment: 0.5 }))).toBe(0);
  });

  it('坏数据/null → -1', () => {
    expect(detectPerceptionV40Version(null)).toBe(-1);
    expect(detectPerceptionV40Version('bad')).toBe(-1);
  });
});

describe('PERCEPTION_40D_KEYS 完整性', () => {
  it('恰好 40 个维度', () => {
    expect(PERCEPTION_40D_KEYS.length).toBe(40);
  });
});
