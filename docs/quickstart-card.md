# AegisLoop Quickstart Card

Use this page when you want the shortest safe path from "installed" to "one local Codex run completed".

中文用户可以直接看每节下面的中文速记。

## What AegisLoop Does

AegisLoop lets ChatGPT plan a coding step while local Codex executes it, then sends the result back to ChatGPT for review.

It is best for bounded engineering loops, not casual chat.

中文速记：

```text
ChatGPT 负责规划，本地 Codex 负责执行，AegisLoop 负责连接、暂停、回传和安全闸门。
```

## Before You Start

Prepare:

1. A local AegisLoop repo clone.
2. A valid `config.json`.
3. A local Codex session id.
4. A dedicated ChatGPT runner thread.

For the safest first run, use `examples/sample-workspace` as `workspaceDir`. It contains only tiny editable text files and no secrets, dependencies, or external services.

Run:

```powershell
npm run doctor
npm start
```

Open:

```text
http://127.0.0.1:17380/health
```

You should see JSON.

中文速记：

```text
先 npm run doctor，再 npm start，再打开 /health 看 bridge 是否在线。
```

## Recommended ChatGPT Thread Setup

Use separate threads:

| Thread | Use it for | Automation |
| --- | --- | --- |
| Discussion | normal Q&A, planning, promotion, review | off |
| Runner | one project / branch / objective | Arm one run |
| Archive | finished or frozen work | frozen |

Do not mix normal Q&A and automation in the same runner thread.

中文速记：

```text
普通聊天另开一条。执行任务单独开 runner thread。用完或跑偏就 Freeze。
```

## First Message To GPT

Paste this into a runner thread before arming:

```text
This is an AegisLoop runner thread, not a normal Q&A thread.

Project:
<project name>

Current objective:
<small safe task>

Rules:
- Give only the next local Codex task.
- Keep the task small and verifiable.
- Do not switch projects or branches.
- Do not call ChatGPT tools. AegisLoop reads a fenced codex JSON block from this page.
- If this should stop, reply exactly <<<LOOP_STOP>>>.
```

Then click **Use starter text** and **Arm one run** in the extension panel.

中文速记：

```text
第一句话告诉 GPT：这是执行线程，不是普通问答；当前项目是什么；当前目标是什么；只能给下一步 Codex 任务。
```

## First Codex Task

For a first safe run, ask Codex to read only:

````markdown
```codex
{
  "aegisloop": true,
  "arm_id": "filled-by-aegisloop",
  "turn_nonce": "filled-by-aegisloop",
  "arm_nonce": "same-as-turn_nonce-for-legacy-compat",
  "prompt": "Read the project, summarize the current state, list the safest next tasks, and do not modify files. Run only lightweight read-only checks if needed."
}
```
````

中文速记：

```text
第一次不要让它直接改文件。先只读、总结、列下一步。
```

## Good First Tasks

Good:

- documentation cleanup;
- README review;
- small test or smoke report;
- config validation;
- screenshot/demo checklist;
- local compatibility notes;
- one focused bug reproduction.

Avoid:

- "do everything";
- destructive file operations;
- secrets or tokens;
- production deployment;
- real-money or trading actions;
- one thread controlling multiple unrelated projects.

## Button Guide

| Button | Meaning |
| --- | --- |
| Chat Mode | Automation is off. Ask normal questions. |
| Generate briefing | Write local GPT/Codex brief files for the current run. |
| Copy GPT brief | Copy the short planner brief into ChatGPT. |
| Use starter text | Fill the first safe instruction. |
| Arm one run | Execute one fresh `codex` task. |
| Arm loop | Continue while safe and bounded. Use later, not first. |
| Freeze | Archive this thread so old tasks cannot run. |

中文速记：

```text
新手优先：Chat Mode -> Use starter text -> Arm one run。熟了以后再用 Arm loop。任务结束点 Freeze。
```

## Browser Notes

Use Chrome first.

Try Edge next.

Treat Brave as experimental and check shields / localhost behavior.

Do not claim Firefox or Tor support until separately tested.

## If Something Feels Wrong

Stay in Chat Mode and check:

```powershell
npm run doctor
npm run check
```

Common fixes:

- refresh the ChatGPT tab after reloading the extension;
- confirm the bridge URL is `http://127.0.0.1:<port>`;
- use a fresh runner thread instead of a long mixed chat;
- prefer **Arm one run** over **Arm loop** while debugging;
- if a model says it cannot find the tool, read [model-compatibility.md](model-compatibility.md).
