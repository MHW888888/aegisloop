# First Run

This guide is for the first three minutes with AegisLoop.

For a more practical "what should I type first?" guide, see [onboarding.md](onboarding.md).

The safest mental model:

```text
Chat Mode = normal Q&A, automation off
Arm one run = execute one fresh codex task
Arm loop = keep going until a stop, gate, or failure
Freeze = archive this thread so old tasks cannot wake up
```

## 1. Start The Local Bridge

From the repository folder:

```powershell
Copy-Item .\config.example.json .\config.json
npm run doctor
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
```

Check that the bridge is alive:

```powershell
Invoke-RestMethod http://127.0.0.1:17380/health
```

You should see a JSON response.

If `npm run doctor` reports warnings, fix the placeholders in `config.json` first. It hides token values and only reports whether the local pieces are present.

## 2. Open ChatGPT

Open the ChatGPT conversation you want to connect.

If the panel shows **Local bridge: online**, the browser extension can reach the local bridge.

If the chat is not bound yet, click **Connect this chat** and provide:

- Local Codex session id
- Workspace folder

These stay local. ChatGPT cannot choose them.

## 3. Start A Loop

If the page already has a valid `codex` block, click:

```text
Arm one run
```

If the page has no `codex` block yet, type a short first instruction in **First instruction**, then click **Arm one run**.

Recommended first instruction:

```text
Read the AegisLoop GPT brief above.
This is a runner thread, not a normal Q&A thread.
Give the smallest safe next local Codex task for the current project/branch/objective.
If the task should stop, reply exactly <<<LOOP_STOP>>>.
```

The panel's **Use starter text** button fills this for you.

## What Success Looks Like

1. AegisLoop arms the thread and injects a fresh nonce.
2. ChatGPT replies with a fresh `codex` task.
3. AegisLoop sends that task to local Codex.
4. Codex runs in your configured workspace.
5. AegisLoop inserts the Codex result back into ChatGPT.
6. ChatGPT replies with the next `codex` block or `<<<LOOP_STOP>>>`.

## Stop Safely

Click **Pause** to hold the loop.

Click **Freeze** when this ChatGPT thread should become an archive and never execute old blocks again.

Click **Stop** only when you want to halt the local bridge state for that chat.
