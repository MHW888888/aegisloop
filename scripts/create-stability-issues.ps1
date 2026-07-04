param(
  [string]$Repo = "MHW888888/aegisloop",
  [string[]]$Assignees = @(),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$labelSpecs = @{
  "documentation" = "0366d6"
  "help wanted" = "008672"
  "good first issue" = "7057ff"
  "stability" = "0e8a16"
  "browser" = "5319e7"
  "lite" = "fef2c0"
}

$issues = @(
  @{
    title = "Add bridge URL validation screenshots and failure cases"
    labels = @("documentation", "help wanted", "good first issue", "stability", "lite")
    body = @"
Document the Local bridge URL validation flow.

Suggested scope:
- show a valid URL such as http://127.0.0.1:17380
- show one invalid example such as https://127.0.0.1:17380 or http://127.0.0.1:17380/health
- explain that only http://127.0.0.1:<port> and http://localhost:<port> are accepted

Do not include real conversation ids, tokens, local private paths, or private workspace content.
"@
  },
  @{
    title = "Add real Edge compatibility smoke report"
    labels = @("documentation", "help wanted", "good first issue", "stability", "browser")
    body = @"
Run a small manual smoke test in Microsoft Edge and document the result.

Suggested scope:
- load the unpacked extension
- confirm the panel appears on chatgpt.com
- confirm Chat Mode does not dispatch old codex blocks
- confirm the Local bridge URL can be saved
- confirm Arm one run reaches the expected waiting state

Use fake/redacted values in screenshots.
"@
  },
  @{
    title = "Add Brave local bridge troubleshooting notes"
    labels = @("documentation", "help wanted", "good first issue", "stability", "browser")
    body = @"
Create a short troubleshooting note for Brave users.

Suggested scope:
- local bridge access at http://127.0.0.1:<port>
- Shields/privacy settings that may affect extension behavior
- how to test /health in the same browser
- when to fall back to Chrome or Edge

Keep the note practical and beginner-friendly.
"@
  },
  @{
    title = "Investigate Firefox WebExtension compatibility gaps"
    labels = @("documentation", "help wanted", "stability", "browser")
    body = @"
Investigate what would be needed for Firefox support.

Suggested scope:
- manifest differences
- host_permissions behavior
- MV3 service worker differences
- chrome.* versus browser.* API compatibility
- whether AegisLoop should document Firefox as experimental or unsupported for now

This issue is research-only. A PR can be docs-only.
"@
  },
  @{
    title = "Add ChatGPT selector regression notes"
    labels = @("documentation", "help wanted", "good first issue", "stability")
    body = @"
Document how to diagnose selector breakage when ChatGPT changes its UI.

Suggested scope:
- where to enable AegisLoop debug mode
- what composer / send button / message selectors are used
- what symptoms indicate selector breakage
- how to report a minimal browser/DOM issue without leaking private chat content
"@
  },
  @{
    title = "Add result ACK/NACK recovery screenshots or notes"
    labels = @("documentation", "help wanted", "good first issue", "stability")
    body = @"
Explain the result delivery safety behavior.

Suggested scope:
- result is not consumed just because it was read
- ACK happens after the extension confirms ChatGPT received the result
- failed insert should keep the result pending or pause safely
- add a small sanitized screenshot or sequence diagram if useful
"@
  }
)

if ($DryRun) {
  foreach ($issue in $issues) {
    $assigneeText = ""
    if ($Assignees.Count) {
      $assigneeText = " -> assignee candidate: " + $Assignees[0]
    }
    Write-Host "[dry-run] $($issue.title)$assigneeText"
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

function Invoke-GitHub {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null
  )

  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $headers
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
    $params.ContentType = "application/json"
  }
  Invoke-RestMethod @params
}

$existingLabels = @{}
foreach ($label in (Invoke-GitHub -Method Get -Uri "https://api.github.com/repos/$Repo/labels?per_page=100")) {
  $existingLabels[$label.name] = $true
}

foreach ($name in $labelSpecs.Keys) {
  if ($existingLabels.ContainsKey($name)) { continue }
  Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/labels" -Body @{
    name = $name
    color = $labelSpecs[$name]
  } | Out-Null
  Write-Host "[label] $name"
}

$existing = Invoke-GitHub -Method Get -Uri "https://api.github.com/repos/$Repo/issues?state=all&per_page=100"
$existingTitles = @{}
foreach ($item in $existing) {
  if (-not $item.pull_request) {
    $existingTitles[$item.title] = $true
  }
}

$createdCount = 0
foreach ($issue in $issues) {
  if ($existingTitles.ContainsKey($issue.title)) {
    Write-Host "[skip] $($issue.title)"
    continue
  }

  $created = Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/issues" -Body @{
    title = $issue.title
    body = $issue.body
    labels = $issue.labels
  }

  Write-Host "[created] #$($created.number) $($created.title)"

  if ($Assignees.Count) {
    $assignee = $Assignees[$createdCount % $Assignees.Count]
    try {
      Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/issues/$($created.number)/assignees" -Body @{
        assignees = @($assignee)
      } | Out-Null
      Write-Host "[assigned] #$($created.number) -> $assignee"
    } catch {
      Write-Warning "Could not assign #$($created.number) to $assignee. GitHub usually only allows collaborators to be assigned."
    }
  }

  $createdCount++
}
