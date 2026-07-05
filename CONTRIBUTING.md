# Contributing to AegisLoop

Thanks for taking a look. AegisLoop is intentionally small and local-first, so the best contributions are narrow, testable, and easy to review.

## Good First Contributions

- Improve ChatGPT DOM selector diagnostics.
- Add setup notes for another Windows or macOS environment.
- Add a small end-to-end demo script.
- Improve docs around safe `config.json` bindings.
- Add tests for gate rules and payload parsing.

## No-Code Testing Tasks

You do not need to write code to help. Some of the most useful contributions are small compatibility reports:

- run AegisLoop on one browser / OS combination;
- switch one ChatGPT model mode and confirm the route stays stable;
- paste a sanitized Debug Snapshot;
- add one clean screenshot or short note.

Good tester reports usually take 5-10 minutes and include:

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

Please claim only one small path at a time. Comment on the issue with the browser / OS you can test, then post the report when done.

## Development Checks

Run:

```powershell
npm run check
```

Before opening a pull request, make sure you did not commit local runtime files:

- `config.json`
- `state.json`
- `logs/`
- `data/`
- backup folders

## Safety Expectations

Please keep changes aligned with the project model:

- local config is the source of authority;
- web content cannot choose local sessions or workspaces;
- risky payloads should fail closed;
- same-workspace jobs should not write concurrently;
- auditability matters more than invisible automation.

## Comment And PR Quality

AI-assisted contributions are welcome, but please keep them specific and verifiable.

Avoid:

- generic AI-generated analysis with no repo-specific evidence;
- ads, payment links, wallet addresses, or solicitation;
- comments that only say "add error handling" or "add comments" without a concrete patch or test plan;
- screenshots with tokens, real conversation ids, private local paths, or private workspace data.

Good comments usually include:

- the file or workflow you tested;
- the browser / OS / AegisLoop version when relevant;
- a small reproduction or screenshot;
- the exact docs or code change you plan to make.

## 中文说明

欢迎提交 PR 或测试报告。这个项目优先接受小而清晰、可验证、容易 review 的改动。

请不要提交或粘贴：

- 本地私有配置；
- 日志里的 token；
- 真实 conversation id；
- 真实 workspace 路径；
- 钱包地址、付款链接、广告或泛泛的 AI 分析。

如果你不确定某个改动是否会扩大本地执行权限，请先开 issue 讨论。
