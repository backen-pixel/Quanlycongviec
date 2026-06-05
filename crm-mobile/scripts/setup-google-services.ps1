# Thiết lập google-services.json cho TuBep CRM mobile
# File KHÔNG thể tự sinh — phải tải từ Firebase Console (miễn phí).

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Package = 'vn.tubeppro.crmobile'
$DestRoot = Join-Path $Root 'google-services.json'
$DestAndroid = Join-Path $Root 'android\app\google-services.json'

function Test-GoogleServicesFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    try {
        $j = Get-Content $Path -Raw | ConvertFrom-Json
        $pkg = $j.client[0].client_info.android_client_info.package_name
        if ($pkg -ne $Package) {
            Write-Host "  Loi: package_name = '$pkg' (can '$Package')" -ForegroundColor Red
            return $false
        }
        return $true
    } catch {
        Write-Host "  Loi JSON: $_" -ForegroundColor Red
        return $false
    }
}

function Install-GoogleServices {
    param([string]$SourcePath)
    Copy-Item $SourcePath $DestRoot -Force
    New-Item -ItemType Directory -Force -Path (Split-Path $DestAndroid) | Out-Null
    Copy-Item $SourcePath $DestAndroid -Force
    Write-Host "OK Da copy google-services.json:" -ForegroundColor Green
    Write-Host "  $DestRoot"
    Write-Host "  $DestAndroid"
    $j = Get-Content $DestRoot -Raw | ConvertFrom-Json
    Write-Host ""
    Write-Host "Firebase project_id: $($j.project_info.project_id)" -ForegroundColor Cyan
    Write-Host "project_number:    $($j.project_info.project_number)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Buoc tiep theo:" -ForegroundColor Yellow
    Write-Host "  1. Backend .env: FCM_SA_JSON hoac FCM_PROJECT_ID + key (cung Firebase project)"
    Write-Host "  2. Build APK: cd android; .\gradlew.bat assembleRelease"
    Write-Host "  3. Dang nhap lai app de dang ky FCM token"
}

Write-Host ""
Write-Host "=== TuBep CRM — google-services.json ===" -ForegroundColor Cyan
Write-Host "Package Android: $Package"
Write-Host ""

# Da co file dung cho?
if (Test-GoogleServicesFile $DestRoot) {
    Install-GoogleServices $DestRoot
    exit 0
}
if (Test-GoogleServicesFile $DestAndroid) {
    Install-GoogleServices $DestAndroid
    exit 0
}

# Tim trong Downloads
$downloads = Join-Path $env:USERPROFILE 'Downloads'
$found = Get-ChildItem -Path $downloads -Filter 'google-services.json' -ErrorAction SilentlyContinue |
    Where-Object { Test-GoogleServicesFile $_.FullName } |
    Select-Object -First 1
if ($found) {
    Write-Host "Tim thay trong Downloads: $($found.FullName)" -ForegroundColor Green
    Install-GoogleServices $found.FullName
    exit 0
}

Write-Host "Chua co google-services.json hop le." -ForegroundColor Yellow
Write-Host ""
Write-Host "Huong dan tao file - chi lam 1 lan:" -ForegroundColor White
Write-Host "  1. Mo https://console.firebase.google.com/"
Write-Host "  2. Tao project moi (vd: tubep-crm) hoac chon project co san"
Write-Host "  3. Project Overview -> Add app -> Android"
Write-Host "     Package name: $Package"
Write-Host "     (Bo qua SHA-1 neu chi can push)"
Write-Host "  4. Tai file google-services.json"
Write-Host "  5. Chay lai lenh nay HOAC keo file vao:"
Write-Host "     $DestRoot"
Write-Host ""

$open = Read-Host "Mo Firebase Console trong trinh duyet? (y/n)"
if ($open -eq 'y' -or $open -eq 'Y') {
    Start-Process 'https://console.firebase.google.com/'
}

$path = Read-Host "Duong dan file google-services.json vua tai (Enter de bo qua)"
if ($path -and (Test-Path $path)) {
    if (Test-GoogleServicesFile $path) {
        Install-GoogleServices $path
    } else {
        Write-Host "File khong hop le." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Chua cai dat. Dat file vao $DestRoot roi chay: npm run setup:google-services" -ForegroundColor Yellow
    exit 1
}
