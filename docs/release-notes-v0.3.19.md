# AegisLoop v0.3.19

## One-command Health Diagnosis

This release adds `npm run health` as the shortest path from “the panel is offline” to a useful diagnosis.

The command now distinguishes:

- a missing or invalid `config.json`;
- a bridge that is not running on the configured port;
- a port that responds but is not serving the AegisLoop health contract;
- a healthy bridge that is ready for the extension to retry.

The health endpoint remains public and the command never reads or prints the API token, conversation ids, Codex session ids, prompts, results, or workspace contents.

## Verification

The regression test starts real temporary HTTP servers and covers valid health responses, wrong services, invalid configuration, and an offline port.
