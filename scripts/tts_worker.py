#!/usr/bin/env python3
"""tts_worker.py — edge-tts 常驻合成 worker（V25 预热优化）

复用 Python 进程 + 模块级 import edge_tts，省去每次 fork 进程 + import 的 ~1.4s。
通过 stdin/stdout 行协议与 TypeScript 侧 TTSWorker 通信，asyncio 并发合成（保持并发上限）。

协议（每行一个 JSON，UTF-8）：
  请求: {"id": "<uuid>", "text": "<要合成的文本>", "path": "<输出 mp3 绝对路径>"}
  响应: {"id": "<uuid>", "ok": true}  或  {"id": "<uuid>", "ok": false, "error": "<原因>"}

注意：
  - 必须用 edge-tts 宿主 Python（Python 3.13）运行，不能用 PATH 里 hermes venv 的 3.11。
  - 合成失败由 TS 侧重试（NoAudioReceived 空文件检测仍在 generateTTSAudio 的 genOne 里）。
"""
import sys
import json
import asyncio

import edge_tts

# 🔴 Windows 下 stdin/stdout 默认按 locale(GBK) 解码，读 UTF-8 JSON 会把中文弄成 surrogate
# （UnicodeEncodeError: surrogates not allowed）。显式强制 UTF-8，否则中文合成必失败。
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

VOICE = "zh-CN-XiaoxiaoNeural"


async def synth(req):
    """合成单段音频。返回协议响应 dict；异常不外抛，回传 TS 侧统一重试/日志。"""
    rid = req.get("id")
    text = req.get("text", "")
    path = req.get("path", "")
    if not text.strip() or not path:
        return {"id": rid, "ok": False, "error": "empty text/path"}
    try:
        c = edge_tts.Communicate(text, VOICE)
        await c.save(path)
        return {"id": rid, "ok": True}
    except Exception as e:  # noqa: BLE001 — 错误回传 TS 侧重试，不静默吞
        return {"id": rid, "ok": False, "error": f"{type(e).__name__}: {e}"}


async def handle(req):
    """合成 + 立即输出协议响应（每请求一行，按 id 匹配，乱序无妨）。"""
    resp = await synth(req)
    print(json.dumps(resp, ensure_ascii=False), flush=True)


async def main():
    loop = asyncio.get_running_loop()
    tasks = set()
    while True:
        # 同步 stdin.read 会阻塞事件循环 → 放 executor 线程读，保证合成 task 并发执行
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:  # EOF（父进程退出）→ 等剩余任务完成再退
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        task = asyncio.create_task(handle(req))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
