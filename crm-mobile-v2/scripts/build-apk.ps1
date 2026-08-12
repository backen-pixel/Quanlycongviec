# Build APK release (CRM Mobile v2)
#
# Mặc định dùng Gradle Daemon (nhanh hơn nhiều khi build lặp).
# Thêm -Fast để bỏ lintVital (chỉ nên dùng khi test nội bộ, không publish).
# Thêm -NoDaemon nếu CI cần tắt daemon.
param(
  [switch]$Fast,
  [switch]$NoDaemon
)

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

function Set-ArmAbisForRelease {
  $gp = Join-Path $root 'android\gradle.properties'
  if (-not (Test-Path $gp)) { return }
  $content = Get-Content $gp -Raw
  $wanted = 'reactNativeArchitectures=armeabi-v7a,arm64-v8a'
  if ($content -match [regex]::Escape($wanted)) {
    Write-Host '>> ABI: armeabi-v7a + arm64-v8a (already set)'
    return
  }
  $content = $content -replace 'reactNativeArchitectures=.*', $wanted
  Set-Content -Path $gp -Value $content -NoNewline
  Write-Host '>> ABI: armeabi-v7a + arm64-v8a (tương thích Samsung A13 / máy 32-bit)'
}

Set-ArmAbisForRelease

# Nạp .env (EXPO_PUBLIC_*) — APK release nhúng URL lúc bundle JS.
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    Set-Item -Path "Env:$k" -Value $v
    if ($k -eq 'EXPO_PUBLIC_API_URL') { Write-Host ">> API: $v" }
  }
}

$gradleArgs = @('assembleRelease', '--parallel')
if ($NoDaemon) {
  $gradleArgs += '--no-daemon'
  Write-Host '>> Gradle: --no-daemon (chậm hơn — mỗi lần cold-start JVM)'
} else {
  Write-Host '>> Gradle: dùng Daemon (giữ JVM giữa các lần build)'
}
if ($Fast) {
  # Bỏ Android lint release — thường tốn 20–40s, không cần khi chỉ test UI/JS.
  $gradleArgs += @('-x', 'lintVitalAnalyzeRelease', '-x', 'lintVitalReportRelease', '-x', 'lintVitalRelease')
  Write-Host '>> Fast: bỏ lintVitalRelease'
}

Write-Host ('>> gradlew ' + ($gradleArgs -join ' '))
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Set-Location android
& .\gradlew.bat @gradleArgs
if ($LASTEXITCODE -ne 0) { throw "gradlew failed with exit code $LASTEXITCODE" }
Set-Location $root
$sw.Stop()
Write-Host (">> Gradle xong trong {0:n1}s" -f $sw.Elapsed.TotalSeconds)

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
