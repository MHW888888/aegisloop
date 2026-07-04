# AegisLoop v0.3.11

Stability hardening for longer local runs and slower ChatGPT replies.

## What changed

- Added an 8 second timeout around extension-to-bridge requests. A stalled localhost call now returns `bridge_timeout` instead of leaving the content-script tick stuck forever.
- Added content-side bridge request timeout protection as a second safety net.
- Reset transient state when the ChatGPT conversation id changes in the same browser tab, then baseline the new thread before automation resumes.
- Kept unacknowledged Codex results as a hard server-side blocker. A new dispatch or forced execution is rejected with `pending_result_exists` until the previous result is ACKed or NACKed.
- Split dispatch hash state into attempted, failed, and ACKed buckets. Only successful ACKed results become hard duplicates; failed results can be retried with a fresh arm nonce.
- Added process-tree cleanup on Codex timeout. Windows uses `taskkill /T /F`; macOS/Linux use process-group termination with a kill fallback.
- Bounded stdout/stderr accumulation with ring buffers so long Codex logs cannot grow memory without limit.
- Added selector health to the panel debug view: composer, send/stop controls, assistant/user counts, and latest message signatures.
- Changed missing-`codex` recovery to wait briefly before nudging and to end in `needs_user_protocol_fix` instead of silently looking like ordinary Chat Mode.
- Strengthened `npm run doctor` warning when `apiToken` is empty.

## Why it matters

`v0.3.10` fixed the slow-seed path for 5.5 / Ultra style replies. `v0.3.11` hardens the rest of the loop: if the bridge stalls, a result is pending, ChatGPT switches routes, Codex logs too much output, or a task times out, AegisLoop should fail visibly and recoverably instead of losing state.

## Compatibility note

This version still does not claim that every live ChatGPT model menu has been manually smoke-tested. Real model/browser coverage is tracked through the public smoke-test issues. The code path is now safer for those tests because route identity is conversation-based and pending results cannot be overwritten.
