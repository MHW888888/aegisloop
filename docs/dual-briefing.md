# Dual Briefing / 双端初始化

Dual Briefing keeps the planner and executor from sharing the same giant prompt.

双端初始化的目标是：不要把同一份 README、研究细则、执行规则同时大段塞给 ChatGPT 和 Codex。ChatGPT 只拿规划简报，Codex 只拿执行简报，Run Capsule 负责边界。

## The Rule / 核心规则

| Side | Give it | Do not give it |
| --- | --- | --- |
| ChatGPT planner | project, active branch, frozen branches, current state, forbidden actions, required reply format | full local file paths, long research manuals, validation scripts |
| Local Codex executor | source path, write root, input files, output files, rules, validation commands | vague project direction, unrelated branch history, normal Q&A |

中文口诀：

```text
GPT 聊天窗口 = Planner briefing：方向、边界、当前状态、下一步输出格式。
Codex 执行端 = Executor briefing：本地文件、路径、规则、验证命令、输出要求。
```

## Runtime Layout / 运行目录

Use the external runtime root created by Run Capsules:

```text
C:\AegisLoopRuntime\
  runs\
    MonsterLifecycle\
      SECOND_WAVE_REPAIR\
        run-001\
          capsule.json
          inbox\
            GPT_THREAD_BRIEF.md
            CODEX_EXECUTION_BRIEF.md
            RESEARCH_RULES.md
            FROZEN_BRANCHES.md
            CURRENT_OBJECTIVE.md
          outbox\
          patches\
```

`capsule.json` answers "which run is this?".

The `inbox\*.md` files answer "what should this run do?".

## Step 1: Enable A Run Capsule / 第一步：开启运行胶囊

In `config.json`, bind the ChatGPT conversation to one project branch:

```json
{
  "conversationId": "CHATGPT_CONVERSATION_ID",
  "codexSessionId": "CODEX_SESSION_ID",
  "workspaceDir": "C:\\path\\to\\source-project",
  "conversationMode": "chat",
  "capsule": {
    "enabled": true,
    "projectId": "MonsterLifecycle",
    "activeBranch": "SECOND_WAVE_REPAIR",
    "branchMeaning": "MonsterLifecycle second-wave repair",
    "runId": "run-001",
    "mode": "readonly",
    "stageNamespaceRequired": true,
    "forbiddenBranchContext": ["Ziwei V2.4F"]
  }
}
```

Keep new conversations in `chat` mode by default. Arm execution only when you want a fresh run.

## Step 2: Copy Briefing Templates / 第二步：复制模板

In v0.3.3 and newer, the extension panel can do this for you:

1. Fill **Objective for GPT/Codex briefing**.
2. Click **Generate briefing**.
3. Click **Copy GPT brief** and paste it into the ChatGPT runner thread.

The bridge writes the local executor files under the Run Capsule `inbox`.

Manual copy is still useful when you want to edit templates before running:

```powershell
$repo = "C:\path\to\aegisloop"
$run = "C:\AegisLoopRuntime\runs\MonsterLifecycle\SECOND_WAVE_REPAIR\run-001"

New-Item -ItemType Directory -Force "$run\inbox" | Out-Null
Copy-Item "$repo\templates\briefings\*.md" "$run\inbox\"
```

Then edit the copied files under `inbox\`.

Do not edit your source project just to store automation state.

## Step 3: Paste The GPT Thread Brief / 第三步：给 GPT 发规划简报

Paste only `GPT_THREAD_BRIEF.md` into the ChatGPT runner thread.

It should be short. It should say:

- this is a runner thread, not normal Q&A;
- current project and active branch;
- frozen branches;
- current known state;
- forbidden actions;
- reply must end with one `codex` block or `<<<LOOP_STOP>>>`.

Example:

```text
[AegisLoop Runner Thread Brief]

This ChatGPT conversation is an execution-planning thread, not a normal Q&A thread.

Project: MonsterLifecycle / 与妖共舞
Active branch: SECOND_WAVE_REPAIR
Current task: V8.4b-SW Path Metric Coverage Repair

Frozen branch:
Ziwei V2.4F.* is frozen. Do not read, continue, modify, or reason from Ziwei outputs.

Your role:
Plan only the next local Codex execution step.
Do not answer as a normal assistant.

Every actionable reply must end with exactly one fenced codex block.
If the task is complete or should stop, output exactly:
<<<LOOP_STOP>>>
```

## Step 4: Keep The Codex Brief Local / 第四步：Codex 执行简报留在本地

Codex should read the local `inbox\` files after dispatch:

- `CODEX_EXECUTION_BRIEF.md`
- `RESEARCH_RULES.md`
- `FROZEN_BRANCHES.md`
- `CURRENT_OBJECTIVE.md`
- `capsule.json`

The ChatGPT `codex` block can stay short:

````markdown
```codex
{
  "aegisloop": true,
  "arm_nonce": "aegis-YYYYMMDD-xxxx",
  "prompt": "Read capsule.json and all files under inbox first. Execute only the current active_branch objective. Write artifacts only under allowed_write_root. Do not modify source_dir."
}
```
````

AegisLoop injects the live `arm_nonce` when you arm the thread from the extension panel.

## Step 5: Use The Right Thread Role / 第五步：分清线程角色

Recommended setup:

| Thread | Mode | Purpose |
| --- | --- | --- |
| Discussion thread | Chat Mode | architecture, questions, decisions |
| Runner thread | Armed / Running | one project branch execution only |
| Archive thread | Frozen | finished or abandoned branch |

Do not use one runner thread for normal Q&A, GitHub promotion, Ziwei, and MonsterLifecycle at the same time.

## MonsterLifecycle Example / MonsterLifecycle 示例

Use these branch boundaries:

```text
Project: MonsterLifecycle / 与妖共舞
Active branch: SECOND_WAVE_REPAIR
Current objective: V8.4b-SW Path Metric Coverage Repair
Frozen branch: Ziwei V2.4F.*
Blocked: expected value, scoring, human-facing output, HIGH_CONFIDENCE_EXECUTABLE, BUY/WATCH/AVOID
```

Codex-side execution rules:

```text
Read source_dir as input only.
Write all artifacts under allowed_write_root.
Do not write to source_dir.
If code changes are needed, write a standalone script or patch under allowed_write_root.
Run validation commands.
Report coverage, blockers, and whether V8.5 readiness is still blocked.
```

## Troubleshooting / 排错

| Symptom | Meaning | Fix |
| --- | --- | --- |
| ChatGPT answers normally | The thread is in Chat Mode or the GPT brief was not pasted | Paste `GPT_THREAD_BRIEF.md`, then Arm one run |
| A `codex` block is ignored | It is old or missing the current nonce | Arm again and ask GPT for a fresh block |
| The wrong branch is mentioned | The prompt is missing `activeBranch` or uses frozen context | Freeze the thread, correct the brief, start a new runner thread |
| Codex writes to the source project | `readonly` is a prompt/cwd guard, not an OS sandbox | Use sandbox/worktree mode or require patch-only output |

## Why This Matters / 为什么这样做

Run Capsule solves "where does this task belong?"

Dual Briefing solves "what should GPT plan and what should Codex execute?"

Together they prevent:

- old `codex` blocks from waking up;
- two branches using the same stage name;
- GPT drifting into normal Q&A;
- Codex relying only on chat history;
- long rules being duplicated every turn.
