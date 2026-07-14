# AegisLoop

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node check](https://github.com/MHW888888/aegisloop/actions/workflows/check.yml/badge.svg)](https://github.com/MHW888888/aegisloop/actions/workflows/check.yml)
[![Local-first](https://img.shields.io/badge/local--first-yes-blue)](#safety-model)
[![Guarded autonomy](https://img.shields.io/badge/guarded-autonomy-purple)](#why-aegisloop)

> **A guarded control plane for explicit ChatGPT-to-local-Codex execution.**

AegisLoop binds one ChatGPT conversation to one local Codex session. ChatGPT produces a visible next-step instruction, Codex runs it in your workspace, and AegisLoop carries the result back through explicit arming, workspace locks, recoverable delivery, and audit logs.

Codex is now available directly in ChatGPT, the desktop app, editors, and the terminal. AegisLoop does not replace those surfaces. It is for users who specifically want a browser-thread-driven local loop with an inspectable execution route and local fail-closed controls.

> AegisLoop is a personal automation bridge. It is not an official OpenAI product.

## Quick Demo

> Static screenshot of the Chrome extension panel (general panel overview / first demo screenshot). It is a sanitized onboarding image, so the version number and minor labels may lag behind the latest release. Key runtime states such as Chat Mode, Arm one run, Codex running, Needs approval, and Frozen will be documented in detail in subsequent updates. No real conversation IDs, tokens, local paths, or private workspace data are shown.

![AegisLoop demo](docs/assets/aegisloop-panel-demo.png)

The extension panel exposes the local bridge status, briefing tools, chat mode controls, and the arm/freeze workflow used to safely start automation.

![AegisLoop architecture](docs/architecture.svg)

## Help Test AegisLoop

You can help without writing code. The most useful reports are small browser / model compatibility checks that take about 5-10 minutes.

- Pick one path: Windows, macOS, Chrome, Edge, Brave, Chinese UI, or one ChatGPT model mode.
- Run the short smoke steps in [docs/tester-guide.md](docs/tester-guide.md).
- Paste a sanitized report in the matching GitHub issue.

Please do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content.

## AegisLoop Lite

Version `v0.2.0` focuses on first-run clarity:

- friendlier extension labels;
- a shorter setup path;
- beginner docs for common failures;
- clearer README positioning.

The goal: understand it in 30 seconds, run a first local loop in about 3 minutes.

## Current Focus: v0.3.19 One-command Health Diagnosis

Version `v0.3.19` keeps the structured executor and crash recovery from `v0.3.18`, and makes first-line bridge diagnosis one command:

```powershell
npm run health
```

The command distinguishes a missing or invalid config, an offline bridge, and a port occupied by a different service. When the bridge is healthy, it tells the user that the browser extension can retry.

The underlying control layer still provides:

- the preferred CLI adapter uses `codex exec resume --json --output-schema` and validates a stable result envelope;
- capability detection selects the structured adapter before execution, with a legacy adapter only for older compatible CLIs;
- every accepted execution gets a persistent local job journal;
- bridge restarts turn interrupted work into `recovery_required` instead of leaving a permanent busy lock or replaying the task;
- infrastructure failures are no longer retried blindly after possible file, command, or MCP side effects;
- result reads now require the same tab leader lease as dispatch and ACK/NACK;
- root and Run Capsule `AGENTS.md` files keep durable execution rules close to Codex;
- `npm run doctor` reports Codex version, structured CLI flags, App Server availability, and the selected adapter.

The [Codex coexistence guide](docs/codex-coexistence.md) still explains when to use built-in Codex and when AegisLoop is useful. The next architecture step is an App Server policy proxy, not more prompt-only routing; see [the App Server roadmap](docs/app-server-roadmap.md).

The existing v0.3 hardening foundation includes:

- startup config schema validation, so bad `config.json` values fail fast with clear errors;
- Windows, macOS, and Linux CI checks for the core bridge, unit, and recovery fixtures;
- optional `X-AegisLoop-Token` auth for all `/api/*` bridge calls;
- explicit result `ACK` / `NACK`, so Codex results are not lost if ChatGPT insertion fails;
- clearer package, extension, and protocol version reporting;
- Run Capsule project / branch / run / mode shown in the extension panel;
- default Chat Mode, so normal Q&A is not interpreted as automation;
- explicit Arm one run / Arm loop buttons;
- visible non-secret turn tokens so old `codex` blocks cannot be resurrected accidentally;
- Dual Briefing templates separate the short ChatGPT planner brief from the detailed local Codex executor brief;
- the extension panel can generate Run Capsule `inbox` briefing files and copy the GPT thread brief;
- the panel now includes a four-step start guide and a **Use starter text** button for safer first tasks;
- Run Capsule runtime path segments preserve Unicode project / branch / run names while still replacing unsafe path characters;
- the extension now uses adaptive polling: faster checks while a run is active, slower checks while idle, and a DOM-change nudge when ChatGPT posts a new message;
- macOS / Windows Chrome seed confirmation is more tolerant: if the user-message bubble cannot be read back, AegisLoop stays armed and waits for a fresh turn-token `codex` block instead of falling back to Chat Mode;
- bridge requests now time out cleanly instead of leaving the panel stuck in a forever-ticking state;
- switching between ChatGPT conversation URLs resets transient route state and baselines the new thread before automation resumes;
- unacknowledged Codex results block new dispatches, so a pending result cannot be overwritten;
- successful results become hard duplicates only after ACK; failed results can be retried with a fresh turn token;
- Codex timeout cleanup kills the process tree and stdout/stderr are bounded with ring buffers;
- debug mode shows selector health for composer, send/stop controls, and latest message signatures;
- `/api/*` calls now reject unexpected browser origins while still allowing ChatGPT pages, Chrome extension requests, and no-origin localhost CLI checks;
- CI includes a no-login ChatGPT DOM fixture check for the message-role, composer, send/stop, and rendered `codex` block assumptions;
- each ChatGPT tab gets a local `clientId`, and the bridge gives one active tab a short leader lease per conversation so duplicate tabs cannot both arm, dispatch, ACK, or NACK the same route;
- Codex results now carry a stable `resultId`, making result ACK idempotent and preventing page refreshes from inserting the same result twice;
- ChatGPT submit confirmation uses a unique `aegisloop_msg_id` line instead of weak text-prefix matching;
- API request bodies are capped, dispatch checks require structured `armId` + `turnNonce` fields, audit logs redact raw prompts/results by default, and corrupt `state.json` files can recover from `.bak` instead of silently resetting.
- result delivery now uses a three-step local ledger (`delivery_attempted`, `dom_confirmed`, `ack_sent`) so a page refresh or delayed DOM confirmation does not blindly insert the same result again;
- the panel shows whether the current tab is the active leader, displays the local client id and lease countdown, and disables execution controls in duplicate tabs;
- control writes now check bridge responses before mutating local UI state, surfacing `leader_conflict`, `auth_required`, `origin_not_allowed`, `bridge_timeout`, and `pending_result_exists` instead of silently drifting;
- no-login real-browser recovery fixtures cover slow result recovery, duplicate suppression, leader conflicts, auth failures, and bridge timeout classification.
- no-codex recovery now waits for the assistant text to stop streaming and stay stable before sending a protocol repair nudge;
- the panel can export a sanitized Debug Snapshot with version, route hash, leader state, selector health, local state, and error metadata;
- each arm creates an `armId` and per-turn `turnNonce`; turn tokens are single-use, rotate after accepted loop dispatches, and are logged only as hashes;
- CI includes a deterministic real-loop replay fixture and a state-machine test for dispatch, ACK/NACK, pending result, leader, turn token, and protocol-fix invariants.

`/health` stays public for local checks. Bridge APIs under `/api/*` are fail-closed unless you configure `apiToken`, or explicitly set `AEGISLOOP_ALLOW_NO_TOKEN=1` for a throwaway local test.

## Why AegisLoop

ChatGPT is good at planning, critique, and next-step design. Codex is good at reading real files, making local changes, and running checks. AegisLoop connects them with a local control plane:

- ChatGPT emits exactly one fenced `codex` task.
- A local bridge dispatches that task to a bound Codex session.
- Codex runs locally in the configured workspace.
- The result is inserted back into ChatGPT.
- ChatGPT reviews and emits the next step.

The important part is not the loop itself. The important part is the **aegis** around it: gates, locks, dedupe, and logs.

### Why use it when Codex is already in ChatGPT?

Use built-in Codex when its native task, worktree, cloud, editor, or terminal workflow already fits. Use AegisLoop when you specifically need:

- a dedicated ChatGPT runner thread bound to an existing local Codex session;
- an explicit `Chat Mode -> Arm one run -> result ACK` lifecycle;
- local Run Capsules and workspace serialization across long browser-planned workflows;
- a visible, exportable route state for debugging duplicate tabs, stale turns, or failed result delivery.

The two routes can coexist, but one turn should use one route. See [Codex coexistence](docs/codex-coexistence.md).

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
| Codex in ChatGPT | Native Codex command center with built-in agent workflows | AegisLoop adds an explicit browser-thread-to-existing-local-session route with local arming, capsules, and ACK/NACK delivery. |
| Codex CLI | Terminal-first local coding agent | AegisLoop can resume a bound CLI session from a dedicated ChatGPT runner thread. |
| Aider | Git-native pair programming | AegisLoop focuses on browser-to-local loop orchestration. |
| OpenHands | Full agent platform | AegisLoop is smaller, local-first, and ChatGPT-page driven. |
| Nanobrowser | Browser automation | AegisLoop targets coding loops, not general web automation. |
| ai-dev-orchestrator | ChatGPT-to-local agent bridge | AegisLoop uses a Chrome extension plus local safety gates. |

## Quick Start

If you want the shortest safe path, start with the [3-minute Quickstart Card](docs/quickstart-card.md).

The short path:

1. Start the local bridge.
2. Open a ChatGPT conversation.
3. Keep the thread in **Chat Mode** until you are ready.
4. Click **Arm one run** for one safe dispatch, or **Arm loop** for a bounded loop.

For a harmless first run, point `workspaceDir` at [examples/sample-workspace](examples/sample-workspace). It contains only tiny editable text files, no dependencies, no external services, and no secrets.

For a step-by-step walkthrough, see [docs/first-run.md](docs/first-run.md).

If you are asking "what should I type first?", use the [Onboarding Playbook](docs/onboarding.md).

On macOS, use the dedicated [macOS setup guide](docs/macos.md). The short bridge command is:

```sh
npm start
```

For OS / browser / model compatibility, start with [docs/compatibility-matrix.md](docs/compatibility-matrix.md). For browser support beyond Chrome, see [docs/browser-compatibility.md](docs/browser-compatibility.md). Chrome is the primary target, Edge is the next recommended compatibility target, and Firefox/Tor should be treated as experimental until separately packaged and tested.

If GPT-5.6, a Pro mode, or another reasoning model starts built-in Codex or says it cannot find the tool, see [model compatibility](docs/model-compatibility.md) and [Codex coexistence](docs/codex-coexistence.md). An AegisLoop turn does not use a built-in ChatGPT tool call; it reads a fenced `codex` JSON block from the page.

### 1. Clone

```powershell
git clone https://github.com/MHW888888/aegisloop.git
cd aegisloop
```

### 2. Configure

```powershell
Copy-Item .\config.example.json .\config.json
npm run doctor
```

Edit `config.json`:

- `conversationId`: id from the ChatGPT URL.
- `codexSessionId`: local Codex session id to resume.
- `workspaceDir`: local workspace for that session.
- `codex.bin` / `codex.args`: Node.js and Codex CLI paths.
- `codex.executorAdapter`: `auto` (recommended), `cli-json`, or `legacy`. `auto` selects structured JSONL only when capability probing succeeds before a job starts.
- `apiToken`: recommended for normal use. Without it, `/api/*` is blocked unless you explicitly start the bridge with `AEGISLOOP_ALLOW_NO_TOKEN=1` for a throwaway local test.
- optional `allowedOrigins`: extra trusted browser origins for `/api/*`; by default AegisLoop allows ChatGPT origins, Chrome extension origins, and no-origin local CLI requests.

Run `npm run doctor` again after editing `config.json`. It checks the common first-run mistakes without printing secrets.

### 3. Start The Bridge

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
```

Check health:

```powershell
npm run health
```

For a raw endpoint check, open `http://127.0.0.1:17380/health` in the same browser profile.

Save the same `apiToken` in the extension panel when prompted.

If you change the bridge port from the default `17380`, also update **Local bridge URL** in the extension panel, for example `http://127.0.0.1:17400`.

### 4. Load The Chrome Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `chrome-extension/`.
5. Open the bound ChatGPT conversation and press `Ctrl+F5`.

### 5. Run

If the page already contains a valid `codex` block, click:

```text
Arm one run
```

If there is no usable fresh `codex` block yet, type the first task in the AegisLoop panel and click **Arm one run** or **Arm loop**. AegisLoop will inject the current `armId` and visible turn token into the protocol prompt.

## The Protocol

ChatGPT must end each actionable reply with exactly one fenced `codex` block:

````markdown
```codex
{"aegisloop":true,"arm_id":"arm_xxx","turn_nonce":"aegis-YYYYMMDD-xxxx","arm_nonce":"aegis-YYYYMMDD-xxxx","prompt":"Read the current project state, make the smallest safe change, run checks, and report back."}
```
````

Or, if the loop should stop:

```text
<<<LOOP_STOP>>>
```

AegisLoop treats `<<<LOOP_STOP>>>` as a stop signal only when it is the whole assistant reply.

By default, each conversation is in **Chat Mode**. In Chat Mode, AegisLoop does not parse `codex` blocks, does not dispatch tasks, and does not send reformat nudges. Execution only starts after the user explicitly arms the conversation from the extension panel.

## Safety Model

AegisLoop does not trust web content to decide local authority.

Every bridge endpoint under `/api/*` should be protected by `X-AegisLoop-Token`. This prevents arbitrary local web pages from reading bindings or dispatching work through the bridge. Keep the token private and do not commit it. If `apiToken` is empty, AegisLoop rejects `/api/*` by default unless `AEGISLOOP_ALLOW_NO_TOKEN=1` is set for a local throwaway test.

`/api/*` also checks the request `Origin`. ChatGPT pages, the Chrome extension background page, and no-origin local CLI checks are allowed by default. Other browser origins are rejected with `origin_not_allowed`.

The `turn_nonce` / legacy `arm_nonce` value is visible in the ChatGPT page and is not a password, API token, or authentication secret. It is only a freshness marker that prevents stale `codex` blocks from old chat history being replayed. Real local authority comes from the bridge API token, Origin check, one-tab leader lease, explicit Armed Mode, exact structured `armId` + `turnNonce` body fields, pending-result lock, capsule/workspace gates, and local policy checks.

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

Codex results use an explicit ACK flow:

- `GET /api/result` returns a pending result without consuming it and requires the active tab leader lease.
- `POST /api/result/ack` marks it consumed only after the extension confirms ChatGPT received the result. ACK includes `resultId`, so repeated ACKs are safe.
- `POST /api/result/nack` keeps it pending and pauses the loop when insertion fails.

The active browser tab also uses a short leader lease. If the same ChatGPT conversation is open in two tabs, only the current leader can arm, dispatch, ACK, or NACK. Close the duplicate tab or wait for the lease to expire if you see `leader_conflict`; the extension panel shows the current leader state and lease countdown.

If a result delivery was attempted but the ChatGPT DOM did not confirm the user bubble, AegisLoop scans recent user messages for the same `resultId` before taking action. If it still cannot confirm delivery, it pauses with `result_delivery_unconfirmed` instead of blindly inserting the result again.

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

For long-running runner threads, use **Dual Briefing**:

- paste the short `GPT_THREAD_BRIEF.md` into ChatGPT;
- keep `CODEX_EXECUTION_BRIEF.md`, `RESEARCH_RULES.md`, `FROZEN_BRANCHES.md`, and `CURRENT_OBJECTIVE.md` in the Run Capsule `inbox`;
- ask Codex to read the capsule and inbox files before executing.

See [docs/dual-briefing.md](docs/dual-briefing.md) and [templates/briefings/](templates/briefings/).

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
- Onboarding playbook: [docs/onboarding.md](docs/onboarding.md)
- First-run guide: [docs/first-run.md](docs/first-run.md)
- macOS setup: [docs/macos.md](docs/macos.md)
- Compatibility matrix: [docs/compatibility-matrix.md](docs/compatibility-matrix.md)
- Browser compatibility: [docs/browser-compatibility.md](docs/browser-compatibility.md)
- Model compatibility: [docs/model-compatibility.md](docs/model-compatibility.md)
- Codex coexistence / 与内置 Codex 共存: [docs/codex-coexistence.md](docs/codex-coexistence.md)
- Codex App Server roadmap: [docs/app-server-roadmap.md](docs/app-server-roadmap.md)
- Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md)
- Parallel Safe Mode: [docs/parallel-safe-mode.md](docs/parallel-safe-mode.md)
- Dual Briefing / 双端初始化: [docs/dual-briefing.md](docs/dual-briefing.md)
- Briefing templates: [templates/briefings/](templates/briefings/)
- v0.3.3 release notes: [docs/release-notes-v0.3.3.md](docs/release-notes-v0.3.3.md)
- v0.3.4 release notes: [docs/release-notes-v0.3.4.md](docs/release-notes-v0.3.4.md)
- v0.3.5 release notes: [docs/release-notes-v0.3.5.md](docs/release-notes-v0.3.5.md)
- v0.3.6 release notes: [docs/release-notes-v0.3.6.md](docs/release-notes-v0.3.6.md)
- v0.3.7 release notes: [docs/release-notes-v0.3.7.md](docs/release-notes-v0.3.7.md)
- v0.3.8 release notes: [docs/release-notes-v0.3.8.md](docs/release-notes-v0.3.8.md)
- v0.3.9 release notes: [docs/release-notes-v0.3.9.md](docs/release-notes-v0.3.9.md)
- v0.3.10 release notes: [docs/release-notes-v0.3.10.md](docs/release-notes-v0.3.10.md)
- v0.3.11 release notes: [docs/release-notes-v0.3.11.md](docs/release-notes-v0.3.11.md)
- v0.3.12 release notes: [docs/release-notes-v0.3.12.md](docs/release-notes-v0.3.12.md)
- v0.3.13 release notes: [docs/release-notes-v0.3.13.md](docs/release-notes-v0.3.13.md)
- v0.3.14 release notes: [docs/release-notes-v0.3.14.md](docs/release-notes-v0.3.14.md)
- v0.3.15 release notes: [docs/release-notes-v0.3.15.md](docs/release-notes-v0.3.15.md)
- v0.3.16 release notes: [docs/release-notes-v0.3.16.md](docs/release-notes-v0.3.16.md)
- v0.3.17 release notes: [docs/release-notes-v0.3.17.md](docs/release-notes-v0.3.17.md)
- v0.3.18 release notes: [docs/release-notes-v0.3.18.md](docs/release-notes-v0.3.18.md)
- v0.3.19 release notes: [docs/release-notes-v0.3.19.md](docs/release-notes-v0.3.19.md)
- Share kit / launch copy: [docs/share-kit.md](docs/share-kit.md)
- Promotion playbook: [docs/promotion-playbook.md](docs/promotion-playbook.md)
- Growth checklist: [docs/growth-checklist.md](docs/growth-checklist.md)
- Launch post drafts: [docs/launch-posts.md](docs/launch-posts.md)
- Demo contributor issue pack: [docs/demo-issue-pack.md](docs/demo-issue-pack.md)
- Stability contributor issue pack: [docs/stability-issue-pack.md](docs/stability-issue-pack.md)
- Maintainer automation: [docs/maintainer-automation.md](docs/maintainer-automation.md)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)

## 中文说明

**AegisLoop** 是一个本地优先的 ChatGPT-to-Codex 自动化桥。ChatGPT 负责规划下一步，本地 Codex 负责读取文件、执行任务和回传结果；AegisLoop 在中间提供显式授权、运行胶囊、审计日志、结果 ACK/NACK 和本地安全闸门。

典型流程：

```text
ChatGPT 规划下一步
  -> AegisLoop 转发给本地 Codex
  -> Codex 在本地执行并回报
  -> AegisLoop 把结果贴回 ChatGPT
  -> ChatGPT 决定下一步或停止
```

关键设计：

- **默认 Chat Mode**：普通问答不会触发本地执行。
- **显式 Arm**：只有点击 Arm one run / Arm loop 后才允许执行。
- **Run Capsule**：每条执行线绑定 project、branch、run 和 external write root，减少支线串线。
- **Dual Briefing**：GPT 拿短规划简报，Codex 在本地读取完整执行简报。
- **Turn token**：`turn_nonce` 是可见、非 secret 的新鲜度标记，只用于防旧 `codex` block 复活，不是认证 token。
- **本地安全闸门**：真正的授权边界来自 apiToken、Origin gate、leader lease、pending result lock、capsule/workspace gate 和 policy gate。
- **ACK/NACK 结果确认**：结果只有成功贴回 ChatGPT 后才标记为已消费。

如果同时跑多个项目或多个研究分支，推荐使用：

```text
Discussion Thread = 正常问答，只讨论不执行
Runner Thread = 单一 active_branch，只执行
Archive Thread = 冻结支线，只保留状态
```

详细中英双语教程见 [docs/dual-briefing.md](docs/dual-briefing.md)。

## Roadmap

- Browser DOM selector hardening across ChatGPT UI variants.
- Optional repo-level branch/worktree manager.
- Local dashboard for queue, locks, and audit replay.
- Safer release packaging for the Chrome extension.

## License

MIT
