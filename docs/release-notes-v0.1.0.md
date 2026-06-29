# AegisLoop v0.1.0

Initial public release.

This public release packages the current AegisLoop extension/bridge implementation line, including the Chrome extension panel version `2.3.1`.

## What is AegisLoop?

AegisLoop is a guarded local bridge that connects ChatGPT web conversations with local Codex sessions. It lets ChatGPT plan and review while Codex executes in a bound local workspace.

## Included

- Chrome MV3 extension for ChatGPT pages.
- Local Node bridge on `127.0.0.1`.
- Conversation-to-Codex binding through local config.
- Fenced `codex` block extraction.
- Codex result insertion back into ChatGPT.
- Research/safety denylist gate.
- Optional low-risk gate auto-approval.
- Content-hash deduplication.
- Per-workspace execution lock.
- JSONL audit logs.
- Optional PowerShell watchdog.
- English and Chinese README.

## Safety Notes

AegisLoop is local-first, but it still automates a web UI. Keep loops bounded, inspect gates, and avoid using it for production, trading, or irreversible actions without a separate human approval process.

## Known Limitations

- ChatGPT DOM changes may require selector updates.
- Consumer web UI automation can be rate-limited or interrupted.
- True parallel execution requires separate worktrees or workspace copies.
- This is not an official OpenAI product.
