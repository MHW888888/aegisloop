# AegisLoop Volunteer Recruitment Kit

Use this page when you want to recruit new testers and contributors instead of assigning work to existing contributors.

Repository: https://github.com/MHW888888/aegisloop

## GitHub Recruitment Issue

Title:

```text
Call for testers: ChatGPT model switching and browser compatibility
```

Body:

```markdown
We are looking for volunteer testers to help verify AegisLoop across ChatGPT model modes, browsers, and operating systems.

AegisLoop is a local-first bridge where ChatGPT plans and local Codex executes. The current focus is stability: model switching should not break the ChatGPT conversation binding or the local Codex session binding.

## What to test

Pick one small path:

- Windows + Chrome
- Windows + Edge
- Windows + Brave
- macOS + Chrome
- macOS + Edge
- Chinese ChatGPT UI labels
- GPT-5.5 submenu entries such as GPT-5.4, GPT-5.3, and o3

## What to verify

- The AegisLoop panel appears on ChatGPT.
- Switching ChatGPT model mode does not change the conversation route.
- The same ChatGPT conversation remains connected to the same local Codex session.
- `browser_challenge`, `login_required`, or `model_option_not_found` failures are reported clearly.

## How to report

Please comment with:

```text
OS:
Browser:
ChatGPT UI language:
Model modes tested:
Result: pass / partial / blocked
Notes:
Sanitized screenshot or JSON summary:
```

## Safety

Please do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content.

If you want to help, comment which OS/browser/model path you can test. Thank you!
```

## X / Twitter Recruitment Post

```text
Looking for a few testers for AegisLoop.

Need help checking ChatGPT model switching across Chrome / Edge / Brave / macOS / Windows.

Goal: switching GPT-5.5 / 5.4 / 5.3 / o3 should not break the same ChatGPT conversation -> same local Codex session route.

GitHub: https://github.com/MHW888888/aegisloop
```

## Short X Post

```text
Recruiting AegisLoop testers:

Can you help test ChatGPT model switching on Chrome / Edge / Brave / macOS / Windows?

Local-first ChatGPT-to-Codex bridge. Need route stability reports.

https://github.com/MHW888888/aegisloop
```

## Xiaohongshu / Chinese Post

```text
想招募几个 AegisLoop 测试志愿者。

AegisLoop 是一个本地优先的 ChatGPT -> Codex 自动化桥：ChatGPT 负责规划，本地 Codex 负责执行，中间加安全闸门、运行胶囊、ACK/NACK 和审计日志。

现在重点想测试一件事：

切换 ChatGPT 模型时，比如 GPT-5.5 / GPT-5.4 / GPT-5.3 / o3，或者“智能 / 极速 / 均衡 / 高级 / 超高 / 专业”这些模式，AegisLoop 是否还能保持：

1. 同一个 ChatGPT 对话
2. 同一个本地 Codex session
3. 不因为切模型而断线或误绑

需要测试环境：
- Windows + Chrome / Edge / Brave
- macOS + Chrome / Edge
- 中文 ChatGPT UI
- GPT-5.5 子菜单

如果你愿意帮忙，可以在 GitHub issue 里留言你的系统、浏览器和测试结果。注意不要截图真实 conversation id、token、本地路径或私人项目内容。

GitHub: https://github.com/MHW888888/aegisloop
```

## WeChat / Developer Group Post

```text
招募几个 AegisLoop 兼容性测试志愿者。

项目是一个 ChatGPT -> 本地 Codex 的安全自动化桥。现在想验证不同浏览器和不同 ChatGPT 模型模式下，切换模型是否会导致线程断线、误绑、重复触发。

希望有人能帮测：
Windows Chrome / Edge / Brave
macOS Chrome / Edge
中文 UI 标签
GPT-5.5 / 5.4 / 5.3 / o3 子菜单

只需要反馈：系统、浏览器、模型模式、是否保持同一个 conversation 和 Codex session。截图请打码，不要泄露 token、路径、真实对话 ID。

GitHub: https://github.com/MHW888888/aegisloop
```

## Maintainer Reply Template

```text
Hi @USERNAME, thank you for offering to help test AegisLoop!

Please pick one OS/browser/model path and report:

- OS
- Browser
- ChatGPT UI language
- Model modes tested
- pass / partial / blocked
- any sanitized screenshot or JSON summary

Please do not include real conversation IDs, tokens, local private paths, or private workspace content.
```
