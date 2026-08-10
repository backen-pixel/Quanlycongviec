# Tao project EAS va ghi projectId vao app.json (can `eas login` truoc).
# Chay: powershell -File ./scripts/init-eas-project.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$who = npx --yes eas-cli@latest whoami 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $who -match 'Not logged in|not authenticated') {
  Write-Host 'Chua dang nhap Expo. Chay: npx eas-cli login'
  Write-Host 'Roi chay lai script nay de gan extra.eas.projectId.'
  exit 1
}

npx --yes eas-cli@latest init --non-interactive --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$appPath = Join-Path (Get-Location) 'app.json'
$app = Get-Content $appPath -Raw -Encoding UTF8 | ConvertFrom-Json
$id = $app.expo.extra.eas.projectId
if (-not $id -or $id -eq 'REPLACE_WITH_EAS_PROJECT_ID') {
  Write-Host 'eas init xong nhung app.json chua co projectId hop le.'
  exit 1
}
Write-Host "EAS projectId: $id"
