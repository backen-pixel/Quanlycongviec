# Connect LDPlayer -> local backend :4000 via adb reverse
$ErrorActionPreference = 'Stop'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "adb not found: $adb" }

Write-Host '>> adb connect 127.0.0.1:5555'
& $adb connect 127.0.0.1:5555 | Out-Host
& $adb devices

$target = $null
$devicesOut = & $adb devices
foreach ($line in $devicesOut) {
  if ($line -match '^(127\.0\.0\.1:5555)\s+device') { $target = $Matches[1]; break }
}
if (-not $target) {
  foreach ($line in $devicesOut) {
    if ($line -match '^(emulator-\d+)\s+device') { $target = $Matches[1]; break }
  }
}
if (-not $target) { throw 'No online device. Open LDPlayer and retry.' }

Write-Host ">> reverse tcp:4000 on $target"
& $adb -s $target reverse --remove-all 2>$null
& $adb -s $target reverse tcp:4000 tcp:4000
& $adb -s $target reverse --list

Write-Host ''
Write-Host 'OK: app can use http://127.0.0.1:4000/api'
# curl may be missing on some images - ignore errors
& $adb -s $target shell "curl -s --max-time 5 http://127.0.0.1:4000/api/health" 2>$null
Write-Host ''
