# AegisLoop Volunteer Recruitment Kit

Use this page when you want to recruit new testers and contributors instead of assigning work to existing contributors.

Repository: https://github.com/MHW888888/aegisloop

## Positioning

AegisLoop needs small real-world compatibility reports more than large speculative patches.

The best ask is:

```text
Can you spend 5-10 minutes testing one browser or one ChatGPT model mode?
No coding required. Paste a sanitized report.
```

Avoid asking new contributors to understand every bridge, nonce, capsule, ACK/NACK, and Codex detail before they can help.

## GitHub Recruitment Issue

Title:

```text
Call for testers: 5-minute AegisLoop browser and model checks
```

Body:

````markdown
We are looking for volunteer testers for AegisLoop.

AegisLoop connects one ChatGPT conversation to one local Codex session through a guarded local bridge. Right now we need real-world compatibility reports across browsers, operating systems, and ChatGPT model modes.

No coding is required. Most reports take 5-10 minutes.

## Pick one path

- Windows + Chrome
- Windows + Edge
- Windows + Brave
- macOS + Chrome
- macOS + Edge
- Chinese ChatGPT UI labels
- GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 model menu behavior

## What to check

1. The AegisLoop panel appears on ChatGPT.
2. The local bridge shows online.
3. Switching ChatGPT model mode does not change the ChatGPT conversation route.
4. The same ChatGPT conversation stays connected to the same local Codex session.
5. If something blocks the test, the panel or script reports a clear reason such as `login_required`, `browser_challenge`, `model_option_not_found`, `leader_conflict`, or `bridge_timeout`.

## Report template

Please comment with:

```text
OS:
Browser:
ChatGPT UI language:
AegisLoop version:
Model mode tested:
Result: pass / partial / blocked
What happened:
Sanitized Debug Snapshot or screenshot:
```

## Safety

Please do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content.

If you want to help, comment with the one path you can test. Thank you!
````

## Maintainer Comment For Existing Test Issues

````markdown
This is a no-code testing task.

Time: about 5-10 minutes.

Please pick one browser / OS / model path, run the check, and paste this report:

```text
OS:
Browser:
ChatGPT UI language:
AegisLoop version:
Model mode tested:
Result: pass / partial / blocked
What happened:
Sanitized Debug Snapshot or screenshot:
```

Do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content.
````

## X / Twitter Recruitment Post

```text
Looking for a few 5-minute testers for AegisLoop.

No coding required.

Need reports for Chrome / Edge / Brave / macOS / Windows and ChatGPT model switching.

Goal: changing GPT-5.5 / 5.4 / 5.3 / o3 should keep the same ChatGPT conversation -> same local Codex session route.

GitHub: https://github.com/MHW888888/aegisloop
```

## Short X Post

```text
Recruiting AegisLoop testers:

5-10 min, no coding required.

Can you test ChatGPT model switching on Chrome / Edge / Brave / macOS / Windows?

https://github.com/MHW888888/aegisloop
```

## Xiaohongshu / Chinese Post

```text
招募几个 AegisLoop 兼容性测试志愿者。

AegisLoop 是一个本地优先的 ChatGPT -> Codex 自动化桥：ChatGPT 负责规划，本地 Codex 负责执行，中间有安全闸门、运行隔离、ACK/NACK 和审计日志。

现在想请大家帮忙测一件很具体的事：

切换 ChatGPT 模型时，比如 GPT-5.5 / GPT-5.4 / GPT-5.3 / o3，或者中文界面的“智能 / 极速 / 均衡 / 高级 / 超高 / 专业”，AegisLoop 是否还能保持：

1. 同一个 ChatGPT 对话
2. 同一个本地 Codex session
3. 不因为切模型而断线、误绑或重复触发

不需要写代码。大多数测试 5-10 分钟就能完成。

需要的反馈：

- 系统：Windows / macOS
- 浏览器：Chrome / Edge / Brave
- ChatGPT UI 语言
- 测试的模型模式
- 结果：通过 / 部分通过 / 阻塞
- 简短说明或打码截图

注意不要截图真实 conversation id、token、本地路径或私人项目内容。

GitHub: https://github.com/MHW888888/aegisloop
```

## WeChat / Developer Group Post

```text
招募几个 AegisLoop 兼容性测试志愿者。

项目是一个 ChatGPT -> 本地 Codex 的安全自动化桥。现在想验证不同浏览器和不同 ChatGPT 模型模式下，切换模型是否会导致线程断线、误绑、重复触发。

希望有人能帮测：

- Windows Chrome / Edge / Brave
- macOS Chrome / Edge
- 中文 UI 标签
- GPT-5.5 / 5.4 / 5.3 / o3 子菜单

不需要写代码。只需要反馈系统、浏览器、模型模式、是否保持同一个 conversation 和 Codex session。截图请打码，不要泄露 token、路径、真实对话 ID。

GitHub: https://github.com/MHW888888/aegisloop
```

## Maintainer Reply Template

```text
Hi @USERNAME, thank you for offering to help test AegisLoop!

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
