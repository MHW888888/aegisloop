# AegisLoop Launch Posts

Ready-to-copy posts for sharing AegisLoop. Keep the tone practical: no fake benchmarks, no spam, no "fully autonomous" claims.

Repository: https://github.com/MHW888888/aegisloop

## English Short Post

```text
I just released AegisLoop, a guarded control plane for explicit ChatGPT-to-local-Codex execution.

Codex now has native ChatGPT, app, editor, and terminal routes. AegisLoop complements them when you need to bind a dedicated ChatGPT runner to an existing local session with explicit arming, workspace locks, ACK/NACK result handling, Run Capsules, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## English v0.3.17 Post

```text
AegisLoop v0.3.17 is live.

It makes the execution route explicit now that Codex is built into ChatGPT too. Native Codex remains the best default for native tasks; AegisLoop is for dedicated ChatGPT runner threads bound to existing local Codex sessions.

The panel now shows `Execution route: AegisLoop local bridge`, prompts avoid accidental built-in Codex handoffs, and GPT-5.6 Sol/Terra/Luna are tracked as real-browser smoke targets.

GitHub: https://github.com/MHW888888/aegisloop
```

## English Longer Post

```text
I built AegisLoop because I wanted a more explicit way to run ChatGPT x local Codex engineering loops.

The flow is simple:

- ChatGPT plans the next local task.
- Codex executes it in a real local workspace.
- AegisLoop sends the result back to ChatGPT.
- Local gates decide whether the next step is allowed.

It does not replace Codex built into ChatGPT, the Codex app, editors, or terminals. It is a small local control plane for people who specifically want browser-based planning bound to an existing local session, with Chat Mode by default, explicit arming, workspace locks, Run Capsules, result ACK/NACK, dedupe, and JSONL audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## Show HN Draft

Title:

```text
Show HN: AegisLoop - a guarded control plane for ChatGPT-to-local-Codex execution
```

Body:

```text
I built AegisLoop to connect a dedicated ChatGPT runner conversation to an existing local Codex session.

Codex now has native ChatGPT, app, editor, terminal, and cloud workflows. AegisLoop complements those routes when explicit local-session binding, arming, isolation, recovery, and audit state matter.

The goal is not fully unbounded autonomy. The goal is a bounded loop: ChatGPT plans the next step, Codex executes locally, and a local bridge sends the result back with explicit arming, workspace locks, dedupe, Run Capsules, ACK/NACK, and audit logs.

It is local-first, MIT licensed, and currently focused on safer first-run onboarding, multi-thread run isolation, and real browser/model compatibility.

GitHub: https://github.com/MHW888888/aegisloop
```

## 中文短帖

```text
我整理发布了一个小项目：AegisLoop。

它是一个 ChatGPT x Codex 的本地自动化桥：ChatGPT 负责规划下一步，Codex 在本地项目里执行，AegisLoop 负责把结果带回去，同时加上显式授权、工作区锁、Run Capsule、ACK/NACK 和审计日志。

它不是为了“完全无人驾驶”，而是为了让多轮工程自动化更可控、更可追踪。

GitHub: https://github.com/MHW888888/aegisloop
```

## 中文 v0.3.17 帖

```text
AegisLoop v0.3.17 更新了。

Codex 已经融入 ChatGPT、Codex 应用、编辑器和终端。AegisLoop 不替代这些原生入口，而是补充一种更明确的路线：让专用 ChatGPT 执行线程继续指定的本地 Codex session。

这版会在面板中明确显示 `Execution route: AegisLoop local bridge`，并减少 GPT-5.6 等模型误启动内置 Codex 的情况。GPT-5.6 Sol、Terra、Luna 已加入真实浏览器测试目标，但在收到 smoke report 前不会宣称全部验证通过。

GitHub: https://github.com/MHW888888/aegisloop
```

## 中文朋友圈版

```text
记录一下，最近把一个真实工作流里长出来的小工具整理到了 GitHub：AegisLoop。

它做的事很直接：ChatGPT 规划下一步，本地 Codex 执行，AegisLoop 在中间负责连接、回传结果和加安全边界。

我最关心的不是“让 AI 自动乱跑”，而是让多轮工程任务可控：默认 Chat Mode、显式 Arm、turn token 防旧指令复活、workspace lock、Run Capsule、ACK/NACK、审计日志。

目前还在早期，但已经能作为一个 local-first 的 ChatGPT-to-Codex control plane 使用。

GitHub: https://github.com/MHW888888/aegisloop
```

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
