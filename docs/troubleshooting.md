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

If the panel reports `bridge_timeout`, the page request to the local bridge took too long. Keep the ChatGPT thread open, confirm the terminal running `npm start` is still alive, and retry after `/health` responds again. AegisLoop keeps the local route state instead of silently dropping the run.

If an API response says `origin_not_allowed`, a non-ChatGPT browser origin tried to call `/api/*`. Use the Chrome extension panel from a ChatGPT tab, or add a trusted origin to `allowedOrigins` in `config.json` only if you understand why that page should control the local bridge.

If an API response says `unauthorized`, set `apiToken` in `config.json`, restart the bridge, and save the same token in the extension panel. `/health` stays public, but `/api/*` is fail-closed unless a token is configured or you explicitly start a throwaway local test with:

```powershell
$env:AEGISLOOP_ALLOW_NO_TOKEN="1"
npm start
```

Do not use no-token mode for a normal long-running setup.

If an API response says `payload_too_large`, the request body exceeded the local bridge limit. This usually means a browser bug, pasted oversized payload, or accidental API misuse. Keep the task brief and retry from the panel.

If an API response says `leader_conflict`, the same ChatGPT conversation is probably open in another tab. AegisLoop only allows one active tab to arm, dispatch, ACK, or NACK a conversation at a time. Close the duplicate tab or wait about 15 seconds for the old leader lease to expire.

The extension panel shows the current tab leader status, local client id, and lease countdown. If it says **not leader**, execution controls are disabled on that tab by design.

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

This asks ChatGPT for a fresh block with the current `armId` and turn token.

If the panel says the seed send was not confirmed but still armed, do not reconnect the thread. AegisLoop is keeping the current route alive while waiting for a fresh turn-token `codex` block. This can happen with slower 5.5 / Ultra reasoning replies or when ChatGPT's page DOM does not expose the sent user-message bubble quickly.

AegisLoop now appends a unique `aegisloop_msg_id` line to its own protocol messages so it can confirm the exact user bubble. Do not manually copy that id into another thread.

## Pro or reasoning mode says it cannot find the tool

Some ChatGPT Pro / reasoning modes may interpret "use Codex" as a request to call a built-in ChatGPT tool. AegisLoop does not work that way.

AegisLoop reads plain text from the ChatGPT page. The model only needs to write one fenced `codex` JSON block:

````markdown
```codex
{
  "aegisloop": true,
  "arm_id": "CURRENT_ARM_ID_FROM_PANEL",
  "turn_nonce": "CURRENT_TURN_TOKEN_FROM_PANEL",
  "arm_nonce": "CURRENT_TURN_TOKEN_FROM_PANEL",
  "prompt": "Read the project and summarize the safest next step. Do not modify files."
}
```
````

If the model says "I cannot access tools" or "no tool is available", reply with:

```text
Do not call a ChatGPT tool. AegisLoop is watching this page for a fenced codex JSON block. Reply with only one fenced codex block containing the next local Codex instruction, or <<<LOOP_STOP>>>.
```

For a repeatable 5.3 / 5.5 Pro smoke test, see [model compatibility](model-compatibility.md).

## codex block ignored

AegisLoop ignores old blocks and blocks without the current `armId` and turn token.

Try:

1. Click **Arm one run** again.
2. Ask ChatGPT to resend only one fresh `codex` block.
3. Avoid using a runner thread for normal Q&A after arming it.

The turn token is visible and non-secret. It is only a freshness marker, not authentication.

Putting the turn token somewhere inside the prompt text is not enough. The JSON block must include the current `arm_id` and `turn_nonce`. The local bridge only trusts structured dispatch fields sent by the extension; prompt text that merely contains the token is blocked.

Common token boundary errors:

- `arm_id_mismatch`: the block belongs to a different armed route.
- `missing_turn_nonce`: the JSON did not include the current turn token.
- `turn_nonce_mismatch`: the token is stale or from another turn.
- `nonce_replay_blocked`: the turn token was already used once.
- `turn_nonce_expired`: the armed route expired; arm the thread again.

## Result appears twice

Modern AegisLoop builds attach a `resultId` to each Codex result and remember which result ids were inserted into ChatGPT. If a result still appears twice:

1. confirm the panel version is current;
2. avoid opening the same ChatGPT conversation in two tabs;
3. check debug logs for `leader_conflict`, `resultId mismatch`, or `already_acked`.

Repeated ACK is safe; repeated insertion usually means an old extension build or two tabs were active at the same time.

## result_delivery_unconfirmed

This means AegisLoop attempted to send the Codex result back to ChatGPT, but the page DOM did not confirm the user bubble. To avoid duplicate result insertion, AegisLoop pauses instead of sending the same result again.

Before retrying:

1. check the last few ChatGPT user bubbles for an `aegisloop_result_id` line;
2. confirm the panel is the current tab leader;
3. keep the same ChatGPT conversation URL if the result is already visible;
4. include the panel version, leader state, and reason in any bug report.

Do not reconnect the Codex session unless the ChatGPT conversation URL changed or the local binding is actually wrong.

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

Open the panel debug mode and check **Selector health**:

- `C` means the composer was found.
- `S` means the send button was found.
- `Stop` means a running-generation stop control was found.
- `A` / `U` show assistant and user message counts.
- `sig` values show the latest assistant/user message signatures used for route baselining.

Also check the browser console for `[LE]` logs.

The likely fix is updating the selector block in `chrome-extension/content.js`.

## Export Debug Snapshot

Use **Export Debug Snapshot** when a route stalls or a tester reports model/browser-specific behavior.

The snapshot is designed for issue comments and does not include raw prompts, raw Codex results, tokens, local workspace paths, or Codex session ids. It includes:

- AegisLoop content/protocol version;
- local bridge origin, not full private config;
- hashed ChatGPT conversation id, hashed `armId`, and hashed turn token;
- current tab client id short form;
- leader status and lease time remaining;
- mode, local state, loop state, and last surfaced error;
- selector health and latest assistant/user signatures;
- pending result hash when delivery is unconfirmed;
- latest AegisLoop submit message id short form.

If a user reports `bridge_timeout`, `leader_conflict`, `auth_required`, `origin_not_allowed`, `result_delivery_unconfirmed`, or `needs_user_protocol_fix`, ask for this snapshot plus the visible panel version.

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
