param(
  [string]$Repo = "MHW888888/aegisloop",
  [int[]]$Issues = @(22, 23, 24, 25, 26, 27),
  [switch]$Apply,
  [switch]$DeleteSpam,
  [switch]$DeleteNoise,
  [switch]$ReplyAccepted
)

$ErrorActionPreference = "Stop"

function Get-GitHubHeaders {
  $headers = @{
    "User-Agent" = "aegisloop-maintainer"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
  }

  if ($env:GITHUB_TOKEN) {
    $headers.Authorization = "Bearer $env:GITHUB_TOKEN"
  }

  return $headers
}

function Invoke-GitHub {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body = $null
  )

  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    ErrorAction = "Stop"
  }

  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
    $params.ContentType = "application/json"
  }

  try {
    Invoke-RestMethod @params
  } catch {
    $details = $_.ErrorDetails.Message
    if ($details -match "API rate limit exceeded") {
      throw "GitHub API rate limit exceeded. Set GITHUB_TOKEN before running this command, even for dry-run reads."
    }
    if ($_.Exception.Message -match "\(401\)" -or $details -match '"Bad credentials"') {
      throw "GitHub authentication failed. Check GITHUB_TOKEN, then rerun."
    }
    throw
  }
}

function Get-CommentClass {
  param([string]$Body)

  $spamPatterns = @(
    "AgentWork",
    "metodo de pago",
    "Stripe",
    "Solana",
    "Ethereum",
    "Bitcoin",
    "wallet",
    "API keys"
  )

  foreach ($pattern in $spamPatterns) {
    if ($Body -match [regex]::Escape($pattern)) {
      return "spam"
    }
  }

  $noisePatterns = @(
    "Analisis basico",
    "Analisis",
    "Estructurar",
    "comentarios explicativos",
    "analisis manual",
    "stacktrace",
    "Propuesta de trabajo"
  )

  foreach ($pattern in $noisePatterns) {
    if ($Body -match [regex]::Escape($pattern)) {
      return "noise"
    }
  }

  return "normal"
}

function Remove-Comment {
  param(
    [hashtable]$Headers,
    [int64]$CommentId
  )

  Invoke-GitHub `
    -Method Delete `
    -Uri "https://api.github.com/repos/$Repo/issues/comments/$CommentId" `
    -Headers $Headers | Out-Null
}

function Add-Comment {
  param(
    [hashtable]$Headers,
    [int]$Issue,
    [string]$Body
  )

  Invoke-GitHub `
    -Method Post `
    -Uri "https://api.github.com/repos/$Repo/issues/$Issue/comments" `
    -Headers $Headers `
    -Body @{ body = $Body } | Out-Null
}

$headers = Get-GitHubHeaders
if ($Apply) {
  if (-not $env:GITHUB_TOKEN) {
    throw "GITHUB_TOKEN is required when using -Apply."
  }
  $me = Invoke-GitHub -Method Get -Uri "https://api.github.com/user" -Headers $headers
  Write-Host "[auth] @$($me.login)"
} else {
  Write-Host "[dry-run] pass -Apply to write changes"
  if ($env:GITHUB_TOKEN) {
    $me = Invoke-GitHub -Method Get -Uri "https://api.github.com/user" -Headers $headers
    Write-Host "[auth-read] @$($me.login)"
  } else {
    Write-Host "[anon-read] set GITHUB_TOKEN to avoid low unauthenticated API rate limits"
  }
}

$acceptedReplies = @{
  23 = @{
    user = "MohamedFazil1406"
    marker = "yes sir"
    body = @"
Great, thank you @MohamedFazil1406!

Please keep this as a small smoke report: Edge version, OS, extension load result, ChatGPT panel visible, bridge URL behavior, and any screenshots with private values redacted.
"@
  }
}

foreach ($issueNumber in $Issues) {
  $issue = Invoke-GitHub `
    -Method Get `
    -Uri "https://api.github.com/repos/$Repo/issues/$issueNumber" `
    -Headers $headers

  Write-Host ""
  Write-Host "[issue] #$issueNumber $($issue.title)"

  $comments = Invoke-GitHub `
    -Method Get `
    -Uri "https://api.github.com/repos/$Repo/issues/$issueNumber/comments?per_page=100" `
    -Headers $headers

  $alreadyReplied = $false
  foreach ($comment in $comments) {
    if ($comment.user.login -eq "MHW888888" -and $comment.body -match "Please keep this as a small smoke report") {
      $alreadyReplied = $true
    }
  }

  foreach ($comment in $comments) {
    $class = Get-CommentClass -Body $comment.body
    $short = (($comment.body -replace "`r|`n", " ") -replace "\s+", " ")
    if ($short.Length -gt 140) {
      $short = $short.Substring(0, 140) + "..."
    }

    Write-Host ("[{0}] comment {1} @{2}: {3}" -f $class, $comment.id, $comment.user.login, $short)

    if ($Apply -and $DeleteSpam -and $class -eq "spam") {
      Remove-Comment -Headers $headers -CommentId $comment.id
      Write-Host "[deleted spam] comment $($comment.id)"
      continue
    }

    if ($Apply -and $DeleteNoise -and $class -eq "noise") {
      Remove-Comment -Headers $headers -CommentId $comment.id
      Write-Host "[deleted noise] comment $($comment.id)"
      continue
    }
  }

  if ($ReplyAccepted -and $acceptedReplies.ContainsKey($issueNumber)) {
    $rule = $acceptedReplies[$issueNumber]
    $hasAcceptance = $false
    foreach ($comment in $comments) {
      if ($comment.user.login -eq $rule.user -and $comment.body.ToLowerInvariant().Contains($rule.marker)) {
        $hasAcceptance = $true
      }
    }

    if ($hasAcceptance -and -not $alreadyReplied) {
      if ($Apply) {
        Add-Comment -Headers $headers -Issue $issueNumber -Body $rule.body
        Write-Host "[replied accepted] #$issueNumber @$($rule.user)"
      } else {
        Write-Host "[would reply accepted] #$issueNumber @$($rule.user)"
      }
    }
  }
}
