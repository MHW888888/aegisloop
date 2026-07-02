# AegisLoop Onboarding Playbook

This page is the practical "what do I type first?" guide.

Use it when the README makes sense, but you are not yet sure how to start a real loop.

## 1. Prepare Three Things

You need:

1. A ChatGPT conversation URL.
2. A local Codex session id.
3. A local workspace folder.

The binding lives in your local `config.json`. ChatGPT output cannot choose the session or workspace for you.

```json
{
  "conversationId": "CHATGPT_CONVERSATION_ID_FROM_URL",
  "codexSessionId": "LOCAL_CODEX_SESSION_ID",
  "workspaceDir": "C:\\path\\to\\your\\workspace",
  "conversationMode": "chat"
}
```

Then run:

```powershell
npm run doctor
```

Fix real failures before starting the bridge. Placeholder warnings are normal before you edit `config.json`.

## 2. Use The Right Chat Thread

Do not use one ChatGPT thread for everything.

| Thread type | Use it for | AegisLoop mode |
| --- | --- | --- |
| Discussion thread | normal Q&A, architecture decisions, GitHub promotion, planning | Chat Mode |
| Runner thread | one project branch that may execute local Codex tasks | Arm one run / Arm loop |
| Archive thread | finished, abandoned, or frozen branch | Frozen |

Important: after a thread has been used as a runner, keep normal conversation somewhere else. This prevents old `codex` blocks, protocol nudges, and branch history from confusing the next task.

## 3. Start With A Briefing

For a serious runner thread, generate briefing files first:

1. Fill **Objective for GPT/Codex briefing** in the extension panel.
2. Click **Generate briefing**.
3. Click **Copy GPT brief**.
4. Paste the GPT brief into the ChatGPT runner thread.

The local Codex-side files are written into the Run Capsule `inbox`.

If you are just testing AegisLoop for the first time, you can skip Run Capsule and use a tiny sample workspace.

## 4. Recommended First Message To GPT

If you use the panel, click **Use starter text**. It fills:

```text
Read the AegisLoop GPT brief above.
This is a runner thread, not a normal Q&A thread.
Give the smallest safe next local Codex task for the current project/branch/objective.
If the task should stop, reply exactly <<<LOOP_STOP>>>.
```

Then click **Arm one run**.

AegisLoop appends the live protocol text and arm nonce automatically.

## 5. Recommended First Codex Task

For a new project, ask for a harmless read-only first pass:

````markdown
```codex
{
  "aegisloop": true,
  "arm_nonce": "filled-by-aegisloop",
  "prompt": "Read the project, summarize the current state, list the safest next tasks, and do not modify files. Run only lightweight read-only checks if needed."
}
```
````

For a real runner thread with Run Capsule and briefing files:

````markdown
```codex
{
  "aegisloop": true,
  "arm_nonce": "filled-by-aegisloop",
  "prompt": "Read capsule.json and all files under inbox first. Execute only the current active_branch objective. Write artifacts only under allowed_write_root. Do not modify source_dir."
}
```
````

## 6. Good Tasks For AegisLoop

AegisLoop is a good fit for:

- multi-step coding or documentation work;
- repeated local checks where ChatGPT should review every result;
- refactors that need pause/review between steps;
- research or analysis loops with strict boundaries;
- long tasks where copy/paste between ChatGPT and Codex becomes tedious.

Start with **Arm one run** until you trust the workflow. Use **Arm loop** only for bounded, well-briefed runner threads.

## 7. Poor Tasks For AegisLoop

Avoid AegisLoop for:

- casual Q&A;
- one-off questions that do not need local files;
- tasks involving secrets, real-money actions, production signals, or destructive commands;
- anything where a stale ChatGPT thread could mix two unrelated projects;
- broad "do everything" tasks with no clear stop condition.

Use Chat Mode or a normal ChatGPT conversation for those.

## 8. Safety Checklist Before Arming

Before clicking **Arm one run**:

- Is this a dedicated runner thread?
- Is the local bridge online?
- Does `npm run doctor` show no real failures?
- Is the conversation bound to the right Codex session and workspace?
- If Run Capsule is enabled, are project, branch, run, and write root correct?
- Did you paste the GPT brief if this is a serious runner thread?
- Is the first task small enough to review?

If any answer is unclear, stay in Chat Mode.

## 9. 中文速记

最稳的用法：

```text
普通聊天 = Chat Mode，不执行
执行线程 = Runner thread，只跑一个项目分支
第一步 = npm run doctor
第二步 = Generate briefing / Copy GPT brief
第三步 = Use starter text
第四步 = Arm one run
```

注意事项：

- 不建议在同一个 ChatGPT 对话里一边普通问答、一边自动执行。
- 一个 runner thread 最好只绑定一个项目、一个分支、一个目标。
- 不确定时先用 **Arm one run**，不要直接 **Arm loop**。
- 用完或跑偏时点 **Freeze**，然后新开一个 runner thread。
