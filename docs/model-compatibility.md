# Model Compatibility

AegisLoop does not depend on a private ChatGPT tool call. It depends on plain text:

```text
the model writes one fenced codex JSON block
AegisLoop reads that block from the ChatGPT page
the local bridge sends the prompt to local Codex
```

That means model compatibility is mostly about whether the selected ChatGPT model follows the output contract.

For OS, browser, ChatGPT DOM, model, and Codex executor triage in one place, see [compatibility-matrix.md](compatibility-matrix.md).

Model switching is route-neutral. AegisLoop binds by ChatGPT `conversationId`, not by selected model:

```text
same ChatGPT conversation URL = same local Codex session binding
```

Switching between Smart, Fast, Balanced, Advanced, Ultra, Professional, GPT-5.5, GPT-5.4, GPT-5.3, or o3 inside the same ChatGPT conversation should not change the Codex route. Only a different ChatGPT conversation URL, a config change, or an explicit reconnect should change the binding.

## Smooth Model Switching

AegisLoop should remain continuous when the user changes the ChatGPT model inside the same conversation.

Expected behavior:

```text
same conversationId
same local Codex session binding
same Run Capsule if configured
same pending result / ACK state
same active armId and turn token until they expire or are consumed
```

Model switching should only affect the next assistant reply style. It should not:

- clear the local binding;
- require reconnecting the Codex session;
- dispatch an old `codex` block;
- consume a pending Codex result;
- reset the Run Capsule;
- treat "I cannot access tools" as a bridge failure.

If 5.5 Pro or another reasoning mode says it cannot use Codex after a model switch, keep the thread in the same route and send the correction prompt. Do not create a new binding unless the ChatGPT conversation URL changed.

### Why 5.5 Pro Can Feel Disconnected

5.5 Pro-style modes may reason about "Codex" as if it were a ChatGPT-native tool. When that happens, the local bridge can be healthy, the extension can be online, and the Codex session can still be bound. The only broken piece is the visible reply format.

Good recovery path:

1. Do not reconnect the tab.
2. Do not change the Codex session id.
3. Keep the same ChatGPT conversation.
4. Paste the correction prompt.
5. If needed, click **Arm one run** again after the previous arm expires.

## Known Behavior Pattern

| Model family / mode | Expected behavior | What to watch |
| --- | --- | --- |
| Smart / 智能 | Usually chooses a balanced model automatically. | Treat it like a normal model; verify one fresh turn-token block. |
| Fast / 极速 | Usually follows short instructions quickly. | Keep the first task small; check for underspecified prompts. |
| Balanced / 均衡 | Usually the safest default for first-run testing. | Good baseline before testing higher modes. |
| Advanced / 高级 | Usually follows the contract with enough context. | Avoid overlong first tasks. |
| Ultra / 超高 | May spend more effort reasoning about the request. | Remind it not to call tools if it over-interprets Codex. |
| Professional / 专业 | May behave like a stronger reasoning/profile mode. | Use the model brief before arming. |
| GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 | Should work if the selected model writes visible page text. | Do not claim support until a real smoke report exists for that exact mode. |
| General chat models | Usually follow the fenced `codex` block contract after one clear instruction. | May summarize instead of emitting a block. Use the reformat nudge. |
| Pro / reasoning modes | May overthink "use Codex" and look for a built-in tool. | Remind it that AegisLoop is page-text based, not a ChatGPT tool call. |
| Faster / lighter models | May obey format but produce shorter or underspecified tasks. | Keep the first objective small and concrete. |
| Older saved chats | May contain stale `codex` blocks. | Use **Arm one run** so only fresh `arm_id` + `turn_nonce` blocks dispatch. |

Do not claim support for a specific model version until someone has run the smoke test below in the real ChatGPT UI.

## Why Pro / Reasoning Models Can Look Broken

Some Pro or reasoning modes may interpret "Codex" as a ChatGPT built-in tool request. They may answer with something like "I cannot access tools" even though AegisLoop does not need ChatGPT tool access.

Treat this as a model output contract failure:

```text
OS bridge can still be healthy.
Browser extension can still be connected.
Local Codex can still be available.
The model simply did not emit the required visible codex block.
```

The fix is to remind the model that it should write page text, not call tools.

## Smoke Test For A Model

Use a harmless sample workspace.

