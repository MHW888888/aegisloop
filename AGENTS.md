# AegisLoop Development Rules

## Scope

- Keep changes limited to the requested release objective.
- Preserve Chat Mode as the default and require explicit arming before dispatch.
- Do not weaken API token, Origin, leader lease, turn token, pending-result, capsule, or policy gates.

## Safety

- Never commit `config.json`, tokens, `state.json`, logs, jobs, runs, local paths, or Codex session ids.
- Do not automatically retry an execution after it may have produced file, command, or MCP side effects.
- Treat an interrupted job as `recovery_required` unless completion can be proven from persisted state.
- Keep legacy execution only as a capability-based compatibility fallback selected before a job starts.

## Verification

- Add a regression test for each bug fix.
- Run `npm run check` before publishing.
- Run `npm run doctor` without exposing configured secrets.
- Keep package, extension manifest, and content-script versions aligned.

## Publishing

- Prefer a branch and pull request over direct writes to `main`.
- Do not merge while required checks are failing.
- Treat release presentation as part of acceptance, not a later cleanup:
  - Recapture affected UI screenshots from the shipped code with synthetic data; verify their version, captions, readability, and expanded/minimized states when applicable.
  - Keep README Current Focus concise and current; link older changes to release notes. Prefer a dynamic release badge over a hardcoded version badge.
  - Review GitHub About/topics, package description/keywords, and extension description for consistency. Use tags for shipped capabilities, not planned features or unverified model compatibility.
  - Verify release/download links and state the difference between fixture coverage and live-account testing. Do not expose private routes, credentials, or workspace data in assets.
  - Read back remote metadata after publishing. Docs-only or topic changes do not require a new runtime version or overwriting an existing release asset.
