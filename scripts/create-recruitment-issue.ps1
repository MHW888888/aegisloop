param(
  [string]$Repo = "MHW888888/aegisloop",
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
}

$title = "Call for testers: ChatGPT model switching and browser compatibility"

$body = @'
We are looking for volunteer testers to help verify AegisLoop across ChatGPT model modes, browsers, and operating systems.

AegisLoop is a local-first bridge where ChatGPT plans and local Codex executes. The current focus is stability: model switching should not break the ChatGPT conversation binding or the local Codex session binding.

## What to test

Pick one small path:

- Windows + Chrome
- Windows + Edge
- Windows + Brave
- macOS + Chrome
- macOS + Edge
- Chinese ChatGPT UI labels
- GPT-5.5 submenu entries such as GPT-5.4, GPT-5.3, and o3

## What to verify

- The AegisLoop panel appears on ChatGPT.
- Switching ChatGPT model mode does not change the conversation route.
- The same ChatGPT conversation remains connected to the same local Codex session.
- `browser_challenge`, `login_required`, or `model_option_not_found` failures are reported clearly.

## How to report

Please comment with:

```text
OS:
Browser:
ChatGPT UI language:
Model modes tested:
Result: pass / partial / blocked
Notes:
Sanitized screenshot or JSON summary:
```

## Safety

Please do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content.

If you want to help, comment which OS/browser/model path you can test. Thank you!
'@

if ($DryRun) {
  Write-Host "[dry-run] $title"
  Write-Host $body
  exit 0
}

if (-not $env:GITHUB_TOKEN) {
  throw "GITHUB_TOKEN is not set. Create a fine-grained token with Issues: Read and write, then set `$env:GITHUB_TOKEN in this PowerShell process."
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

try {
  $me = Invoke-GitHub -Method Get -Uri "https://api.github.com/user"
  Write-Host "[auth] @$($me.login)"
} catch {
  throw "GitHub authentication failed before making changes. Check that the token is valid and has repository Issues: Read and write permission."
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
foreach ($item in $existing) {
  if (-not $item.pull_request -and $item.title -eq $title) {
    Write-Host "[skip] #$($item.number) $title"
    exit 0
  }
}

$created = Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/issues" -Body @{
  title = $title
  body = $body
  labels = @("help wanted", "good first issue", "stability", "browser", "model-compatibility", "call-for-testers")
}

Write-Host "[created] #$($created.number) $($created.title)"
Write-Host $created.html_url
