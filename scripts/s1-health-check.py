#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""S1 灰度验证每日健康检查"""
import urllib.request, urllib.error, json, os, sys
sys.stdout.reconfigure(encoding='utf-8')

API = "http://localhost:3000"
SERVER_LOG = None
for p in ['/tmp/server.log', 'C:\\tmp\\server.log']:
    if os.path.exists(p):
        SERVER_LOG = p
        break

PASS, FAIL = 0, 0
def check(name, ok, detail=""):
    global PASS, FAIL
    if ok: PASS += 1; print(f"  [OK] {name} {detail}")
    else: FAIL += 1; print(f"  [FAIL] {name} {detail}")

print("=" * 50)
print(" S1 Health Check Report")
print("=" * 50)

try:
    r = urllib.request.urlopen(f"{API}/api/knowledge?limit=1", timeout=5)
    check("Server online", True)
except Exception as e:
    check("Server online", False)

try:
    r = urllib.request.urlopen(f"{API}/api/knowledge?limit=200", timeout=5)
    kb = json.loads(r.read().decode("utf-8"))
    check("Knowledge base", kb.get("total",0) > 0, f"({kb.get('total',0)} items)")
except: check("Knowledge base", False)

try:
    r = urllib.request.urlopen(f"{API}/api/engine/heart", timeout=5)
    h = json.loads(r.read().decode("utf-8"))
    s, rm = h["state"], h["state"]["relationMetrics"]
    lb = s.get("emotionLabel",{}) or {}
    check("Heart system", True, f'rel={s["relationState"]} label={lb.get("label","?")} trust={rm.get("trust","?")}')
except: check("Heart system", False)

try:
    r = urllib.request.urlopen(f"{API}/api/engine/prompt", timeout=5)
    p = r.read().decode("utf-8")
    check("PromptComposer", len(p) > 500, f"({len(p)} chars)")
except: check("PromptComposer", False)

if SERVER_LOG:
    with open(SERVER_LOG, "r", encoding="utf-8", errors="replace") as f:
        log = f.read()
    tc = log.count("[T:")
    check("traceId logs", tc > 5, f"({tc} entries)")
    fb = log.count("rollback") + log.count("fallback") + log.count("exception in new arch")
    check("No exception fallback", fb == 0, f"(found {fb})")
else:
    check("traceId logs", False, "(log not found)")

try:
    r = urllib.request.urlopen(f"{API}/_hooks/monitor", timeout=5)
    mon = json.loads(r.read().decode("utf-8"))
    cards = mon.get("cards", [])
    g = sum(1 for c in cards if c.get("status") == "green")
    red = sum(1 for c in cards if c.get("status") == "red")
    tc = sum(c.get("callCount",0) for c in cards)
    check("Probes", len(cards) == 14, f"({len(cards)} total, {g} green, {red} red, {tc} calls)")
except: check("Probes", False)

print("-" * 30)
print(f"  PASS: {PASS} | FAIL: {FAIL}")
if FAIL == 0: print("  STATUS: HEALTHY")
else: print("  STATUS: NEEDS ATTENTION")
print("=" * 50)
