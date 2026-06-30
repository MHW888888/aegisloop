# First Run

This guide is for the first three minutes with AegisLoop.

## 1. Start The Local Bridge

From the repository folder:

```powershell
Copy-Item .\config.example.json .\config.json
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
```

Check that the bridge is alive:

```powershell
Invoke-RestMethod http://127.0.0.1:17380/health
```

You should see a JSON response.

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
Start loop
```

If the page has no `codex` block yet, type a short first instruction in **First instruction**, then click **Start loop**.

Example:

```text
Read the project, summarize the current state, and suggest the smallest safe next step.
```

## What Success Looks Like

1. AegisLoop sends a task to local Codex.
2. Codex runs in your configured workspace.
3. AegisLoop inserts the Codex result back into ChatGPT.
4. ChatGPT replies with the next `codex` block or `<<<LOOP_STOP>>>`.

## Stop Safely

Click **Pause** to hold the loop.

Click **Stop** only when you want to halt the local bridge state for that chat.
