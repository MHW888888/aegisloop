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
  "no-code" = "d4c5f9"
  "5-minute-test" = "c2e0c6"
  "10-minute-test" = "bfd4f2"
}

$title = "Call for testers: GPT-5.6 and Codex coexistence checks"
$legacyTitle = "Call for testers: ChatGPT model switching and browser compatibility"

$body = @'
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
- GPT-5.6 Sol / Terra / Luna model menu behavior
- Legacy GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 regression behavior

## What to check

1. The AegisLoop panel appears on ChatGPT.
2. The local bridge shows online.
3. The panel shows `Execution route: AegisLoop local bridge`.
4. Switching ChatGPT model mode does not change the ChatGPT conversation route.
5. The model does not accidentally start ChatGPT's built-in Codex for an AegisLoop turn.
6. The same ChatGPT conversation stays connected to the same local Codex session.
7. If something blocks the test, the panel or script reports a clear reason such as `login_required`, `browser_challenge`, `model_option_not_found`, `leader_conflict`, or `bridge_timeout`.

## Report template

Please comment with:

```text
OS:
Browser:
ChatGPT UI language:
AegisLoop version:
Model modes tested:
Execution route shown:
Built-in Codex started unexpectedly: yes / no
Result: pass / partial / blocked
What happened:
Sanitized Debug Snapshot or screenshot:
```

## Safety

Please do not include real conversation IDs, tokens, local private paths, private workspace names, or private project content. If you include a screenshot, crop or blur anything private.

If you want to help, comment with the one path you can test. Thank you!
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
  if (-not $item.pull_request -and ($item.title -eq $title -or $item.title -eq $legacyTitle)) {
    Write-Host "[skip] #$($item.number) $title"
    exit 0
  }
}

$created = Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/issues" -Body @{
  title = $title
  body = $body
  labels = @("help wanted", "good first issue", "stability", "browser", "model-compatibility", "call-for-testers", "no-code", "5-minute-test")
}

Write-Host "[created] #$($created.number) $($created.title)"
Write-Host $created.html_url
