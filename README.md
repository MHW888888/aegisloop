# AegisLoop

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node check](https://github.com/MHW888888/aegisloop/actions/workflows/check.yml/badge.svg)](https://github.com/MHW888888/aegisloop/actions/workflows/check.yml)
[![Local-first](https://img.shields.io/badge/local--first-yes-blue)](#safety-model)
[![Guarded autonomy](https://img.shields.io/badge/guarded-autonomy-purple)](#why-aegisloop)

> **Let ChatGPT plan a coding task while your local Codex executes it safely, one step at a time.**

AegisLoop connects a ChatGPT web conversation to a local Codex session. ChatGPT decides the next step, Codex runs it in your workspace, and AegisLoop carries the result back with local safety gates, workspace locks, dedupe, and audit logs.

It is for people who want useful agentic loops without handing the steering wheel to an unbounded web chat.

> AegisLoop is a personal automation bridge. It is not an official OpenAI product.

![AegisLoop architecture](docs/architecture.svg)

## AegisLoop Lite

Version `v0.2.0` focuses on first-run clarity:

- friendlier extension labels;
- a shorter setup path;
- beginner docs for common failures;
- clearer README positioning.

The goal: understand it in 30 seconds, run a first local loop in about 3 minutes.

## Why AegisLoop

ChatGPT is good at planning, critique, and next-step design. Codex is good at reading real files, making local changes, and running checks. AegisLoop connects them with a local control plane:

- ChatGPT emits exactly one fenced `codex` task.
- A local bridge dispatches that task to a bound Codex session.
- Codex runs locally in the configured workspace.
- The result is inserted back into ChatGPT.
- ChatGPT reviews and emits the next step.

The important part is not the loop itself. The important part is the **aegis** around it: gates, locks, dedupe, and logs.

## Who It Is For

| You are... | AegisLoop helps by... |
| --- | --- |
| using ChatGPT to plan multi-step coding work | avoiding repetitive copy/paste between ChatGPT and Codex |
| cautious about agents running local commands | adding pause, approval gates, workspace locks, and audit logs |
| running long engineering or research loops | returning each Codex result to ChatGPT for review |
| happy with the ChatGPT web UI | keeping ChatGPT as the planner instead of forcing a new IDE |

## What Makes It Different

| Problem | AegisLoop answer |
| --- | --- |
| ChatGPT cannot safely choose arbitrary local sessions | Bindings live in local `config.json`; web content cannot override them. |
| Web automation can loop forever | Missing `codex` blocks trigger bounded reformat nudges, then pause. |
| Two agents can corrupt one workspace | Same `workspaceDir` is serialized with a workspace lock. |
| Two research branches use the same stage names | Optional Run Capsules add `projectId`, `activeBranch`, `runId`, and an external write root. |
| Repeated model output can rerun the same task | Normalized content hash dedupe blocks repeated payloads. |
| Research workflows need hard boundaries | Local denylist gates block risky payloads before Codex runs. |
| Post-hoc debugging is painful | Every turn is written to JSONL audit logs. |

## Compared With Other Tools

| Tool | Main focus | AegisLoop difference |
| --- | --- | --- |
| Codex CLI | Local coding agent | AegisLoop keeps ChatGPT as planner and Codex as executor. |
| Aider | Git-native pair programming | AegisLoop focuses on browser-to-local loop orchestration. |
| OpenHands | Full agent platform | AegisLoop is smaller, local-first, and ChatGPT-page driven. |
| Nanobrowser | Browser automation | AegisLoop targets coding loops, not general web automation. |
| ai-dev-orchestrator | ChatGPT-to-local agent bridge | AegisLoop uses a Chrome extension plus local safety gates. |

## Quick Start

The short path:

1. Start the local bridge.
2. Open a ChatGPT conversation.
3. Click **Connect this chat** if needed, then **Start loop**.

For a step-by-step walkthrough, see [docs/first-run.md](docs/first-run.md).

### 1. Clone

```powershell
git clone https://github.com/MHW888888/aegisloop.git
cd aegisloop
```

### 2. Configure

```powershell
Copy-Item .\config.example.json .\config.json
```

Edit `config.json`:

- `conversationId`: id from the ChatGPT URL.
- `codexSessionId`: local Codex session id to resume.
- `workspaceDir`: local workspace for that session.
- `codex.bin` / `codex.args`: Node.js and Codex CLI paths.

### 3. Start The Bridge

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
```

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:17380/health
```

### 4. Load The Chrome Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `chrome-extension/`.
5. Open the bound ChatGPT conversation and press `Ctrl+F5`.

### 5. Run

If the page already contains a valid `codex` block, click:

```text
Start loop
```

If there is no usable `codex` block yet, type the first task in the AegisLoop panel and start the loop.

## The Protocol

ChatGPT must end each actionable reply with exactly one fenced `codex` block:

````markdown
```codex
{"prompt":"Read the current project state, make the smallest safe change, run checks, and report back."}
```
````

Or, if the loop should stop:

```text
<<<LOOP_STOP>>>
```

AegisLoop treats `<<<LOOP_STOP>>>` as a stop signal only when it is the whole assistant reply.

## Safety Model

AegisLoop does not trust web content to decide local authority.

The bridge can block payloads that appear to request:

- production signals
- scoring approval
- alpha evidence promotion
- trading advice or BUY/WATCH/AVOID style signals
- real-money orders
- price predictions
- git commit/push/merge/add
- weight changes

For parallel research runs, Run Capsules can also block ambiguous stage labels unless the prompt includes the configured `activeBranch`.

You can intentionally auto-approve selected low-risk gate rules:

```json
"autoApproveGateRules": ["approved_for_scoring"]
```

Use this carefully. The default design is research-first and fail-closed.

## Parallel Runs

You can bind multiple ChatGPT conversations.

If two conversations share the same `workspaceDir`, AegisLoop runs Codex jobs one at a time for that workspace. This is deliberate. It prevents concurrent writes from damaging files or git state.

For true parallelism, use separate git worktrees or separate workspace copies.

For safer multi-thread research runs, enable **Parallel Safe Mode** with a Run Capsule. It adds `projectId`, `activeBranch`, `runId`, and an external write root so two conversations can read the same source project without mixing branch context or output artifacts.

See [docs/parallel-safe-mode.md](docs/parallel-safe-mode.md).

## Runtime Files

These files are local runtime state and are ignored by git:

- `config.json`
- `state.json`
- `logs/`
- `data/`
- `workspaces/`
- backup folders

## Community

- Launch copy: [docs/launch-posts.md](docs/launch-posts.md)
- Growth checklist: [docs/growth-checklist.md](docs/growth-checklist.md)
- First-run guide: [docs/first-run.md](docs/first-run.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
- Parallel Safe Mode: [docs/parallel-safe-mode.md](docs/parallel-safe-mode.md)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)

## Chinese / 中文说明

**AegisLoop** 是一个把 ChatGPT 网页对话和本地 Codex session 连接起来的“有护栏自动循环”工具。
它适合这样的工作流：

```text
ChatGPT 负责规划和复盘
Codex 负责本地读文件、改文件、跑检查
AegisLoop 负责转发任务、回填结果、执行本地闸门
```

### 它解决什么问题？

普通网页 ChatGPT 不能直接读取你的本地项目，也不能可靠地持续驱动 Codex。Codex 能操作本地文件，但它需要明确的下一步任务。
AegisLoop 把两者接起来：

1. ChatGPT 输出一个 `codex` 指令块。
2. AegisLoop 把指令发给绑定的本地 Codex session。
3. Codex 在本地项目目录执行并输出结果。
4. AegisLoop 把结果贴回 ChatGPT。
5. ChatGPT 复盘并给下一条 `codex` 指令。

### 关键设计

- **绑定关系本地配置**：ChatGPT 不能自己修改 `codexSessionId` 或 `workspaceDir`。
- **本地安全闸门**：越界指令会被拦截。
- **同目录串行执行**：两个线程写同一个项目时不会并发乱写。
- **结果可审计**：每轮都有 JSONL 日志。
- **停止信号明确**：只有整条回复为 `<<<LOOP_STOP>>>` 时才停止。

### 同时跑多个线程

可以同时打开多个 ChatGPT 页面。
如果它们都写同一个项目目录，AegisLoop 会自动排队，保证同一时间只有一个 Codex 写入该目录。
如果你想真正并行，请给每条线单独的 git worktree 或项目副本。

## Roadmap

- Browser DOM selector hardening across ChatGPT UI variants.
- Optional repo-level branch/worktree manager.
- Local dashboard for queue, locks, and audit replay.
- Safer release packaging for the Chrome extension.

## License

MIT
