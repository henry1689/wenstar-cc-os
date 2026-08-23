@echo off
rem 太虚境 WebUI 最小化启动 — 避免 npm/cmd 弹窗
rem 用法: 双击或 start-webui-min.bat
cd /d D:\tools\wenstar-cc
rem /MIN 最小化窗口启动 start.cjs；start.cjs 内部已 windowsHide，server 无窗口
start "WebUI" /MIN cmd /c "cd /d D:\tools\wenstar-cc && node start.cjs"
