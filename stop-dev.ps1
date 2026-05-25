# stop-dev.ps1 -- Kill backend + frontend dev processes.
#
# Usage:
#   .\stop-dev.ps1

[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = 'SilentlyContinue'
$ports = @(4000, 3000, 5173, 8080)
$killed = @()

foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      $killed += "Port $port -> PID $procId ($($proc.ProcessName))"
    }
  }
}

# Bat them node --watch / vite child processes
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
  if ($cmd -and ($cmd -match 'Quanlycongviec' -or $cmd -match 'src\\server\.js' -or $cmd -match 'vite')) {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $killed += "Node PID $($_.Id) (matched Quanlycongviec/vite)"
  }
}

if (-not $Quiet) {
  if ($killed.Count -eq 0) {
    Write-Host '[INFO] No dev process running.' -ForegroundColor Yellow
  } else {
    Write-Host '[OK] Stopped:' -ForegroundColor Green
    $killed | ForEach-Object { Write-Host "  $_" }
  }
}
