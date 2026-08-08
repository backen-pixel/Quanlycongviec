# Build APK release (Xưởng SX mobile) — đồng bộ crm-mobile-v2 (arm64-only, sync version)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $env:JAVA_HOME) {
  $jdk = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
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

function Sync-NativeFromPlugins {
  $srcRoot = Join-Path $root 'plugins\native-android'
  $destJava = Join-Path $root 'android\app\src\main\java\vn\tubeppro\vcmobile'
  $resRoot = Join-Path $root 'android\app\src\main\res'
  @(
    'MainApplication.kt',
    'MainActivity.kt',
    'install/ApkInstallModule.kt',
    'install/ApkInstallPackage.kt',
    'overlay/OverlayBubbleService.kt',
    'overlay/OverlayChatPanel.kt',
    'overlay/OverlayChatTheme.kt',
    'overlay/BubbleChatApi.kt',
    'overlay/BubbleComposeBridge.kt',
    'overlay/BubbleComposeActivity.kt',
    'overlay/BubbleMediaBridge.kt',
    'overlay/BubbleMediaPickerActivity.kt',
    'overlay/FloatingBubbleBridge.kt',
    'overlay/FloatingBubbleModule.kt',
    'overlay/FloatingBubbleOverlayPackage.kt',
    'overlay/BubbleFcmWake.kt',
    'overlay/SxFirebaseMessagingService.kt'
  ) | ForEach-Object {
    $s = Join-Path $srcRoot $_
    $d = Join-Path $destJava $_
    if (-not (Test-Path $s)) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path $d) | Out-Null
    Copy-Item $s $d -Force
  }

  @(
    'res/values/ids.xml',
    'res/values/styles_bubble.xml',
    'res/xml/bubble_file_paths.xml'
  ) | ForEach-Object {
    $s = Join-Path $srcRoot $_
    $d = Join-Path $resRoot ($_ -replace '^res[\\/]', '')
    if (-not (Test-Path $s)) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path $d) | Out-Null
    Copy-Item $s $d -Force
  }

  $manifest = Join-Path $root 'android\app\src\main\AndroidManifest.xml'
  if (Test-Path $manifest) {
    $xml = Get-Content $manifest -Raw
    if ($xml -notmatch 'REQUEST_INSTALL_PACKAGES') {
      $perm = '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>'
      if ($xml -match '<uses-permission') {
        $xml = $xml -replace '(<uses-permission[^>]*/>\s*)', "`$1$perm`n"
      } else {
        $xml = $xml -replace '(<manifest[^>]*>)', "`$1`n$perm"
      }
      Set-Content -Path $manifest -Value $xml -NoNewline
      Write-Host '>> Added REQUEST_INSTALL_PACKAGES to AndroidManifest.xml'
    }
  }
  Write-Host '>> Synced native install module from plugins'
}

Sync-NativeFromPlugins

if (Test-Path (Join-Path $root 'google-services.json')) {
  $gsDest = Join-Path $root 'android\app\google-services.json'
  if (Test-Path (Split-Path $gsDest)) {
    Copy-Item (Join-Path $root 'google-services.json') $gsDest -Force
    Write-Host '>> Synced google-services.json to android/app'
  }
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
  Write-Host '>> ABI: arm64-v8a only (giam kich thuoc APK)'
}

Set-Arm64OnlyApk

function Set-WebrtcVersionPin {
  $bg = Join-Path $root 'android\build.gradle'
  if (-not (Test-Path $bg)) { return }
  $content = Get-Content $bg -Raw
  if ($content -match "force 'org\.jitsi:webrtc:124\.0\.0'") {
    Write-Host '>> WebRTC: 124.0.0 pinned (already set)'
    return
  }
  if ($content -match 'allprojects \{\s+repositories \{') {
    $content = $content -replace '(allprojects \{\s+repositories \{[^}]+\})', "`$1`r`n  configurations.all {`r`n    resolutionStrategy {`r`n      force 'org.jitsi:webrtc:124.0.0'`r`n    }`r`n  }"
    Set-Content -Path $bg -Value $content -NoNewline
    Write-Host '>> WebRTC: pinned org.jitsi:webrtc:124.0.0 (tranh SSL metadata fetch)'
  }
}

Set-WebrtcVersionPin

Write-Host '>> gradlew assembleRelease...'
Set-Location android
.\gradlew.bat assembleRelease --no-daemon
Set-Location $root

$apk = Get-ChildItem 'android\app\build\outputs\apk\release\*.apk' | Select-Object -First 1
if (-not $apk) { throw 'Khong tim thay APK sau build' }

$appJson = Get-Content app.json -Raw | ConvertFrom-Json
$version = $appJson.expo.version
if (-not $version) { $version = '1.0.0' }
$versionCode = $appJson.expo.android.versionCode
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
$dest = Join-Path $root "dist\vc-mobile-$version-code$versionCode-release.apk"
Copy-Item $apk.FullName $dest -Force
Write-Host ''
Write-Host "OK: $dest"
Write-Host "Size: $([math]::Round($apk.Length / 1MB, 2)) MB"
