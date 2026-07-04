# AegisLoop v0.3.7

This is a startup reliability release.

## What Changed

- Added config schema validation before the bridge starts.
- Invalid `config.json` values now fail fast with clear `Invalid config.json:` errors.
- Added tests for common config mistakes:
  - invalid ports;
  - duplicate conversation bindings;
  - unknown conversation modes;
  - malformed Codex args;
  - malformed capsule fields;
  - invalid denylist regular expressions.

## Why It Matters

First-time users should get a clear config error instead of a half-started bridge or a later confusing runtime failure.

Thanks to @MFA-G for proposing this direction in PR #13.

## Compatibility

- No protocol change.
- No bridge API change.
- Existing valid `config.json` files should continue to work.
- Reload the Chrome extension after updating so the panel shows `v0.3.7`.
