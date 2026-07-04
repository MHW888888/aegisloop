# AegisLoop v0.3.12

Small security and compatibility hardening on top of v0.3.11.

## What changed

- Added an `/api/*` Origin gate. AegisLoop now rejects unexpected browser origins with `origin_not_allowed`.
- Kept safe defaults for the real extension route: ChatGPT origins, Chrome extension origins, and no-origin localhost CLI checks are allowed.
- Added `allowedOrigins` to `config.example.json` for users who need an explicit extra trusted origin.
- Added a no-login ChatGPT DOM fixture regression test. It checks the assumptions AegisLoop relies on for message author roles, composer, send/stop controls, and rendered fenced `codex` blocks.
- Added the DOM fixture test to `npm run check`, so Windows and macOS CI both run it.

## Why it matters

`v0.3.11` made the long-running loop harder to stall or corrupt. `v0.3.12` tightens the localhost API boundary and gives maintainers a small CI guard against accidental selector/protocol regressions without requiring a live ChatGPT login.

## Still not claimed

This is not a substitute for real account smoke tests across GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 and different browsers. It is a deterministic fixture that catches the common local assumptions before contributors ship changes.
