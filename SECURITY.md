# Security Policy

AegisLoop is a local automation bridge. Treat `config.json`, logs, session ids, webhooks, and workspace paths as private.

## Non-secret Turn Tokens

`arm_nonce` / `turn_nonce` values are visible in the ChatGPT page. They are not passwords, API tokens, bearer tokens, or authentication secrets.

AegisLoop uses them only as freshness markers to prevent stale `codex` blocks from old chat history being replayed accidentally. Local authority must come from `X-AegisLoop-Token`, request Origin checks, the one-tab leader lease, explicit Armed Mode, exact structured `armId` + `turnNonce` dispatch fields, pending-result locks, capsule/workspace gates, and local policy checks.

Do not report "the nonce is visible" as a secret leak by itself. Do report any path where a stale or reused turn token can dispatch a new task.

## Do Not Commit

- `config.json`
- `state.json`
- `logs/`
- webhook URLs
- real ChatGPT conversation ids
- real Codex session ids
- private workspace paths

## Reporting

Open a GitHub issue if you find a security-relevant bug in the public code.

Do not include private tokens, session ids, or production credentials in the issue.
