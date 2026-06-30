# AegisLoop v0.3.1 - Bridge Hardening

v0.3.1 is a small hardening release for the v0.3 Run Capsule foundation.

## Highlights

- Optional local API token for every `/api/*` bridge endpoint.
- Result delivery now uses explicit `ACK` / `NACK`.
- Package, Chrome extension, and protocol versions are aligned.
- The extension panel shows the active Run Capsule project, branch, mode, run id, and external write-root status.

## Why It Matters

The bridge no longer treats "result was read" as "result reached ChatGPT." A result remains pending until the content script confirms that ChatGPT accepted the inserted user message.

When `apiToken` is configured, random local web pages cannot call AegisLoop APIs without the `X-AegisLoop-Token` header.

## Compatibility

`apiToken` is optional. Existing private setups can keep it empty, but public or long-running setups should enable it.

`/health` remains public for simple local status checks.
