# Stability Issue Pack

Use these issues to invite contributors to improve AegisLoop reliability, browser compatibility, and first-run recovery paths.

These are intentionally small tasks. They should be safe for contributors who are new to the project.

## Suggested Issues

### Add bridge URL validation screenshots and failure cases

Document the Local bridge URL validation flow:

- valid: `http://127.0.0.1:17380`
- invalid: `https://127.0.0.1:17380`
- invalid: `http://127.0.0.1:17380/health`

Explain that the panel accepts only local bridge origins:

```text
http://127.0.0.1:<port>
http://localhost:<port>
```

### Add real Edge compatibility smoke report

Run a manual smoke test in Microsoft Edge:

1. Load the unpacked extension.
2. Confirm the panel appears on `chatgpt.com`.
3. Confirm Chat Mode does not dispatch old `codex` blocks.
4. Confirm Local bridge URL can be saved.
5. Confirm Arm one run reaches the expected waiting state.

### Add Brave local bridge troubleshooting notes

Document practical Brave-specific checks:

- local bridge access at `http://127.0.0.1:<port>`
- Shields/privacy settings that may affect extension behavior
- how to test `/health` in the same browser
- when to fall back to Chrome or Edge

### Investigate Firefox WebExtension compatibility gaps

Research what Firefox support would require:

- manifest differences
- host permission behavior
- MV3 service worker differences
- `chrome.*` versus `browser.*` API compatibility
- whether Firefox should stay experimental or unsupported for now

### Add ChatGPT selector regression notes

Document how to diagnose UI selector breakage:

- where to enable AegisLoop debug mode
- what composer / send button / message selectors are used
- what symptoms indicate selector breakage
- how to report a minimal issue without leaking private chat content

### Add result ACK/NACK recovery screenshots or notes

Explain the result delivery safety behavior:

- result is not consumed just because it was read
- ACK happens after the extension confirms ChatGPT received the result
- failed insert should keep the result pending or pause safely

## Bulk Creation

Maintainers can create these issues with:

```powershell
$env:GITHUB_TOKEN="your-fine-grained-token"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-stability-issues.ps1
Remove-Item Env:\GITHUB_TOKEN
```

Preview without a token:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-stability-issues.ps1 -DryRun
```

Optionally try to assign issues round-robin:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-stability-issues.ps1 -Assignees alice,bob
```

GitHub may reject assignment for users who are not collaborators. In that case, keep the `help wanted` label and let contributors claim issues in comments.
