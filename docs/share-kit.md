# AegisLoop Share Kit

Copy-ready material for sharing AegisLoop without overclaiming.

Repository: https://github.com/MHW888888/aegisloop

## Short Description

AegisLoop lets ChatGPT plan a coding task while local Codex executes it safely, one guarded step at a time.

## 中文短介绍

AegisLoop 让 ChatGPT 负责规划，让本地 Codex 负责执行，中间用本地 bridge 加上显式授权、运行边界、结果确认和审计日志。

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
- Xiaohongshu developer / AI tool notes
- Personal blog or newsletter

Share only where project posts are welcome. Avoid repeated reposting.

## X / Twitter Draft

```text
I built AegisLoop: a guarded local bridge where ChatGPT plans and Codex executes.

It keeps the loop local-first with explicit arming, turn tokens, workspace locks, Run Capsules, dedupe, ACK/NACK, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## X / Twitter Recruitment Draft

```text
Looking for a few 5-minute testers for AegisLoop.

No coding required.

Need reports for Chrome / Edge / Brave / macOS / Windows and ChatGPT model switching.

Goal: switching GPT-5.5 / 5.4 / 5.3 / o3 should keep the same ChatGPT conversation -> same local Codex route.

https://github.com/MHW888888/aegisloop
```

## LinkedIn Draft

```text
I have been experimenting with safer agentic coding loops and published AegisLoop.

It connects a ChatGPT web conversation to a local Codex session. ChatGPT plans the next step, Codex executes locally, and AegisLoop carries the result back through a guarded local bridge.

The focus is not unbounded autonomy. The focus is practical control: Chat Mode by default, explicit arming, visible non-secret turn tokens for freshness, workspace locks, Run Capsules, dedupe, ACK/NACK result handling, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## 朋友圈 / 微信群草稿

```text
最近把一个真实工作流里长出来的小工具整理到了 GitHub：AegisLoop。

它是一个 ChatGPT x Codex 本地自动化桥：ChatGPT 负责规划，Codex 在本地执行，AegisLoop 负责连接、回传结果和加安全边界。

我最关心的不是“完全无人驾驶”，而是可控：默认 Chat Mode、显式 Arm、turn token 防旧指令复活、workspace lock、Run Capsule、ACK/NACK 和审计日志。

现在项目还早期，最需要的是 5-10 分钟的真实兼容性测试：Chrome / Edge / Brave、Windows / macOS、中文界面、GPT-5.5 / 5.4 / 5.3 / o3 模型切换。

GitHub: https://github.com/MHW888888/aegisloop
```

## 小红书正文草稿

标题：

```text
我做了一个让 ChatGPT 指挥本地 Codex 的安全桥
```

正文：

```text
最近把一个真实工作流里长出来的小工具开源了：AegisLoop。

它解决的是一个很具体的问题：
我想让 ChatGPT 负责规划，让本地 Codex 负责执行，但又不希望 agent 在本地工作区里乱跑、重复跑、串线跑。

所以 AegisLoop 做成了一个本地优先的 guarded bridge：

1. 默认 Chat Mode，普通聊天不会触发执行
2. 必须手动 Arm one run / Arm loop 才会开始
3. 一个 ChatGPT 对话绑定一个本地 Codex 路线
4. Run Capsule 记录项目、分支、运行目录，减少多线程串线
5. ACK/NACK 确认结果，避免结果丢失或重复贴回
6. turn token 只做“新鲜度标记”，不是密码，旧 codex block 不能随便复活
7. 本地 bridge 有 apiToken、Origin gate、leader lease、pending result lock 等边界

它不是为了“AI 全自动无人驾驶”，而是为了让多轮工程任务更可控、更可追踪。

现在最需要大家帮忙的是兼容性测试，不需要写代码：
- Windows / macOS
- Chrome / Edge / Brave
- 中文 ChatGPT UI
- GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 模型切换

如果你愿意花 5-10 分钟试一下，欢迎在 GitHub issue 里留一份打码测试报告。

GitHub: https://github.com/MHW888888/aegisloop
```

标签建议：

```text
#开源项目 #AI工具 #ChatGPT #Codex #程序员工具 #开发效率 #本地优先 #Chrome插件
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

## Maintainer Tester Reply Template

Use this when someone offers to test:

```text
Hi @USERNAME, thank you for offering to test AegisLoop!

Please pick one OS/browser/model path and report:

- OS
- Browser
- ChatGPT UI language
- AegisLoop version
- Model mode tested
- pass / partial / blocked
- any sanitized Debug Snapshot or screenshot

Please do not include real conversation IDs, tokens, local private paths, or private workspace content.
```
