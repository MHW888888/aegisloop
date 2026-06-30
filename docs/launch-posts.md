# AegisLoop Launch Posts

## English Short Post

I just released AegisLoop, a guarded local bridge that lets ChatGPT plan and Codex execute in a real local workspace.

It connects a ChatGPT web conversation to a local Codex session, then adds the parts I kept needing in practice: local gates, workspace locks, dedupe, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop

## English v0.2.0 Lite Post

AegisLoop v0.2.0 is out: a simpler "Lite" pass focused on first-run clarity.

The project still does the same thing: ChatGPT plans, local Codex executes, and a local bridge keeps the loop bounded with gates, workspace locks, dedupe, and audit logs.

This release makes it easier to understand and try: clearer README positioning, friendlier extension labels, a first-run guide, and troubleshooting docs.

GitHub: https://github.com/MHW888888/aegisloop

## English v0.3.0 Parallel Safe Mode Post

AegisLoop v0.3.0 adds Parallel Safe Mode.

The problem: two ChatGPT conversations can be separated by conversation id, but still collide semantically if they read the same project and use the same stage names.

Run Capsules add `projectId`, `activeBranch`, `runId`, and an external write root. In readonly mode, Codex runs from that external root while treating the source project as read-only context.

GitHub: https://github.com/MHW888888/aegisloop

## English Longer Post

I built AegisLoop because I wanted a safer way to run ChatGPT x Codex loops.

The idea is simple:

- ChatGPT plans the next step.
- Codex executes locally.
- AegisLoop carries the result back.
- Local gates decide what is allowed to continue.

It is local-first, bound by config, and includes workspace locking, content-hash dedupe, denylist gates, and JSONL audit logs.

It is not meant to be magic. It is meant to make agentic workflows more inspectable.

GitHub: https://github.com/MHW888888/aegisloop

## 中文短帖

记录一个小项目：AegisLoop。
它是一个 ChatGPT x Codex 的本地自动化桥，让 ChatGPT 负责规划和复盘，让 Codex 在本地项目里执行，同时加上本地闸门、工作区锁、去重和审计日志。
不是为了“完全无人驾驶”，而是为了让自动化循环更可控、更可追踪。

GitHub: https://github.com/MHW888888/aegisloop

## 中文 v0.2.0 Lite 版

AegisLoop v0.2.0 发了，这版重点不是堆复杂功能，而是做“亲民 Lite 版”。

它还是那个核心思路：ChatGPT 负责规划，本地 Codex 负责执行，中间由本地 bridge 加安全闸门、工作区锁、去重和审计日志。

这版主要改了 README 首屏表达、扩展面板文案、首次运行指南和排错文档，让第一次看到的人更容易理解，也更敢上手。

GitHub: https://github.com/MHW888888/aegisloop

## 中文 v0.3.0 Parallel Safe Mode 版

AegisLoop v0.3.0 加了 Parallel Safe Mode。

之前的问题是：两个 ChatGPT 对话虽然传输层按 conversation id 分开，但如果读同一个项目目录、阶段名又都叫 F8/F9，就会在项目语义层撞车。

Run Capsule 会给每个线程加上 `projectId`、`activeBranch`、`runId` 和外部写入目录。readonly 模式下，Codex 从外部 runtime 目录执行，把原项目当只读上下文，降低多线程跑串线的风险。

GitHub: https://github.com/MHW888888/aegisloop

## 中文朋友圈版

记录一下，第一个正式整理发布到 GitHub 的小项目：AegisLoop。

它是我最近做的一个 ChatGPT x Codex 本地自动化桥：ChatGPT 负责规划和复盘，Codex 负责本地执行，中间加上安全闸门、工作区锁、去重和审计日志。

不算大，但它是真实从自己的工作流里长出来的。先开源出来，继续慢慢打磨。

GitHub: https://github.com/MHW888888/aegisloop

## Suggested GitHub Topics

```text
chatgpt
codex
ai-agents
agentic-workflow
automation
chrome-extension
local-first
developer-tools
llmops
workflow-automation
```
