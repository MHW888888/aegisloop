# Contributing to AegisLoop

Thanks for taking a look. AegisLoop is intentionally small and local-first, so the best contributions are narrow, testable, and easy to review.

## Good First Contributions

- Improve ChatGPT DOM selector diagnostics.
- Add setup notes for another Windows or macOS environment.
- Add a small end-to-end demo script.
- Improve docs around safe `config.json` bindings.
- Add tests for gate rules and payload parsing.

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

## 中文说明

欢迎提交 PR。这个项目优先接受小而清晰、能验证、容易 review 的改动。

请不要提交本地私有配置、日志、真实 conversation id、真实 workspace 路径或任何 token。

如果你不确定某个改动是否会扩大本地执行权限，请先开 issue 讨论。
