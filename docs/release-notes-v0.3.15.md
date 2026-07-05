# AegisLoop v0.3.15

This is a self-verification and recovery hardening release.

It focuses on making AegisLoop easier to debug and harder to regress after `v0.3.14` added real-browser recovery safeguards.

## Changes

- Added a sanitized **Export Debug Snapshot** button to the extension panel.
- Debug snapshots include version, route hash, leader lease, mode, local state, selector health, message signatures, pending result hash, and last submit marker metadata.
- Debug snapshots intentionally avoid raw prompts, raw Codex results, tokens, local workspace paths, and Codex session ids.
- No-codex recovery now waits for the assistant to stop streaming and remain text-stable before sending a protocol repair nudge.
- Tool-unavailable replies still get a faster repair path, but active streaming replies are not nudged.
- Added `scripts/test-state-machine.js` to lock down mode/local/leader/nonce/pending-result invariants.
- Added `scripts/test-real-loop-fixture.js` to replay arm, seed, assistant codex, dispatch, result insertion, ACK, refresh, duplicate suppression, lost-ACK recovery, non-leader rejection, and protocol repair budget behavior.
- Added both tests to `npm run check` and `npm run test:e2e:fixture`.

## Why

The next stability frontier is not another model-menu workaround. It is repeatable self-verification: when a route stalls, AegisLoop should expose enough sanitized state to diagnose it, and CI should catch accidental regressions in delivery, leader, nonce, and protocol-recovery behavior.

## Upgrade Notes

Reload the unpacked extension after pulling this version. The panel should show:

```text
AegisLoop v0.3.15
```

For future bug reports, prefer a Debug Snapshot plus the visible panel screenshot over a screenshot alone.
