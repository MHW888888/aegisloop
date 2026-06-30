# AegisLoop v0.3.0 - Parallel Safe Mode

This release adds the first version of Run Capsules for safer multi-thread runs.

## Highlights

- Optional `capsule` config per conversation binding.
- Capsule fields:
  - `projectId`
  - `activeBranch`
  - `branchMeaning`
  - `runId`
  - `mode`
  - `forbiddenBranchContext`
- External run directory under `runtimeRoot`.
- Automatic Run Capsule header injection before Codex dispatch.
- `readonly` capsule mode runs Codex from the external write root.
- Ambiguous stage labels can be blocked unless they include the active branch namespace.
- `readonly` capsule runs lock their own external write root instead of locking the shared source workspace.

## Why

Multiple ChatGPT conversations can be separated at the transport layer but still collide at the project-context layer if they share one workspace and use overlapping stage names.

Run Capsules add a branch namespace and external write root so runs can stay semantically separated.

## Compatibility

Existing configs keep working. Parallel Safe Mode is only enabled when a binding has:

```json
"capsule": {
  "enabled": true
}
```
