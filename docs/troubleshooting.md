# Troubleshooting

## Local bridge not running

The extension cannot reach `http://127.0.0.1:17380`.

Try:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\launch.ps1
Invoke-RestMethod http://127.0.0.1:17380/health
```

If another process already uses the port, stop that process or change the bridge port in your local setup.

## Local Bridge URL Validation

The local bridge accepts only connections that match its URL validation rules:

- **The Rule**: Only URLs starting with `http://127.0.0.1:` or `http://localhost:` are accepted. Any other format (different scheme, different host, or unexpected path/suffix) is rejected.
- **Valid Example**: `http://127.0.0.1:17380` (uses correct scheme, loopback IP, and port).
- **Invalid Example**: `https://127.0.0.1:17380` (wrong scheme — HTTPS is not allowed by the local bridge).

## ChatGPT tab is not connected

The page conversation is not bound to a local Codex session.

Click **Connect this chat** and enter:

- Local Codex session id
- Workspace folder

Bindings are local. They are not read from ChatGPT output.

## No codex block yet

ChatGPT must end actionable replies with a fenced `codex` block:

````markdown
```codex
{"prompt":"Next local task."}
```
````

If there is no block, type the first instruction in the AegisLoop panel and click **Start loop**.

## Needs approval

AegisLoop blocked a payload before local execution.

Use **Allow once** only if you understand the requested action.

The default behavior is to fail closed.

## Paused after LOOP_STOP

`<<<LOOP_STOP>>>` means ChatGPT believes the loop should stop.

Click **Continue** only if you want ChatGPT to produce another `codex` block.

## Selector broken

If ChatGPT changes its web UI, the extension may fail to find the composer, send button, or messages.

Open the panel debug mode and check the browser console for `[LE]` logs.

The likely fix is updating the selector block in `chrome-extension/content.js`.
