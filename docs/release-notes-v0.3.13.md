# AegisLoop v0.3.13

This is a durability and idempotency hardening release.

It focuses on the failure modes that appear during long-running real use: duplicate ChatGPT tabs, lost ACKs, repeated result insertion, weak submit confirmation, oversized local API requests, and stale or corrupt bridge state.

## Changes

- Added a per-tab `clientId` and a short leader lease per conversation. Only the current leader tab can arm, dispatch, ACK, or NACK.
- Added stable `resultId` values for Codex results. ACK/NACK calls now include `resultId`, and repeated ACKs are safe.
- The extension remembers inserted `resultId` values locally to avoid reinserting the same result after refresh or ACK loss.
- Submit confirmation now uses a unique `aegisloop_msg_id` line instead of short prefix matching.
- Assistant message signatures now include full message text plus rendered code blocks.
- Local API request bodies are capped with a structured `payload_too_large` response.
- `/api/*` is fail-closed when `apiToken` is empty unless `AEGISLOOP_ALLOW_NO_TOKEN=1` is explicitly set for a throwaway local test.
- Dispatch nonce validation now requires an exact `armNonce` field. Merely placing the nonce inside prompt text is not enough.
- Audit logs redact raw prompts and final messages by default. Raw audit text is available only with `debugAuditRaw=true`.
- `state.json` now keeps a `.bak` and quarantines corrupt state files instead of silently resetting.

## Why

`v0.3.10` fixed slow seed replies. `v0.3.11` made bridge timeouts, pending results, process cleanup, and selector health more robust. `v0.3.12` tightened origins and browser fixture checks.

`v0.3.13` makes delivery and control idempotent: one active tab controls one conversation, one result has one stable id, and retries are explicit instead of accidental.

## Upgrade Notes

For normal use, set `apiToken` in `config.json` and save the same token in the extension panel. `/health` remains public, but `/api/*` no longer works without a token unless you intentionally run:

```powershell
$env:AEGISLOOP_ALLOW_NO_TOKEN="1"
npm start
```

Use that no-token mode only for a disposable local smoke test.
