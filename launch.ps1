$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Server = Join-Path $Root "server.js"
$Node = "C:\Program Files\nodejs\node.exe"

if (-not (Test-Path -LiteralPath $Node)) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Node.js was not found." }
  $Node = $cmd.Source
}

Start-Process -WindowStyle Hidden -FilePath $Node -ArgumentList "`"$Server`"" -WorkingDirectory $Root
Write-Host "[launch] requested bridge start: $Server"
