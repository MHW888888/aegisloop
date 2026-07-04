# Maintainer Automation

This page documents the small GitHub maintainer workflow used for AegisLoop.

It is intentionally simple: use the official GitHub CLI, keep credentials in the OS credential store, and avoid putting tokens in chat, docs, commits, or shell history.

## One-Time Setup

Install GitHub CLI on Windows:

```powershell
winget install --id GitHub.cli -e
```

Log in with the browser flow:

```powershell
gh auth login --web
```

Check the login:

```powershell
gh auth status
```

The GitHub CLI manual says the browser login flow stores the authentication token in the system credential store when available.

## Check Project Queue

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\maintainer-gh.ps1 -Action status
```

## Comment On An Issue Or PR

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\maintainer-gh.ps1 `
  -Action comment `
  -Number 13 `
  -Body "Thanks for the contribution. I reviewed this locally."
```

GitHub pull requests are also issues, so `comment` works for both.

For longer comments, prefer a temporary file:

```powershell
Set-Content .\tmp-comment.md "Thanks for the contribution." -Encoding UTF8
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\maintainer-gh.ps1 `
  -Action comment `
  -Number 13 `
  -BodyFile .\tmp-comment.md
Remove-Item .\tmp-comment.md
```

## Close An Issue

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\maintainer-gh.ps1 `
  -Action close-issue `
  -Number 3 `
  -Reason completed `
  -Body "Implemented on main. Closing as completed."
```

## Close A Pull Request

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\maintainer-gh.ps1 `
  -Action close-pr `
  -Number 13 `
  -Body "The direction was implemented on main, but this branch is now stale."
```

## Create Demo Contributor Issues

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\maintainer-gh.ps1 -Action create-demo-issues
```

The script skips exact duplicate issue titles.

## Create Stability Contributor Issues

Use this when you want to invite contributors to help with reliability, browser compatibility, and first-run recovery docs:

```powershell
$env:GITHUB_TOKEN="your-fine-grained-token"
npm run issues:stability
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

GitHub may reject assignment for users who are not collaborators. If that happens, keep the `help wanted` labels and let contributors claim issues in comments.

To invite the current stability contributors to specific tasks:

```powershell
$env:GITHUB_TOKEN="your-fine-grained-token"
npm run issues:assign-stability
Remove-Item Env:\GITHUB_TOKEN
```

This script verifies `/user` before it changes anything. If authentication fails, it stops immediately instead of printing a false success message.

## Safety Notes

- Do not paste GitHub tokens into ChatGPT, Codex, issues, PRs, or docs.
- Prefer `gh auth login --web`.
- If a token was pasted anywhere public or semi-public, revoke it in GitHub settings.
- Review generated comments before posting when the issue involves security, user data, or project governance.
