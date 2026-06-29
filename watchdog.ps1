param(
  [int]$Port = 17380,
  [int]$IntervalSec = 20,
  [string]$FeishuWebhook = ""
)

$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$LaunchPs1 = Join-Path $ScriptDir "launch.ps1"
$HealthUrl = "http://127.0.0.1:$Port/health"
$failCount = 0

function Notify($text) {
  if ([string]::IsNullOrWhiteSpace($FeishuWebhook)) { return }
  try {
    $body = @{
      msg_type = "text"
      content = @{ text = "[AegisLoop watchdog] $text" }
    } | ConvertTo-Json -Compress

    Invoke-RestMethod `
      -Uri $FeishuWebhook `
      -Method Post `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 8 | Out-Null
  } catch {}
}

function Test-Bridge {
  try {
    $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
    return ($r.ok -eq $true)
  } catch {
    return $false
  }
}

Write-Host "[watchdog] watching $HealthUrl every ${IntervalSec}s"
Notify "started; watching bridge on port $Port"

while ($true) {
  if (Test-Bridge) {
    if ($failCount -gt 0) {
      Write-Host "[watchdog] bridge recovered"
      Notify "bridge recovered"
    }
    $failCount = 0
  } else {
    $failCount++
    Write-Host "[watchdog] health check failed ($failCount)"

    if ($failCount -ge 2) {
      Write-Host "[watchdog] restarting bridge via launch.ps1"
      Notify "bridge health failed; restarting"

      try {
        Start-Process `
          -WindowStyle Hidden `
          -FilePath "powershell.exe" `
          -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$LaunchPs1`""
      } catch {
        Write-Host "[watchdog] launch error: $_"
      }

      Start-Sleep -Seconds 5
      if (Test-Bridge) {
        Notify "bridge restart succeeded"
        $failCount = 0
      } else {
        Notify "bridge is still offline after restart; check node and port $Port"
      }
    }
  }

  Start-Sleep -Seconds $IntervalSec
}
