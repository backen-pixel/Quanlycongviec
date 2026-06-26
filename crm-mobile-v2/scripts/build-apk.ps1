# Build APK release (CRM Mobile v2)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $env:JAVA_HOME) {
  $candidates = @(
    'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot',
    'C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot'
  )
  foreach ($jdk in $candidates) {
    if (Test-Path $jdk) { $env:JAVA_HOME = $jdk; break }
  }
}
if (-not $env:ANDROID_HOME) {
  $sdk = "$env:LOCALAPPDATA\Android\Sdk"
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk }
}

if (-not (Test-Path 'android\gradlew.bat')) {
  Write-Host '>> expo prebuild (android)...'
  npx expo prebuild --platform android --no-install
}

function Sync-AndroidVersionFromAppJson {
  $appJson = Get-Content app.json -Raw | ConvertFrom-Json
  $version = $appJson.expo.version
  if (-not $version) { $version = '1.0.0' }
  $versionCode = $appJson.expo.android.versionCode
  $gradle = Join-Path $root 'android\app\build.gradle'
  if (-not (Test-Path $gradle)) { return }
  $content = Get-Content $gradle -Raw
  $content = $content -replace 'versionCode\s+\d+', "versionCode $versionCode"
  $content = $content -replace 'versionName\s+"[^"]*"', "versionName `"$version`""
  Set-Content -Path $gradle -Value $content -NoNewline
  Write-Host ">> Synced native version from app.json: $version (code $versionCode)"
}

Sync-AndroidVersionFromAppJson

function Set-Arm64OnlyApk {
  $gp = Join-Path $root 'android\gradle.properties'
  if (-not (Test-Path $gp)) { return }
  $content = Get-Content $gp -Raw
  if ($content -match 'reactNativeArchitectures=arm64-v8a(\r?\n|$)') {
    Write-Host '>> ABI: arm64-v8a only (already set)'
    return
  }
  $content = $content -replace 'reactNativeArchitectures=.*', 'reactNativeArchitectures=arm64-v8a'
  Set-Content -Path $gp -Value $content -NoNewline
  Write-Host '>> ABI: arm64-v8a only (giảm kích thước APK cho upload server)'
}

Set-Arm64OnlyApk

Write-Host '>> gradlew assembleRelease...'
Set-Location android
.\gradlew.bat assembleRelease --no-daemon
Set-Location $root

$apk = Get-ChildItem 'android\app\build\outputs\apk\release\*.apk' | Select-Object -First 1
if (-not $apk) { throw 'Không tìm thấy APK sau build' }

$appJson = Get-Content app.json -Raw | ConvertFrom-Json
$version = $appJson.expo.version
if (-not $version) { $version = '1.0.0' }
$versionCode = $appJson.expo.android.versionCode
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
$dest = Join-Path $root "dist\crm-mobile-v2-$version-code$versionCode-release.apk"
Copy-Item $apk.FullName $dest -Force
Write-Host ''
Write-Host "OK: $dest"
Write-Host "Size: $([math]::Round($apk.Length / 1MB, 2)) MB"
