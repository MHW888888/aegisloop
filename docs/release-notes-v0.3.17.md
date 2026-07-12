# AegisLoop v0.3.17

This release clarifies how AegisLoop coexists with Codex built into ChatGPT and adds GPT-5.6 compatibility targets.

## Changes

- Repositioned AegisLoop as a guarded control plane for explicit ChatGPT-to-local-Codex execution.
- Added a visible `Execution route: AegisLoop local bridge` panel row.
- Updated runner prompts to avoid accidentally starting ChatGPT's built-in Codex during an AegisLoop turn.
- Added a bilingual Codex coexistence guide.
- Added GPT-5.6 Sol, Terra, and Luna to model smoke targets and issue reporting.
- Updated launch and tester copy without claiming unverified model support.

## Why

Native Codex and AegisLoop solve different problems. Native Codex is the best default when its built-in task, worktree, cloud, editor, or terminal workflow fits. AegisLoop remains useful when a user needs a dedicated browser planner bound to an existing local Codex session with explicit arming, branch-safe Run Capsules, recoverable result delivery, and local audit state.

## Upgrade Notes

Reload the unpacked extension after pulling this version. The panel should show:

```text
AegisLoop v0.3.17
Execution route: AegisLoop local bridge
```

GPT-5.6 modes remain real-browser smoke targets until reports are collected.
