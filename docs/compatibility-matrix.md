# Compatibility Matrix

AegisLoop compatibility has five separate layers. A failure in one layer should not be treated as proof that the whole system is broken.

```text
1. OS / local bridge
2. Browser / extension runtime
3. ChatGPT page DOM
4. ChatGPT model output contract
5. Local Codex executor
```

Use this page when a user says "it does not work on Mac", "Edge cannot connect", or "5.5 Pro cannot find the tool".

## Route Invariant

Changing ChatGPT model or mode must not change the local execution route.

```text
ChatGPT conversationId -> AegisLoop binding -> local Codex session / Run Capsule
```

Model choice is only a generation behavior. It is not a routing key.

If the same ChatGPT conversation switches from Balanced to Ultra, Professional, GPT-5.5, GPT-5.4, GPT-5.3, or o3, AegisLoop should keep the same bound Codex session and capsule. Rebinding is needed only when the ChatGPT conversation URL changes, the maintainer changes `config.json`, or the user explicitly reconnects the tab.

Smooth switching target:

```text
switch model -> keep route -> keep pending state -> nudge only if output format is wrong
```

The model menu is not a transport layer. It should never decide the local Codex session.

## Quick Diagnosis

| Symptom | Likely layer | First check |
| --- | --- | --- |
| `npm start` fails | OS / local bridge | `npm run doctor` |
| `http://127.0.0.1:17380/health` does not load | OS / local bridge | port, firewall, bridge process |
| Extension panel says bridge offline | Browser / extension runtime | bridge URL, token, browser localhost policy |
| Result does not enter the ChatGPT composer | ChatGPT page DOM | selector / composer insertion regression |
| Model says "I cannot use Codex" or "tool not found" | Model output contract | use the model brief and correction prompt |
| Model was changed but Codex route changed too | Binding bug or accidental reconnect | confirm the ChatGPT `conversationId` and local binding |
| Model switch loses pending result | Result ACK/NACK state bug | check `/api/result` and do not reconnect first |
| Codex never returns | Local Codex executor | Codex path, session id, workspace, timeout |

## Windows vs macOS

| Area | Windows | macOS | Stable recommendation |
| --- | --- | --- | --- |
| Shell | PowerShell | Terminal / zsh | Keep commands OS-specific in docs. |
| Paths | `C:\...` and backslashes | `/Users/...` and forward slashes | Avoid copying Windows paths into macOS config. |
| Node path | Often `C:\Program Files\nodejs\node.exe` | Often `/opt/homebrew/bin/node` or `/usr/local/bin/node` | Run `where node` on Windows and `which node` on macOS. |
| Codex path | Often under `%APPDATA%\npm\node_modules` | Often under `npm root -g` | Let `npm run doctor` point out missing paths. |
| Browser install path | Fixed common `.exe` paths | App bundle paths | Windows has a launch smoke script; macOS relies on CI plus manual browser smoke for now. |
| Unicode paths | Tested by runtime smoke | Generally UTF-8 native | First-run debugging should still use a simple path before trying synced or Unicode folders. |

## Browser Support Position

| Browser | Support stance | What can fail |
| --- | --- | --- |
| Chrome | Primary target | ChatGPT DOM changes can still break selectors. |
| Edge | Recommended next target | Same Chromium base; needs real smoke reports. |
| Brave | Experimental | Shields may affect ChatGPT or localhost. |
| Firefox | Not officially supported yet | MV3/background/content behavior and packaging need separate work. |
| Tor Browser | Not recommended | Extra extensions can weaken Tor privacy and fingerprinting protections. |

## Model Support Position

| Model / mode | Support stance | What can fail |
| --- | --- | --- |
| Smart / 智能 | Smoke target | Automatic routing may choose a mode with different formatting behavior. |
| Fast / 极速 | Smoke target | May emit short or underspecified tasks. |
| Balanced / 均衡 | Recommended baseline smoke target | Usually easiest first model to test. |
| Advanced / 高级 | Smoke target | Should follow the normal contract after clear briefing. |
| Ultra / 超高 | Smoke target | May over-reason and look for tool access. |
| Professional / 专业 | Smoke target | Treat as a reasoning/pro profile until tested. |
| GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 | Exact-mode smoke targets | Need one real report per mode before claiming support. |
| Standard chat models | Usually compatible | May summarize instead of producing a `codex` block. |
| Faster / smaller models | Usually compatible for small tasks | May produce underspecified prompts. |
| Pro / reasoning models, including 5.5 Pro-style modes | Compatible only if they follow the page-text contract | They may look for a built-in ChatGPT tool and say it is unavailable. |
| Older long-running chats | Risky | Old `codex` blocks or branch history can confuse the run. |

Important: AegisLoop is not a built-in ChatGPT tool. A model does not need tool access. It only needs to write one fenced `codex` JSON block as visible page text.

## 5.5 Pro / Reasoning Mode Check

If a Pro or reasoning model says it cannot find the tool, do not debug Codex first. Check the model layer:

1. Put the thread in **Chat Mode**.
2. Paste the short model brief from [model-compatibility.md](model-compatibility.md).
3. Click **Use starter text**.
4. Click **Arm one run**.
5. If the model says it has no tools, paste the correction prompt from [model-compatibility.md](model-compatibility.md).
6. A pass means the model emits a fresh fenced `codex` JSON block with the current `arm_id` and `turn_nonce`.

If it still refuses after three nudges, file a **Model compatibility report**. Do not claim that the bridge, browser, or Codex failed unless their own layer checks fail too.

## Manual Smoke Matrix

Record one row per real test:

| OS | Browser | Model / mode | Health OK | Panel online | Fresh turn-token block | Dispatch OK | Result ACK | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Windows | Chrome | standard model | yes/no | yes/no | yes/no | yes/no | yes/no | Pass/Warn/Fail |
| Windows | Edge | standard model | yes/no | yes/no | yes/no | yes/no | yes/no | Pass/Warn/Fail |
| macOS | Chrome | standard model | yes/no | yes/no | yes/no | yes/no | yes/no | Pass/Warn/Fail |
| macOS | Chrome | 5.5 Pro-style mode | yes/no | yes/no | yes/no | yes/no | yes/no | Pass/Warn/Fail |

Recommended model rows to collect:

```text
智能, 极速, 均衡, 高级, 超高, 专业, GPT-5.5, GPT-5.4, GPT-5.3, o3
```

## What Maintainers Should Not Claim

- Do not claim 5.3, 5.5 Pro, Firefox, Brave, or Tor support without a real smoke report.
- Do not treat a model's "tool not found" answer as a local bridge failure.
- Do not use screenshots that contain real conversation ids, local paths, tokens, or private workspace content.
- Do not debug multiple axes at once. Change one of OS, browser, model, or workspace at a time.
