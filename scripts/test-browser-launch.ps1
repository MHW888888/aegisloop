param(
  [string]$ExtensionDir = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $ExtensionDir) {
  $ExtensionDir = Join-Path $root "chrome-extension"
}
$ExtensionDir = (Resolve-Path $ExtensionDir).Path

$browsers = @(
  @{ Name = "Chrome"; Path = "C:\Program Files\Google\Chrome\Application\chrome.exe" },
  @{ Name = "Chrome x86"; Path = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" },
  @{ Name = "Edge"; Path = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" },
  @{ Name = "Edge x86"; Path = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" }
)

$found = 0
$failed = 0

foreach ($browser in $browsers) {
  if (-not (Test-Path $browser.Path)) {
    continue
  }

  $found += 1
  $profile = Join-Path $env:TEMP ("aegisloop-browser-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $profile | Out-Null
  $out = Join-Path $profile "out.txt"
  $err = Join-Path $profile "err.txt"

  $args = @(
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--user-data-dir=$profile",
    "--disable-extensions-except=$ExtensionDir",
    "--load-extension=$ExtensionDir",
    "--dump-dom",
    "about:blank"
  )

  try {
    $process = Start-Process -FilePath $browser.Path -ArgumentList $args -NoNewWindow -PassThru -Wait -RedirectStandardOutput $out -RedirectStandardError $err
    if ($process.ExitCode -eq 0) {
      Write-Output "[ok] $($browser.Name) loaded extension"
    } else {
      $failed += 1
      Write-Output "[fail] $($browser.Name) exit=$($process.ExitCode)"
      if (Test-Path $err) {
        Get-Content $err -TotalCount 10 | ForEach-Object { Write-Output "  $_" }
      }
    }
  } finally {
    Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue
  }
}

if ($found -eq 0) {
  Write-Output "[warn] no supported Chromium browser found"
  exit 0
}

if ($failed -gt 0) {
  exit 1
}

Write-Output "browser launch smoke test passed"
