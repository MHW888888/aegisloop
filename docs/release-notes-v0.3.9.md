# AegisLoop v0.3.9

This is a seed-confirmation hardening release for macOS and Windows Chrome users.

## What Changed

- Extended the fresh nonce `codex` block fallback window from 4 seconds to 15 seconds.
- Added a named `SEED_FRESH_CODEX_CONFIRM_MS` constant so future compatibility checks can verify the timeout directly.
- Updated compatibility checks so the seed fallback cannot silently shrink back to the too-short window.

## Why It Matters

Some users can successfully send the first instruction and receive a fresh nonce `codex` block, but ChatGPT's current page DOM may not expose the sent user-message bubble quickly enough for AegisLoop to confirm it.

Earlier builds could still return to Chat Mode with `seed_submit_not_confirmed` if the fresh block appeared too slowly. v0.3.9 keeps the route armed longer while still requiring the current arm nonce.

## Upgrade Notes

- Pull the latest `main`.
- Restart the bridge with `npm start`.
- Open `chrome://extensions` and reload the unpacked extension.
- Refresh the ChatGPT tab.
- Confirm the panel shows `AegisLoop v0.3.9`.
