# AegisLoop Share Kit

This page gives maintainers and contributors copy-ready material for sharing AegisLoop.

Repository: https://github.com/MHW888888/aegisloop

## Short Description

AegisLoop lets ChatGPT plan a coding task while local Codex executes it safely, one guarded step at a time.

## Chinese Short Description

AegisLoop 让 ChatGPT 负责规划，让本地 Codex 负责执行，中间加安全闸门，避免自动化失控。

## What To Say In 10 Seconds

ChatGPT is good at planning. Codex is good at local execution. AegisLoop connects them with local gates, explicit arming, Run Capsules, workspace locks, dedupe, ACK/NACK, and audit logs.

## 中文 10 秒介绍

ChatGPT 擅长规划，Codex 擅长本地执行。AegisLoop 把两者接起来，并加上本地闸门、显式授权、Run Capsule、工作区锁、去重、ACK/NACK 和审计日志。

## Where To Share

- GitHub profile pinned repository
- X / Twitter
- LinkedIn
- Hacker News "Show HN"
- V2EX
- Reddit communities that allow project sharing
- Developer WeChat groups
- Personal blog or newsletter

Share only where project posts are welcome. Avoid repeated reposting.

## X / Twitter Draft

```text
I built AegisLoop: a guarded local bridge where ChatGPT plans and Codex executes.

It keeps the loop local-first with explicit arming, nonce checks, workspace locks, Run Capsules, dedupe, ACK/NACK, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## LinkedIn Draft

```text
I have been experimenting with safer agentic coding loops and published AegisLoop.

It connects a ChatGPT web conversation to a local Codex session. ChatGPT plans the next step, Codex executes locally, and AegisLoop carries the result back through a guarded local bridge.

The focus is not unbounded autonomy. The focus is practical control: Chat Mode by default, explicit arming, nonce checks, workspace locks, Run Capsules, dedupe, ACK/NACK result handling, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## 中文朋友圈 / 微信群草稿

```text
最近把一个真实工作流里长出来的小工具整理到了 GitHub：AegisLoop。

它是一个 ChatGPT x Codex 本地自动化桥：ChatGPT 负责规划，Codex 在本地执行，AegisLoop 负责连接、回传和加安全边界。

我最关心的不是“完全无人驾驶”，而是可控：默认 Chat Mode、显式 Arm、nonce、防旧指令复活、workspace lock、Run Capsule、ACK/NACK、审计日志。

GitHub: https://github.com/MHW888888/aegisloop
```

## Show HN Draft

```text
Show HN: AegisLoop - guarded ChatGPT-to-Codex local automation

I built AegisLoop to connect a ChatGPT web conversation to a local Codex session.

The goal is a bounded engineering loop: ChatGPT plans, Codex executes locally, and a local bridge returns the result with gates, workspace locks, Run Capsules, dedupe, ACK/NACK, and audit logs.

It is local-first, MIT licensed, and still early. Feedback on onboarding, safety model, and extension UX would be very welcome.

https://github.com/MHW888888/aegisloop
```

## Maintainer Reply Template

Use this when someone asks to work on an issue:

```text
Hi @USERNAME, thanks for your interest!

That sounds great. Please feel free to work on this issue. Please keep the change small, include a simple check or example where useful, and avoid committing local runtime files, real conversation IDs, paths, or tokens.

Looking forward to your PR!
```
