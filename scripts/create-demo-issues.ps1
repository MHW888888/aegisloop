param(
  [string]$Repo = "MHW888888/aegisloop",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$issues = @(
  @{
    title = "Add a one-minute happy-path GIF"
    labels = @("documentation", "help wanted", "good first issue", "demo", "lite")
    body = @"
Create a short sanitized GIF that shows the smallest successful AegisLoop flow.

Suggested scope:
- bridge online
- Chat Mode visible
- Arm one run
- one fenced codex block
- Codex result returned

Do not include real conversation ids, local paths, tokens, private workspace names, or real user data.
"@
  },
  @{
    title = "Add screenshots for Chat Mode and Arm one run"
    labels = @("documentation", "help wanted", "good first issue", "demo", "lite")
    body = @"
Create sanitized screenshots for two beginner-critical states:

- Chat Mode: automation off
- Arm one run: waiting for a fresh turn-token block

All values should be fake, placeholder, or redacted.
"@
  },
  @{
    title = "Add screenshots for Running and Result returned"
    labels = @("documentation", "help wanted", "good first issue", "demo", "lite")
    body = @"
Create sanitized screenshots for:

- Codex running
- result inserted back into ChatGPT

Do not show private file paths, real project output, tokens, or private workspace content.
"@
  },
  @{
    title = "Add screenshots for Needs approval and Frozen states"
    labels = @("documentation", "help wanted", "good first issue", "demo", "lite")
    body = @"
Create sanitized screenshots for:

- Needs approval
- Frozen thread

The screenshots should make it clear when automation is intentionally paused and why that is safe.
"@
  },
  @{
    title = "Add a visual walkthrough page"
    labels = @("documentation", "help wanted", "good first issue", "demo")
    body = @"
Create docs/visual-walkthrough.md with a simple visual-first flow:

1. Start the local bridge.
2. Connect the ChatGPT tab.
3. Generate or paste the briefing.
4. Arm one run.
5. Watch Codex execute.
6. Review or stop.

Use existing sanitized screenshots where possible.
"@
  },
  @{
    title = "Add a demo capture checklist"
    labels = @("documentation", "help wanted", "good first issue", "demo")
    body = @"
Create docs/demo-capture-checklist.md with safety rules for demo contributors:

- use fake conversation ids
- use fake workspace paths
- never show tokens
- never show private project content
- crop browser tabs if needed
- prefer a small mock task
"@
  }
)

if ($DryRun) {
  foreach ($issue in $issues) {
    Write-Host "[dry-run] $($issue.title)"
  }
  exit 0
}

if (-not $env:GITHUB_TOKEN) {
  throw "GITHUB_TOKEN is not set. Create a fine-grained token with Issues: Read and write, then set `$env:GITHUB_TOKEN."
}

$headers = @{
  Authorization = "Bearer $env:GITHUB_TOKEN"
  "User-Agent" = "aegisloop-maintainer"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$existing = Invoke-RestMethod `
  -Method Get `
  -Uri "https://api.github.com/repos/$Repo/issues?state=all&per_page=100" `
  -Headers $headers

$existingTitles = @{}
foreach ($item in $existing) {
  if (-not $item.pull_request) {
    $existingTitles[$item.title] = $true
  }
}

foreach ($issue in $issues) {
  if ($existingTitles.ContainsKey($issue.title)) {
    Write-Host "[skip] $($issue.title)"
    continue
  }

  $payload = @{
    title = $issue.title
    body = $issue.body
    labels = $issue.labels
  } | ConvertTo-Json -Depth 5

  $created = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.github.com/repos/$Repo/issues" `
    -Headers $headers `
    -Body $payload `
    -ContentType "application/json"

  Write-Host "[created] #$($created.number) $($created.title)"
}
