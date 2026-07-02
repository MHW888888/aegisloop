# AegisLoop v0.3.6

This is a small connection-path optimization release.

## What Changed

- Replaced fixed 1.5s extension polling with adaptive polling.
- Active execution states poll faster so Codex results and GPT replies are noticed sooner.
- Idle / Chat Mode states poll slower to reduce local bridge traffic.
- ChatGPT DOM changes now nudge the next check without waiting for the full idle interval.

## Why It Matters

The extension should feel more responsive while a loop is active, while being quieter when the user is only chatting or the thread is idle.

## Compatibility

- No protocol change.
- No config migration.
- No bridge API change.
- Reload the Chrome extension after updating so the panel shows `v0.3.6`.
