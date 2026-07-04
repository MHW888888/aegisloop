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
  "model-compatibility" = "c5def5"
  "windows" = "fef2c0"
  "macos" = "bfdadc"
}

$issues = @(
  @{
    title = "Run real ChatGPT model smoke on Windows Chrome"
    labels = @("documentation", "help wanted", "good first issue", "stability", "browser", "model-compatibility", "windows")
    body = @"
Run the maintainer UI smoke script against a real logged-in ChatGPT conversation on Windows Chrome.

Suggested scope:
- start a dedicated Chrome profile with --remote-debugging-port=9222
- load the unpacked AegisLoop extension
- open one ChatGPT conversation with the AegisLoop panel visible
- run npm run test:chatgpt-model-ui
- attach the sanitized model-smoke-result.json summary or a short report

Please verify:
- the conversation URL stays on the same /c/<id>
- the local Codex session label does not change after model switching
- browser_challenge and login_required are reported clearly if encountered

Do not include real conversation ids, tokens, local private paths, or private workspace content.
"@
  },
  @{
    title = "Run GPT-5.5 / GPT-5.4 / GPT-5.3 / o3 submenu smoke"
    labels = @("documentation", "help wanted", "stability", "browser", "model-compatibility")
    body = @"
Run a focused smoke test for the nested model menu entries.

Suggested scope:
- open the ChatGPT model menu
- expand the GPT-5.5 submenu if present
- verify GPT-5.5, GPT-5.4, GPT-5.3, and o3 can be selected or clearly reported as unavailable
- confirm AegisLoop keeps the same conversation and local Codex session binding

Use the new npm run test:chatgpt-model-ui helper if possible.

Do not include real conversation ids, tokens, local private paths, or private workspace content.
"@
  },
  @{
    title = "Run Chinese model label smoke"
    labels = @("documentation", "help wanted", "good first issue", "stability", "browser", "model-compatibility")
    body = @"
Run a smoke test with the ChatGPT UI using Chinese labels.

Suggested scope:
- verify Smart / Fast / Balanced / Advanced / Ultra / Professional labels map to the visible labels
- include the visible Chinese menu labels in the report if safe
- confirm changing model does not change the AegisLoop conversation binding

Useful labels to check:
- Smart
- Fast
- Balanced
- Advanced
- Ultra
- Professional

Do not include real conversation ids, tokens, local private paths, or private workspace content.
"@
  },
  @{
    title = "Run macOS Chrome model-switch smoke"
    labels = @("documentation", "help wanted", "stability", "browser", "model-compatibility", "macos")
    body = @"
Run the model-switch smoke flow on macOS Chrome and document any setup differences.

Suggested scope:
- start Chrome with a DevTools port on macOS
- load the unpacked AegisLoop extension
- log in to ChatGPT in the dedicated profile
- run the equivalent npm run test:chatgpt-model-ui flow if available
- document any macOS command differences or blockers

Do not include real conversation ids, tokens, local private paths, or private workspace content.
"@
  },
  @{
    title = "Run Edge or Brave model-switch route stability smoke"
    labels = @("documentation", "help wanted", "stability", "browser", "model-compatibility")
    body = @"
Run a manual route-stability smoke test in Edge or Brave.

Suggested scope:
- load the unpacked extension
- bind one ChatGPT conversation to one local Codex session
- switch between at least two model modes
- confirm the same ChatGPT conversation remains bound to the same local Codex session
- note browser-specific local bridge or privacy settings

Do not include real conversation ids, tokens, local private paths, or private workspace content.
"@
  },
  @{
    title = "Add model smoke failure examples"
    labels = @("documentation", "help wanted", "good first issue", "stability", "model-compatibility")
    body = @"
Add short documentation for common model smoke failures.

Suggested scope:
- browser_challenge
- login_required
- model_menu_not_found
- model_option_not_found
- nested_model_option_not_found

For each case, explain what it means and what the user should try next.

Do not include real conversation ids, tokens, local private paths, or private workspace content.
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
      Write-Host "[assigned] #$($created.number) -> @$assignee"
    } catch {
      Write-Host "[assign skipped] #$($created.number) -> @$assignee"
      Invoke-GitHub -Method Post -Uri "https://api.github.com/repos/$Repo/issues/$($created.number)/comments" -Body @{
        body = "Hi @$assignee, this may be a good fit if you have time to help test model-switch compatibility."
      } | Out-Null
      Write-Host "[commented] #$($created.number) -> @$assignee"
    }
  }

  $createdCount++
}
