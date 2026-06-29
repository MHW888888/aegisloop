# Security Policy

AegisLoop is a local automation bridge. Treat `config.json`, logs, session ids, webhooks, and workspace paths as private.

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