1. Start the local bridge.
2. Open a fresh ChatGPT runner thread.
3. Select the model you want to test, for example a 5.3 or 5.5 Pro mode.
4. Keep the thread in **Chat Mode**.
5. Paste the model brief below.
6. Click **Use starter text**.
7. Click **Arm one run**.
8. Confirm the model returns exactly one fresh fenced `codex` JSON block with the current `arm_id` and `turn_nonce`.
9. Confirm AegisLoop dispatches the block and returns a Codex result.
10. Confirm the model can either produce a next fresh `codex` block or `<<<LOOP_STOP>>>`.
11. Switch to another model in the same ChatGPT conversation and confirm the extension still shows the same bound local Codex session.

## Suggested Model Test Order

Test one axis at a time. Keep the same OS, browser, workspace, and thread while switching models.

| Order | Mode to test | Why |
| --- | --- | --- |
| 1 | Balanced / 均衡 | Establish the baseline behavior. |
| 2 | Fast / 极速 | Checks whether concise models still obey the JSON block contract. |
| 3 | Smart / 智能 | Checks automatic model routing. |
| 4 | Advanced / 高级 | Checks stronger general mode behavior. |
| 5 | Ultra / 超高 | Checks longer reasoning without tool-call confusion. |
| 6 | Professional / 专业 | Checks professional/reasoning profile behavior. |
| 7 | GPT-5.3 | Checks the specific 5.3 submenu target. |
| 8 | GPT-5.4 | Checks the specific 5.4 submenu target. |
| 9 | GPT-5.5 | Checks the highest 5.x submenu target. |
| 10 | o3 | Checks older/deeper reasoning behavior. |

If one mode fails, rerun the same mode with the correction prompt before changing browser or OS.

## Maintainer UI Smoke Script

Maintainers can run an assisted real-UI smoke test against a dedicated Chrome instance with a DevTools port. This script does not read cookies or tokens from disk. It only connects to a browser you explicitly start with remote debugging enabled.

Start a dedicated Chrome profile:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList '--remote-debugging-port=9222 --user-data-dir=C:\AegisLoopRuntime\chrome-smoke https://chatgpt.com/'
```

Log in to ChatGPT in that window, load the unpacked AegisLoop extension if needed, and open the conversation you want to test.

Then run:

```powershell
npm run test:chatgpt-model-ui
```

The script writes:

```text
output/chatgpt-model-smoke/model-smoke-result.json
output/chatgpt-model-smoke/chatgpt-model-smoke-final.png
```

What it checks:

- ChatGPT is logged in in the controlled browser;
- the AegisLoop panel is visible when the extension is loaded;
- model options can be clicked when present;
- the ChatGPT conversation URL stays on the same conversation;
- the panel keeps the same local Codex session label after model switching.

If the script reports `browser_challenge`, use a normal dedicated Chrome window, pass the browser check, and rerun. If it reports `login_required`, log in to the dedicated Chrome window and rerun. If it reports `model_option_not_found`, record the exact UI language, browser, and screenshot in a Model compatibility report.

## Model Brief

Paste this before arming:

```text
This is an AegisLoop runner thread.

AegisLoop is not a built-in ChatGPT tool.
Do not call tools, search for tools, or say that no tool is available.
Even if you are a Pro or reasoning model, do not answer with a tool-availability disclaimer.

Your job is only to write plain text on this page.
AegisLoop will read a fenced codex JSON block from your reply and send it to local Codex.

When asked for the next step, reply with exactly one fenced codex JSON block, or exactly <<<LOOP_STOP>>> if the task should stop.
```

## Pass / Warn / Fail

| Result | Meaning |
| --- | --- |
| Pass | The model emits a valid fresh `codex` block on the first try and AegisLoop dispatches it. |
| Warn | The model first says it cannot use tools, but emits a valid block after the correction prompt. |
| Fail | The model repeatedly refuses or cannot emit a valid fenced `codex` block after three nudges. |

## Correction Prompt

If the model says it cannot find or use a tool, reply:

```text
Do not call a ChatGPT tool. AegisLoop is watching this page for a fenced codex JSON block. Reply with only one fenced codex block containing the next local Codex instruction, or <<<LOOP_STOP>>>.
```

## 中文速记

AegisLoop 不是 ChatGPT 内置工具。
模型不需要调用工具，只需要在页面上输出一个 fenced `codex` JSON block。
如果 5.3 / 5.5 Pro 说“找不到工具”，不要继续解释工具权限，直接让它输出：

```text
一个 fenced codex JSON block
或 <<<LOOP_STOP>>>
```
