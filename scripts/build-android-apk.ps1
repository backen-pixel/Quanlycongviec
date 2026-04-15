# Build APK debug cho Voice Sync (cần JDK 17 + Android SDK; hoặc chỉ dùng Android Studio).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "mobile\voice-sync-android"
Set-Location $android

if (-not (Test-Path ".\gradlew.bat")) {
    Write-Host "Chua co Gradle Wrapper. Mo thu muc nay bang Android Studio de tao gradlew, hoac chay: gradle wrapper" -ForegroundColor Yellow
    Write-Host "  $android" -ForegroundColor Cyan
    exit 1
}

.\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$apk = Join-Path $android "app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    Write-Host "OK: $apk" -ForegroundColor Green
} else {
    Write-Host "Khong tim thay APK sau build." -ForegroundColor Red
    exit 1
}
