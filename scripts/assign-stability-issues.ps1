param(
  [string]$Repo = "MHW888888/aegisloop",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$tasks = @(
  @{
    issue = 22
    user = "Kanneboinashivakumar"
    body = "Hi @Kanneboinashivakumar, this follows naturally from your screenshot/demo work. Would you like to take this one?"
  },
  @{
    issue = 23
    user = "MohamedFazil1406"
    body = "Hi @MohamedFazil1406, this is a beginner-friendly Edge smoke report task. Would you like to work on it?"
  },
  @{
    issue = 27
    user = "tassu1"
    body = "Hi @tassu1, since this is related to reliability and recovery docs, this may pair well with the config validation work. Would you like to take it?"
  }
)

if ($DryRun) {
  foreach ($task in $tasks) {
    Write-Host "[dry-run] #$($task.issue) -> @$($task.user)"
  }
  exit 0
}

if (-not $env:GITHUB_TOKEN) {
  throw "GITHUB_TOKEN is not set in this PowerShell process."
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

foreach ($task in $tasks) {
  try {
    Invoke-GitHub `
      -Method Post `
      -Uri "https://api.github.com/repos/$Repo/issues/$($task.issue)/assignees" `
      -Body @{ assignees = @($task.user) } | Out-Null
    Write-Host "[assigned] #$($task.issue) -> @$($task.user)"
  } catch {
    Write-Host "[assign skipped] #$($task.issue) -> @$($task.user)"
  }

  Invoke-GitHub `
    -Method Post `
    -Uri "https://api.github.com/repos/$Repo/issues/$($task.issue)/comments" `
    -Body @{ body = $task.body } | Out-Null

  Write-Host "[commented] #$($task.issue)"
}
