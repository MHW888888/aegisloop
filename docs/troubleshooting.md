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

If you change the bridge port, update **Local bridge URL** in the extension panel too. The default is:

```text
http://127.0.0.1:17380
```

The panel only accepts local bridge origins:

```text
http://127.0.0.1:<port>
http://localhost:<port>
```

Do not paste `/health`, `https://`, a remote host, or a URL without a port into **Local bridge URL**. For example, use `http://127.0.0.1:17380`, not `http://127.0.0.1:17380/health`.

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

## Pro or reasoning mode says it cannot find the tool

Some ChatGPT Pro / reasoning modes may interpret "use Codex" as a request to call a built-in ChatGPT tool. AegisLoop does not work that way.

AegisLoop reads plain text from the ChatGPT page. The model only needs to write one fenced `codex` JSON block:

````markdown
```codex
{
  "aegisloop": true,
  "arm_nonce": "CURRENT_NONCE_FROM_PANEL",
  "prompt": "Read the project and summarize the safest next step. Do not modify files."
}
```
````

If the model says "I cannot access tools" or "no tool is available", reply with:

```text
Do not call a ChatGPT tool. AegisLoop is watching this page for a fenced codex JSON block. Reply with only one fenced codex block containing the next local Codex instruction, or <<<LOOP_STOP>>>.
```

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

## Browser Compatibility

If AegisLoop works in Chrome but fails in another browser:

- try Microsoft Edge before Firefox/Tor;
- confirm the browser can load unpacked extensions;
- confirm `http://127.0.0.1:17380/health` opens in that browser;
- if you changed the port, save the matching **Local bridge URL** in the AegisLoop panel;
- disable privacy shields for the ChatGPT tab only, if the browser has them;
- avoid Tor Browser for normal AegisLoop use because extra add-ons can weaken Tor's privacy model.

See [browser compatibility](browser-compatibility.md) for the current support matrix.

On Windows, maintainers can run:

```powershell
npm run test:browser:windows
```

This checks whether installed Chrome/Edge can load the unpacked extension without immediately rejecting the manifest.
