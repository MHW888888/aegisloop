# Demo Issue Pack

Use these issues to invite contributors to improve AegisLoop's first-impression demo materials.

The goal is to help visitors understand the project in 30 seconds and run a safe first loop in about 3 minutes.

## Suggested Issues

### Add a one-minute happy-path GIF

Show the smallest successful AegisLoop flow:

- bridge online
- Chat Mode visible
- Arm one run
- a fenced `codex` block
- Codex result returned

Do not include real conversation ids, local paths, tokens, private workspace names, or real user data.

### Add screenshots for Chat Mode and Arm one run

Create sanitized screenshots for:

- Chat Mode: automation off
- Arm one run: waiting for a fresh nonce block

Keep all values fake or redacted.

### Add screenshots for Running and Result returned

Create sanitized screenshots for:

- Codex running
- result inserted back into ChatGPT

Do not show private file paths or real project output.

### Add screenshots for Needs approval and Frozen

Create sanitized screenshots for:

- Needs approval
- Frozen thread

The screenshots should make it clear when automation is intentionally paused.

### Add a visual walkthrough page

Create `docs/visual-walkthrough.md` with 4-6 short steps:

1. Start the local bridge.
2. Connect the ChatGPT tab.
3. Generate or paste the briefing.
4. Arm one run.
5. Watch Codex execute.
6. Review or stop.

Use existing screenshots where possible.

### Add a demo capture checklist

Create `docs/demo-capture-checklist.md` with rules for contributors:

- use fake conversation ids
- use fake workspace paths
- never show tokens
- never show private project content
- crop browser tabs if needed
- prefer a small mock task

## Bulk Creation

Maintainers can create these issues with:

```powershell
$env:GITHUB_TOKEN="your-fine-grained-token"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-demo-issues.ps1
Remove-Item Env:\GITHUB_TOKEN
```

Preview without a token:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-demo-issues.ps1 -DryRun
```
