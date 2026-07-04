# AegisLoop v0.3.8

This is a macOS / Chrome seed-confirmation reliability release.

## What Changed

- If the seed prompt is sent but ChatGPT's user-message bubble cannot be read back, AegisLoop now waits briefly for a fresh nonce `codex` block.
- If that fresh nonce block appears, AegisLoop treats the seed as delivered and continues dispatching instead of switching back to Chat Mode with `seed_submit_not_confirmed`.
- The fallback still requires the current arm nonce and the correct conversation mode, so old historical `codex` blocks remain ignored.

## Why It Matters

Some macOS + Chrome users reported this sequence:

1. Start the bridge successfully.
2. Load the unpacked extension successfully.
3. Click **Arm one run**.
4. ChatGPT returns a fresh `arm_nonce` `codex` block.
5. The panel still shows `reason: seed_submit_not_confirmed` and returns to Chat Mode.

The new fallback covers that exact case without weakening the nonce route.

## Upgrade Notes

- Pull the latest `main`.
- Restart the bridge with `npm start`.
- Open `chrome://extensions` and reload the unpacked extension.
- Refresh the ChatGPT tab.
- Confirm the panel shows `AegisLoop v0.3.8`.
