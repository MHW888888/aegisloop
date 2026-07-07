# AegisLoop Promotion Playbook

This playbook turns AegisLoop promotion into a small weekly routine.

The aim is not to inflate stars. The aim is to recruit real users, testers, and contributors who can make the project easier to install, easier to understand, and more reliable across browsers and ChatGPT model modes.

## Current Best Pitch

```text
AegisLoop lets ChatGPT plan while local Codex executes, with local safety gates and explicit user control.
```

Use this when the reader has only a few seconds:

```text
ChatGPT plans. Codex executes locally. AegisLoop keeps the loop guarded.
```

## Who To Reach

| Audience | Best ask | Where |
| --- | --- | --- |
| AI coding tool users | Try the first-run guide and report friction | X, V2EX, Reddit, WeChat groups |
| Browser extension users | Test Chrome / Edge / Brave compatibility | GitHub issues, developer groups |
| macOS users | Run setup and Arm one run | GitHub issue #31 style tasks |
| Windows users | Test Chrome / Edge and model switching | GitHub issue #28/#32 style tasks |
| Docs contributors | Add screenshots, GIFs, walkthroughs | Good first issues |
| Safety-minded developers | Review nonce/turn-token/auth boundaries | Security discussion, PR review |

## Weekly Promotion Loop

1. Pick one concrete thing to share.
   - A release note
   - A screenshot
   - A GIF
   - A contributor PR
   - A compatibility result
   - A lesson learned from a bug

2. Pick one concrete ask.
   - "Can someone test macOS Chrome?"
   - "Can someone review this screenshot PR?"
   - "Can someone run GPT-5.5 model switching?"
   - "Can someone try first-run setup and tell me where it breaks?"

3. Post once per channel.
   - Do not repost the same wording repeatedly.
   - Link to the exact issue or README section.
   - Include privacy instructions for screenshots.

4. Reply fast.
   - Thank first-time contributors.
   - Clarify done criteria.
   - Review PRs promptly.
   - Close completed issues cleanly.

5. Convert confusion into docs.
   - Every repeated question should become a README, troubleshooting, or tester-guide improvement.

## Priority Promotion Tasks

### 1. Review incoming PRs

Current incoming PRs are often more valuable than new outreach. Review PRs first so contributors feel the project is alive.

Checklist:

- Does the PR include local/private paths, tokens, or real conversation ids?
- Does it add hidden or bidirectional Unicode?
- Does it include generated files that do not belong in the repo?
- Does it match the issue scope?
- Does `npm run check` pass after merge or cherry-pick?

### 2. Make visual proof easier

People understand AegisLoop faster from one small visual than from a long safety model.

Best visual sequence:

1. Chat Mode
2. Arm one run
3. Waiting for fresh `codex` block
4. Codex running locally
5. Result returned
6. ACK/NACK or stopped

### 3. Recruit testers, not just coders

The highest-value early help is compatibility testing.

Use:

- [tester-guide.md](tester-guide.md)
- [volunteer-recruitment.md](volunteer-recruitment.md)
- [model-compatibility.md](model-compatibility.md)
- [browser-compatibility.md](browser-compatibility.md)

## Channel-Specific Copy

### X / Twitter

```text
AegisLoop needs 5-minute testers.

No coding required.

Can you test one path?
- Windows / macOS
- Chrome / Edge / Brave
- GPT-5.5 / 5.4 / 5.3 / o3 model switching

Goal: same ChatGPT conversation -> same local Codex route.

https://github.com/MHW888888/aegisloop
```

### Xiaohongshu

```text
我做了一个让 ChatGPT 指挥本地 Codex 的安全桥：AegisLoop。

现在最需要的不是大功能，而是真实环境测试：

- Windows / macOS
- Chrome / Edge / Brave
- 中文 ChatGPT UI
- GPT-5.5 / 5.4 / 5.3 / o3 模型切换

不需要写代码，5-10 分钟即可。

目标是确认：切换模型后，同一个 ChatGPT 对话仍然连到同一个本地 Codex 路线，不断线、不误绑、不重复触发。

GitHub: https://github.com/MHW888888/aegisloop
```

### WeChat / Developer Group

```text
招募 AegisLoop 兼容性测试志愿者。

它是一个 ChatGPT -> 本地 Codex 的安全自动化桥。现在想验证不同浏览器和 ChatGPT 模型模式下，切换模型是否会导致线程断线、误绑、重复触发。

不需要写代码，只要反馈：
系统、浏览器、模型模式、是否保持同一个 conversation 和 Codex session。

截图请打码，不要泄露 token、路径、真实对话 ID。

GitHub: https://github.com/MHW888888/aegisloop
```

## What Not To Do

- Do not buy stars.
- Do not mass-comment unrelated repos.
- Do not claim AegisLoop is fully autonomous.
- Do not imply turn tokens are secrets.
- Do not ask users to share real conversation ids or tokens.
- Do not accept broad PRs without checking scope and privacy.

## Maintainer Response Templates

### Someone wants to test

```text
Hi @USERNAME, thank you for helping test AegisLoop!

Please pick one OS/browser/model path and report:

- OS
- Browser
- ChatGPT UI language
- AegisLoop version
- Model mode tested
- pass / partial / blocked
- sanitized Debug Snapshot or screenshot if useful

Please do not include real conversation IDs, tokens, local private paths, or private workspace content.
```

### Someone opened a PR

```text
Hi @USERNAME, thank you for the PR!

I will review it for scope, privacy, hidden Unicode, generated files, and whether the documented checks pass. If anything needs adjustment, I will leave a focused review so the change stays small and mergeable.
```

### Someone asks what to work on

```text
Thanks for offering to help!

The most useful beginner tasks right now are small compatibility reports and visual docs:

- test one browser/model path;
- add one sanitized screenshot;
- improve one troubleshooting section;
- report first-run setup friction.

Please pick one issue and keep the change small.
```
