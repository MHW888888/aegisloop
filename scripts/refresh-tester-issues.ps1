param(
  [string]$Repo = "MHW888888/aegisloop",
  [int]$RecruitmentIssue = 34,
  [int[]]$TesterIssues = @(28, 29, 30, 31, 32, 33),
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$labelSpecs = @{
  "help wanted" = "008672"
  "good first issue" = "7057ff"
  "stability" = "0e8a16"
  "browser" = "5319e7"
  "model-compatibility" = "c5def5"
  "call-for-testers" = "fbca04"
  "no-code" = "d4c5f9"
  "5-minute-test" = "c2e0c6"
  "10-minute-test" = "bfd4f2"
}

$recruitmentTitle = "Call for testers: 5-minute AegisLoop browser and model checks"

$recruitmentBody = @'
We are looking for volunteer testers for AegisLoop.

AegisLoop connects one ChatGPT conversation to one local Codex session through a guarded local bridge. Right now we need real-world compatibility reports across browsers, operating systems, and ChatGPT model modes.

No coding is required. Most reports take 5-10 minutes.

## Pick one path

- Windows + Chrome
- Windows + Edge
- Windows + Brave
- macOS + Chrome
- macOS + Edge
- Chinese ChatGPT UI labels
- GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 model menu behavior

## What to check

1. The AegisLoop panel appears on ChatGPT.
2. The local bridge shows online.
3. Switching ChatGPT model mode does not change the ChatGPT conversation route.
4. The same ChatGPT conversation stays connected to the same local Codex session.
5. If something blocks the test, the panel or script reports a clear reason such as `login_required`, `browser_challenge`, `model_option_not_found`, `leader_conflict`, or `bridge_timeout`.

## Report template

Please comment with:

```text
OS:
Browser:
ChatGPT UI language:
AegisLoop version:
Model mode tested:
Result: pass / partial / blocked
What happened:
Sanitized Debug Snapshot or screenshot:
```

## Safety

Please do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content. If you include a screenshot, crop or blur anything private.

If you want to help, comment with the one path you can test. Thank you!
'@

$taskCommentMarker = "<!-- aegisloop-tester-refresh-v1 -->"
$taskComment = @"
$taskCommentMarker

This is a no-code testing task.

Time: about 5-10 minutes.

Please pick one browser / OS / model path, run the check, and paste this report:

```text
OS:
Browser:
ChatGPT UI language:
AegisLoop version:
Model mode tested:
Result: pass / partial / blocked
What happened:
Sanitized Debug Snapshot or screenshot:
```

What counts as done:

- one clear pass / partial / blocked result;
- enough detail for a maintainer to reproduce or understand the behavior;
- no real conversation IDs, tokens, local private paths, private workspace names, or private project content.
"@

if ($DryRun) {
  Write-Host "[dry-run] would refresh recruitment issue #$RecruitmentIssue"
  foreach ($issue in $TesterIssues) {
    Write-Host "[dry-run] would add no-code tester comment / labels to #$issue"
  }
  exit 0
}

if (-not $env:GITHUB_TOKEN) {
  throw "GITHUB_TOKEN is not set. Set `$env:GITHUB_TOKEN in this PowerShell process with a fine-grained token that has Issues: Read and write."
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
    ErrorAction = "Stop"
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
    $params.ContentType = "application/json"
  }
  Invoke-RestMethod @params
}

$me = Invoke-GitHub -Method Get -Uri "https://api.github.com/user"
Write-Host "[auth] @$($me.login)"

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

Invoke-GitHub -Method Patch -Uri "https://api.github.com/repos/$Repo/issues/$RecruitmentIssue" -Body @{
  title = $recruitmentTitle
  body = $recruitmentBody
  labels = @("help wanted", "good first issue", "stability", "browser", "model-compatibility", "call-for-testers", "no-code", "5-minute-test")
} | Out-Null
Write-Host "[refreshed] #$RecruitmentIssue recruitment hub"

foreach ($issueNumber in $TesterIssues) {
  $issue = Invoke-GitHub -Method Get -Uri "https://api.github.com/repos/$Repo/issues/$issueNumber"
  $labels = @($issue.labels | ForEach-Object { $_.name })
  foreach ($needed in @("help wanted", "no-code", "10-minute-test")) {
    if ($labels -notcontains $needed) {
      $labels += $needed
    }
  }
  Invoke-GitHub -Method Patch -Uri "https://api.github.com/repos/$Repo/issues/$issueNumber" -Body @{
    labels = $labels
  } | Out-Null
  Write-Host "[labels] #$issueNumber"

  $comments = Invoke-GitHub -Method Get -Uri "https://api.github.com/repos/$Repo/issues/$issueNumber/comments?per_page=100"
  $alreadyPosted = $false
  foreach ($comment in $comments) {
    if ([string]$comment.body -like "*$taskCommentMarker*") {
      $alreadyPosted = $true
      break
    }
  }

  if ($alreadyPosted) {
    Write-Host "[skip comment] #$issueNumber"
    continue
  }

  Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/issues/$issueNumber/comments" -Body @{
    body = $taskComment
  } | Out-Null
  Write-Host "[commented] #$issueNumber"
}
