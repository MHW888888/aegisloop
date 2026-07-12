# v0.3.18 - Structured Executor & Crash Recovery

This release changes the local execution boundary without changing the ChatGPT routing contract.

## What changed

- Added an executor adapter boundary.
- Added a preferred `cli-json` adapter using `codex exec resume --json --output-schema`.
- Kept the plain-output adapter only as a capability-selected compatibility fallback.
- Added a versioned structured result schema for summaries, changed files, commands, tests, risks, and the next candidate.
- Added a persistent local job journal with accepted, process, side-effect, result-pending, ACK, timeout, and recovery states.
- Added startup reconciliation so an interrupted bridge does not remain permanently busy.
- Removed blind infrastructure retries. A failed execution is reported once and must be reviewed before another armed run.
- Required the active tab leader lease for `GET /api/result`, matching dispatch and ACK/NACK.
- Added Codex capability reporting to `npm run doctor`.
- Added root and Run Capsule `AGENTS.md` guidance.
- Split checks into static, unit, bridge, and fixture groups, and added Linux CI coverage.

## Recovery rule

If the bridge stops after a job is accepted but before delivery can be proven, AegisLoop clears the stale busy lock and pauses the route as `recovery_required`. It does not automatically run the prompt again because the first attempt may already have changed files, run commands, or called an MCP tool.

## Compatibility

`codex.executorAdapter` accepts:

- `auto`: prefer structured JSONL when supported;
- `cli-json`: require structured JSONL and output-schema support;
- `legacy`: keep the previous plain-output path.

Adapter fallback is selected before execution. A structured job never falls back and reruns after it starts.
