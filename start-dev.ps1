# start-dev.ps1 -- Run Quanlycongviec backend + frontend dev servers.
#
# Usage:
#   .\start-dev.ps1                # mo 2 cua so PowerShell moi (mac dinh)
#   .\start-dev.ps1 -InProcess     # chay trong cung cua so (jobs)
#   .\start-dev.ps1 -SkipFrontend  # chi backend
#   .\start-dev.ps1 -SkipBackend   # chi frontend
#   .\start-dev.ps1 -Install       # npm install truoc khi chay

[CmdletBinding()]
param(
  [switch]$InProcess,
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$Install
)

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
$Backend  = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

function Test-NodeAvailable {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js not installed. Need Node >= 18.' }
  $ver = (& node -v).TrimStart('v')
  $major = [int]($ver.Split('.')[0])
  if ($major -lt 18) { throw "Node v$ver too old, need >= 18." }
  Write-Host "[OK] Node v$ver" -ForegroundColor Green
}

function Test-PortFree($Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    Write-Host "[WARN] Port $Port in use (PID $($conn[0].OwningProcess)). Run .\stop-dev.ps1 first." -ForegroundColor Yellow
    return $false
  }
  return $true
}

function Install-Deps($Path, $Label) {
  $needs = -not (Test-Path (Join-Path $Path 'node_modules'))
  if ($needs -or $Install) {
    Write-Host "[$Label] npm install ..." -ForegroundColor Cyan
    Push-Location $Path
    try { npm install } finally { Pop-Location }
  }
}

function Start-NewWindow($Path, $Title, $Command) {
  $psi = @(
    '-NoExit', '-NoLogo',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle='$Title'; Set-Location '$Path'; $Command"
  )
  Start-Process -FilePath 'powershell.exe' -ArgumentList $psi -WorkingDirectory $Path | Out-Null
  Write-Host "[OK] Started: $Title" -ForegroundColor Green
}

Test-NodeAvailable

if (-not $SkipBackend)  { Install-Deps $Backend  'backend' }
if (-not $SkipFrontend) { Install-Deps $Frontend 'frontend' }

if ($InProcess) {
  Write-Host 'Mode: in-process (Ctrl+C to stop both)' -ForegroundColor Cyan
  $jobs = @()
  if (-not $SkipBackend) {
    if (-not (Test-PortFree 4000)) { exit 1 }
    $jobs += Start-Job -Name 'backend'  -ScriptBlock { Set-Location $using:Backend;  npm run dev }
  }
  if (-not $SkipFrontend) {
    if (-not (Test-PortFree 5173)) { exit 1 }
    $jobs += Start-Job -Name 'frontend' -ScriptBlock { Set-Location $using:Frontend; npm run dev }
  }
  try {
    while ($true) {
      $jobs | ForEach-Object { Receive-Job $_ -Keep | Write-Host }
      Start-Sleep -Seconds 2
    }
  } finally {
    $jobs | Stop-Job; $jobs | Remove-Job
  }
  exit 0
}

if (-not $SkipBackend) {
  if (-not (Test-PortFree 4000)) { exit 1 }
  Start-NewWindow $Backend  'Quanlycongviec - Backend (4000)'   'npm run dev'
}

if (-not $SkipFrontend) {
  if (-not (Test-PortFree 5173)) { exit 1 }
  Start-NewWindow $Frontend 'Quanlycongviec - Frontend (5173)'  'npm run dev'
}

Write-Host ''
Write-Host 'Started:' -ForegroundColor Green
if (-not $SkipBackend)  { Write-Host '  Backend  -> http://localhost:4000' }
if (-not $SkipFrontend) { Write-Host '  Frontend -> http://localhost:5173' }
Write-Host ''
Write-Host 'Stop: .\stop-dev.ps1' -ForegroundColor Gray
