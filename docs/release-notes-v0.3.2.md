# AegisLoop v0.3.2 - Conversation Mode

v0.3.2 adds role control for each ChatGPT conversation.

## Highlights

- Conversations now default to **Chat Mode**.
- Chat Mode disables codex parsing, dispatch, auto-resume, and reformat nudges.
- Users must explicitly choose **Arm one run** or **Arm loop** before execution.
- Each arm operation creates a short-lived `arm_nonce`.
- `codex` blocks must include the current `arm_nonce` to dispatch.
- Old `codex` blocks already visible in the conversation are ignored.

## Why It Matters

Run Capsules answer "which project / branch / run is this task for?"

Conversation Mode answers "is this ChatGPT thread allowed to execute right now?"

This prevents normal Q&A threads from being pulled back into the automation protocol and prevents old task blocks from being accidentally resurrected.

## Modes

- `chat`: automation off; normal questions are safe.
- `armed`: waiting for a fresh nonce-bearing `codex` block.
- `running`: Codex is executing or AegisLoop is returning a result.
- `review`: result returned; waiting for the next nonce-bearing decision.
- `frozen`: archived; cannot execute.
