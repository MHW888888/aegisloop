# Model Compatibility

AegisLoop does not depend on a private ChatGPT tool call. It depends on plain text:

```text
the model writes one fenced codex JSON block
AegisLoop reads that block from the ChatGPT page
the local bridge sends the prompt to local Codex
```

That means model compatibility is mostly about whether the selected ChatGPT model follows the output contract.

## Known Behavior Pattern

| Model family / mode | Expected behavior | What to watch |
| --- | --- | --- |
| General chat models | Usually follow the fenced `codex` block contract after one clear instruction. | May summarize instead of emitting a block. Use the reformat nudge. |
| Pro / reasoning modes | May overthink "use Codex" and look for a built-in tool. | Remind it that AegisLoop is page-text based, not a ChatGPT tool call. |
| Faster / lighter models | May obey format but produce shorter or underspecified tasks. | Keep the first objective small and concrete. |
| Older saved chats | May contain stale `codex` blocks. | Use **Arm one run** so only fresh nonce-bearing blocks dispatch. |

Do not claim support for a specific model version until someone has run the smoke test below in the real ChatGPT UI.

## Smoke Test For A Model

Use a harmless sample workspace.

1. Start the local bridge.
2. Open a fresh ChatGPT runner thread.
3. Select the model you want to test, for example a 5.3 or 5.5 Pro mode.
4. Keep the thread in **Chat Mode**.
5. Paste the model brief below.
6. Click **Use starter text**.
7. Click **Arm one run**.
8. Confirm the model returns exactly one fresh fenced `codex` JSON block with the current `arm_nonce`.
9. Confirm AegisLoop dispatches the block and returns a Codex result.
10. Confirm the model can either produce a next fresh `codex` block or `<<<LOOP_STOP>>>`.

## Model Brief

Paste this before arming:

```text
This is an AegisLoop runner thread.

AegisLoop is not a built-in ChatGPT tool.
Do not call tools, search for tools, or say that no tool is available.

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

模型不需要“调用工具”，只需要在页面上输出一个 fenced `codex` JSON block。

如果 5.3 / 5.5 Pro 说“找不到工具”，不要继续解释工具权限，直接让它输出：

```text
一个 fenced codex JSON block
或 <<<LOOP_STOP>>>
```
