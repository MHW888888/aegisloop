# Troubleshooting

## Start with doctor

Run:

```powershell
npm run doctor
```

It checks common local setup mistakes without printing secrets.

## Local bridge not running

The extension cannot reach `http://127.0.0.1:17380`.

Try:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
Invoke-RestMethod http://127.0.0.1:17380/health
```

If another process already uses the port, stop that process or change the bridge port in your local setup.

## ChatGPT tab is not connected

The page conversation is not bound to a local Codex session.

Click **Connect this chat** and enter:

- Local Codex session id
- Workspace folder

Bindings are local. They are not read from ChatGPT output.

## Chat Mode: automation is off

This is normal. In Chat Mode, AegisLoop will not parse old `codex` blocks, will not dispatch tasks, and will not nudge ChatGPT back into protocol format.

Use Chat Mode for ordinary questions.

Click **Arm one run** only when you want to execute one fresh local task.

If you need both normal Q&A and automation, use separate ChatGPT threads. See [onboarding.md](onboarding.md).

## No codex block yet

ChatGPT must end actionable replies with a fenced `codex` block:

````markdown
```codex
{"prompt":"Next local task."}
```
````

If there is no block, type the first instruction in the AegisLoop panel and click:

```text
Arm one run
```

This asks ChatGPT for a fresh block with the current nonce.

## codex block ignored

AegisLoop ignores old blocks and blocks without the current arm nonce.

Try:

1. Click **Arm one run** again.
2. Ask ChatGPT to resend only one fresh `codex` block.
3. Avoid using a runner thread for normal Q&A after arming it.

## Needs approval

AegisLoop blocked a payload before local execution.

Use **Allow once** only if you understand the requested action.

The default behavior is to fail closed.

## Paused after LOOP_STOP

`<<<LOOP_STOP>>>` means ChatGPT believes the loop should stop.

Click **Arm one run** only if you want ChatGPT to produce another fresh `codex` block.

## Briefing missing or stale

When Run Capsule is enabled, use the panel:

```text
Generate briefing
Copy GPT brief
```

Paste the GPT brief into the runner thread before arming. If the project, branch, run id, or objective changes, regenerate the briefing.

## Selector broken

If ChatGPT changes its web UI, the extension may fail to find the composer, send button, or messages.

Open the panel debug mode and check the browser console for `[LE]` logs.

The likely fix is updating the selector block in `chrome-extension/content.js`.
