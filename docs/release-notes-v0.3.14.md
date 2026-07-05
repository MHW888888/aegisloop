# AegisLoop v0.3.14

This is a real-browser recovery hardening release.

It focuses on the failure modes that show up after the core bridge is already stable: slow model replies, duplicate ChatGPT tabs, page refreshes, delayed DOM confirmation, and bridge write errors that should not desync the panel from the local bridge.

## Changes

- Added a three-step local result delivery ledger: `delivery_attempted`, `dom_confirmed`, and `ack_sent`.
- Result messages now include a visible `aegisloop_result_id` marker so a refreshed page can recover an attempted delivery from recent user bubbles before ACKing.
- If a delivery was attempted but cannot be confirmed from the DOM, AegisLoop pauses with `result_delivery_unconfirmed` instead of blindly inserting the same result again.
- Added checked control writes for mode changes, result ACK/NACK, gate approve/skip, stop, and briefing generation. Failed writes surface `leader_conflict`, `auth_required`, `origin_not_allowed`, `bridge_timeout`, or `pending_result_exists`.
- The extension panel now shows the current tab's leader status, client id, and lease countdown.
- Duplicate non-leader tabs disable execution controls and explain that the user should close the duplicate tab or wait for the lease to expire.
- Pro / GPT-5.x "tool unavailable" replies trigger a faster visible codex-block repair nudge while ordinary slow replies still get the normal grace window.
- `npm run doctor` now warns that the unpacked extension has broad localhost host permissions and should be used with `apiToken` for normal use.
- Added a no-login real-browser recovery fixture that checks duplicate suppression, unconfirmed delivery behavior, and structured bridge write error classification.
- Cleaned up mojibake in compatibility documentation.

## Why

`v0.3.13` made delivery and control idempotent at the bridge layer. `v0.3.14` makes the browser side more honest and recoverable: a tab that is not the leader says so, a failed control write does not pretend to have succeeded, and a result that may already have been inserted is not sent again just because the DOM confirmation was delayed.

## Upgrade Notes

Reload the unpacked Chrome extension after pulling this version. The panel should show:

```text
AegisLoop v0.3.14
```

If a tester reports `result_delivery_unconfirmed`, ask for a screenshot showing the panel version, leader state, result delivery reason, and the last few ChatGPT user bubbles. Do not ask them to reconnect the route unless the ChatGPT conversation URL changed.
