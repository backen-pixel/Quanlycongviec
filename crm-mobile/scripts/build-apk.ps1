# Build APK release (TuBep CRM mobile)
# Yêu cầu: JDK 17+, Android SDK (ANDROID_HOME)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $env:JAVA_HOME) {
  $jdk = 'C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot'
  if (Test-Path $jdk) { $env:JAVA_HOME = $jdk }
}
if (-not $env:ANDROID_HOME) {
  $sdk = "$env:LOCALAPPDATA\Android\Sdk"
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk }
}

if (-not (Test-Path '.env')) {
  if (Test-Path '.env.example') { Copy-Item '.env.example' '.env' }
}

if (-not (Test-Path 'android\gradlew.bat')) {
  Write-Host '>> expo prebuild (android)...'
  npx expo prebuild --platform android --no-install
}

Write-Host '>> gradlew assembleRelease...'
Set-Location android
.\gradlew.bat assembleRelease --no-daemon
Set-Location $root

$apk = Get-ChildItem 'android\app\build\outputs\apk\release\*.apk' | Select-Object -First 1
if (-not $apk) { throw 'Không tìm thấy APK sau build' }

$version = (Get-Content app.json -Raw | Select-String '"version":\s*"([^"]+)"').Matches.Groups[1].Value
if (-not $version) { $version = '1.0.0' }
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
$dest = Join-Path $root "dist\TuBepCRM-$version-release.apk"
Copy-Item $apk.FullName $dest -Force
Write-Host ''
Write-Host "OK: $dest"
Write-Host "Size: $([math]::Round($apk.Length / 1MB, 2)) MB"
