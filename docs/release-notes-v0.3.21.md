# AegisLoop v0.3.21

## Local Console Preview

- Added an optional local web console at `/ui/` for bounded one-shot and loop execution.
- Kept the configured API token server-side by using a short-lived, same-origin `HttpOnly` UI session.
- Added server-side loop limits with a configurable default and an absolute ceiling of 50 dispatches.
- Added exact pending-result recovery after reload or UI-session expiry.
- Labeled no-edit prompts as guidance rather than an enforced sandbox and exposed the effective capsule and Codex CLI sandbox policy.
- Hardened sandbox-policy reporting so unknown or malformed CLI values are never shown as enforced.
- Restricted generated `config.json` permissions to owner read/write on macOS and Linux.
- Validated the configured bridge port before the OS browser launcher is invoked.

The Chrome extension route remains supported. Start with one bounded run and verify the workspace and effective sandbox policy before enabling a loop.
