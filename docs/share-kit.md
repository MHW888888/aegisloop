# AegisLoop Share Kit

Copy-ready material for sharing AegisLoop without overclaiming.

Repository: https://github.com/MHW888888/aegisloop

## Short Description

AegisLoop is a guarded control plane for explicit ChatGPT-to-local-Codex execution.

## 中文短介绍

AegisLoop 是一套面向 ChatGPT 到本地 Codex 显式执行路线的安全控制面。

## What To Say In 10 Seconds

Built-in Codex is the best default for native ChatGPT workflows. AegisLoop complements it when a dedicated ChatGPT runner must control an existing local Codex session with explicit arming, Run Capsules, workspace locks, ACK/NACK, and audit logs.

## 中文 10 秒介绍

原生 Codex 适合 ChatGPT 内置任务、应用、编辑器和终端工作流。需要让专用 ChatGPT 线程继续指定的本地 Codex session，并加入显式 Arm、Run Capsule、ACK/NACK 和审计状态时，再使用 AegisLoop。

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
I built AegisLoop: a guarded control plane for explicit ChatGPT-to-local-Codex execution.

Codex now lives inside ChatGPT too. AegisLoop complements that native route when you need an existing local session, explicit arming, Run Capsules, recoverable ACK/NACK delivery, and audit logs.

GitHub: https://github.com/MHW888888/aegisloop
```

## X / Twitter Recruitment Draft

```text
Looking for a few 5-minute testers for AegisLoop.

No coding required.

Need reports for Chrome / Edge / Brave / macOS / Windows and ChatGPT model switching.

Current targets: GPT-5.6 Sol / Terra / Luna. Legacy 5.x and o3 reports are still useful.

Goal: switching models should keep the same ChatGPT conversation -> same AegisLoop local Codex route, without accidentally starting built-in Codex.

https://github.com/MHW888888/aegisloop
```

## LinkedIn Draft

```text
I have been experimenting with safer agentic coding loops and published AegisLoop.

It complements Codex built into ChatGPT by connecting a dedicated ChatGPT runner conversation to an existing local Codex session. ChatGPT plans the next step, Codex executes locally, and AegisLoop carries the result back through a guarded local bridge.

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
Show HN: AegisLoop - a guarded control plane for ChatGPT-to-local-Codex execution

I built AegisLoop to connect a dedicated ChatGPT runner conversation to an existing local Codex session.

Codex is now available natively inside ChatGPT, editors, terminals, and the Codex app. AegisLoop is not a replacement for those routes. It is for users who need explicit browser-thread-to-local-session binding, arming, isolation, recoverable result delivery, and audit state.

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
