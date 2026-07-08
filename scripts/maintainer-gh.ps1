param(
  [ValidateSet("status", "comment", "close-issue", "close-pr", "create-demo-issues")]
  [string]$Action = "status",
  [string]$Repo = "MHW888888/aegisloop",
  [int]$Number = 0,
  [string]$Body = "",
  [string]$BodyFile = "",
  [ValidateSet("completed", "not planned", "duplicate")]
  [string]$Reason = "completed"
)

$ErrorActionPreference = "Stop"

function Find-Gh {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "$env:ProgramFiles\GitHub CLI\gh.exe",
    "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }

  throw "GitHub CLI was not found. Install it with: winget install --id GitHub.cli -e"
}

function Require-Number {
  if ($Number -le 0) {
    throw "-Number is required for action '$Action'"
  }
}

function Read-BodyText {
  if ($BodyFile) {
    return Get-Content -Raw -LiteralPath $BodyFile
  }
  if ($Body) {
    return $Body
  }
  return ""
}

function Invoke-GhWithBodyFile {
  param(
    [string[]]$Arguments,
    [string]$Text
  )

  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -LiteralPath $tmp -Value $Text -Encoding UTF8
    & $script:Gh @Arguments --body-file $tmp
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-Auth {
  & $script:Gh auth status | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not authenticated. Run: gh auth login --web"
  }
}

function Create-DemoIssues {
  $issues = @(
    @{
      title = "Add a one-minute happy-path GIF"
      labels = "documentation,help wanted,good first issue,demo,lite"
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
      labels = "documentation,help wanted,good first issue,demo,lite"
      body = @"
Create sanitized screenshots for two beginner-critical states:

- Chat Mode: automation off
- Arm one run: waiting for a fresh turn-token block

All values should be fake, placeholder, or redacted.
"@
    },
    @{
      title = "Add screenshots for Running and Result returned"
      labels = "documentation,help wanted,good first issue,demo,lite"
      body = @"
Create sanitized screenshots for:

- Codex running
- result inserted back into ChatGPT

Do not show private file paths, real project output, tokens, or private workspace content.
"@
    },
    @{
      title = "Add screenshots for Needs approval and Frozen states"
      labels = "documentation,help wanted,good first issue,demo,lite"
      body = @"
Create sanitized screenshots for:

- Needs approval
- Frozen thread

The screenshots should make it clear when automation is intentionally paused and why that is safe.
"@
    },
    @{
      title = "Add a visual walkthrough page"
      labels = "documentation,help wanted,good first issue,demo"
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
      labels = "documentation,help wanted,good first issue,demo"
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

  $existingJson = & $script:Gh issue list --repo $Repo --state all --limit 200 --json title
  $existing = @{}
  foreach ($item in ($existingJson | ConvertFrom-Json)) {
    $existing[$item.title] = $true
  }

  foreach ($issue in $issues) {
    if ($existing.ContainsKey($issue.title)) {
      Write-Host "[skip] $($issue.title)"
      continue
    }

    $tmp = [System.IO.Path]::GetTempFileName()
    try {
      Set-Content -LiteralPath $tmp -Value $issue.body -Encoding UTF8
      & $script:Gh issue create --repo $Repo --title $issue.title --body-file $tmp --label $issue.labels
    } finally {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
  }
}

$script:Gh = Find-Gh

Ensure-Auth

if ($Action -eq "status") {
  Write-Host ""
  Write-Host "Open pull requests:"
  & $script:Gh pr list --repo $Repo --state open
  Write-Host ""
  Write-Host "Open issues:"
  & $script:Gh issue list --repo $Repo --state open --limit 30
  exit 0
}

if ($Action -eq "comment") {
  Require-Number
  $text = Read-BodyText
  if (-not $text) { throw "-Body or -BodyFile is required for comment" }
  Invoke-GhWithBodyFile -Arguments @("issue", "comment", $Number, "--repo", $Repo) -Text $text
  exit 0
}

if ($Action -eq "close-issue") {
  Require-Number
  $text = Read-BodyText
  if ($text) {
    & $script:Gh issue close $Number --repo $Repo --reason $Reason --comment $text
  } else {
    & $script:Gh issue close $Number --repo $Repo --reason $Reason
  }
  exit 0
}

if ($Action -eq "close-pr") {
  Require-Number
  $text = Read-BodyText
  if ($text) {
    & $script:Gh pr close $Number --repo $Repo --comment $text
  } else {
    & $script:Gh pr close $Number --repo $Repo
  }
  exit 0
}

if ($Action -eq "create-demo-issues") {
  Create-DemoIssues
  exit 0
}
