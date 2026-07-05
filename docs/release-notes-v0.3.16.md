# AegisLoop v0.3.16

This is a nonce-boundary hardening release.

## Changes

- Clarified that `arm_nonce` / `turn_nonce` values are visible and non-secret.
- Added an `armId` plus per-turn `turnNonce` model for dispatch freshness.
- Turn tokens are single-use and rotate after accepted Arm loop dispatches.
- The bridge now rejects stale, missing, mismatched, expired, or replayed turn tokens with explicit rules.
- `/api/dispatch` now requires structured `armId`, `turnNonce`, `assistantMessageSig`, and `codeBlockHash` fields.
- The server no longer treats a nonce merely appearing inside prompt text as authorization.
- Audit logs and Debug Snapshot output keep only hashed token metadata, not raw turn tokens.
- Tests now cover prompt-only token misuse, wrong arm id, missing turn token, replay blocking, loop token rotation, and audit redaction.

## Why

The turn token is a freshness marker, not a secret. It prevents old `codex` blocks from being resurrected accidentally, while real local authority remains in the bridge API token, Origin gate, leader lease, explicit Armed Mode, pending-result lock, capsule/workspace gates, and policy checks.

## Upgrade Notes

Reload the unpacked extension after pulling this version. The panel should show:

```text
AegisLoop v0.3.16
```

If a model outputs only the old `arm_nonce` field, click **Arm one run** again or ask it for a visible JSON block containing both `arm_id` and `turn_nonce`.
