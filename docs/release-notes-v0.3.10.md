# AegisLoop v0.3.10

This release changes seed confirmation from a hard failure into a soft waiting state.

## What Changed

- If the first instruction cannot be confirmed from ChatGPT's user-message bubble, AegisLoop no longer switches the thread back to Chat Mode with `seed_submit_not_confirmed`.
- AegisLoop keeps the route armed, keeps the local state at `awaiting_assistant`, and continues polling for a fresh nonce `codex` block.
- The panel now shows: `Seed send was not confirmed; still armed and waiting until arm TTL.`
- Users can still manually click **Chat mode** to exit automation.
- Dispatch still requires the current `arm_nonce`, so stale historical `codex` blocks remain blocked.

## Why It Matters

GPT-5.5 / Ultra-style reasoning modes can take longer to produce the visible fenced `codex` block. The old behavior could stop too early even though the route, bridge, and Codex session were healthy.

v0.3.10 keeps the route alive for slow replies without weakening the local safety gate.

## Upgrade Notes

- Pull the latest `main`.
- Restart the bridge with `npm start`.
- Open `chrome://extensions` and reload the unpacked extension.
- Refresh the ChatGPT tab.
- Confirm the panel shows `AegisLoop v0.3.10`.
