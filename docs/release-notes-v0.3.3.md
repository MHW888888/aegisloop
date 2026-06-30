# v0.3.3 - Dual Briefing Materializer

This release turns the Dual Briefing docs into a product workflow.

## Added

- `POST /api/briefing/materialize` to generate Run Capsule `inbox` briefing files.
- `GET /api/briefing` to read briefing readiness and copy the GPT planner brief.
- Extension panel briefing status: `ready`, `missing`, `stale`, or `unavailable`.
- Extension panel buttons:
  - **Generate briefing**
  - **Copy GPT brief**
- `briefing.json` metadata with `templateVersion`, `projectId`, `activeBranch`, `runId`, `objective`, and `briefingHash`.

## Safety

- The materializer does not arm execution.
- The materializer does not dispatch Codex.
- Briefings are written only under the Run Capsule external runtime root.
- Chat Mode remains the default.

## Why

Run Capsule answers "where does this run belong?"

Dual Briefing answers "what should ChatGPT plan, and what should Codex execute?"
