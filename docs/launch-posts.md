# AegisLoop Launch Posts

Ready-to-copy posts for sharing AegisLoop. Keep the tone practical: no hype, no fake benchmarks, no spam.

Repository: https://github.com/MHW888888/aegisloop

## English Short Post

I just released AegisLoop, a guarded local bridge that lets ChatGPT plan and local Codex execute in a real workspace.

It keeps the loop local-first and bounded with safety gates, workspace locks, dedupe, ACK/NACK result handling, Run Capsules, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop

## English v0.3.6 Post

AegisLoop v0.3.6 is live.

It is a local-first ChatGPT-to-Codex bridge: ChatGPT plans the next step, Codex executes locally, and AegisLoop carries results back with gates, locks, dedupe, audit logs, and Run Capsules.

This version improves the browser-to-bridge path with adaptive polling: faster checks while a run is active, slower checks while idle, and DOM-change nudges when ChatGPT posts a new message.

GitHub: https://github.com/MHW888888/aegisloop

## English Longer Post

I built AegisLoop because I wanted a safer way to run ChatGPT x Codex engineering loops.

The flow is simple:

- ChatGPT plans the next local task.
- Codex executes it in a real local workspace.
- AegisLoop sends the result back to ChatGPT.
- Local gates decide whether the next step is allowed.

It is not trying to be a full agent platform. It is a small local control plane for people who want browser-based planning plus local execution, with guardrails: Chat Mode by default, explicit arming, nonce checks, workspace locks, Run Capsules, result ACK/NACK, dedupe, and JSONL audit logs.

GitHub: https://github.com/MHW888888/aegisloop

## Show HN Draft

Title:

```text
Show HN: AegisLoop - a guarded ChatGPT-to-Codex local automation bridge
```

Body:

```text
I built AegisLoop to connect a ChatGPT web conversation to a local Codex session.

The goal is not fully unbounded autonomy. The goal is a bounded loop:
ChatGPT plans the next step, Codex executes locally, and a local bridge sends the result back with gates, workspace locks, dedupe, Run Capsules, and audit logs.

It is local-first, MIT licensed, and currently focused on safer first-run onboarding and multi-thread run isolation.

GitHub: https://github.com/MHW888888/aegisloop
```

## 中文短帖

我整理发布了一个小项目：AegisLoop。

它是一个 ChatGPT x Codex 的本地自动化桥：ChatGPT 负责规划下一步，Codex 在本地项目里执行，AegisLoop 负责把结果带回去，同时加上本地安全闸门、工作区锁、去重、Run Capsule 和审计日志。

它不是为了“完全无人驾驶”，而是为了让多轮工程自动化更可控、更可追踪。

GitHub: https://github.com/MHW888888/aegisloop

## 中文 v0.3.6 帖

AegisLoop v0.3.6 更新了。

一句话：让 ChatGPT 负责规划，让本地 Codex 负责执行，中间用本地 bridge 加安全闸门、工作区锁、去重、ACK/NACK、Run Capsule 和审计日志。

这版主要优化浏览器到本地 bridge 的通路：运行中检查更快，空闲时更安静，ChatGPT 页面有新回复时会更快触发检查。

GitHub: https://github.com/MHW888888/aegisloop

## 中文朋友圈版

记录一下，最近把一个真实工作流里长出来的小工具整理到了 GitHub：AegisLoop。

它做的事很直接：ChatGPT 规划下一步，本地 Codex 执行，AegisLoop 在中间负责连接、回传结果和加安全边界。

我最关心的不是“让 AI 自动乱跑”，而是让多轮工程任务可控：默认 Chat Mode、显式 Arm、nonce、防旧指令复活、workspace lock、Run Capsule、审计日志。

目前还在早期，但已经能作为一个 local-first 的 ChatGPT-to-Codex control plane 使用。

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
