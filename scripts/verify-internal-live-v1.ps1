[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$HealthUrl = '',
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$script:PassCount = 0
$script:WarnCount = 0
$script:FailCount = 0

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}

function Write-Check {
  param(
    [ValidateSet('PASS', 'WARN', 'FAIL')][string]$Level,
    [string]$Name,
    [string]$Detail
  )
  if ($Level -eq 'PASS') { $script:PassCount++ }
  if ($Level -eq 'WARN') { $script:WarnCount++ }
  if ($Level -eq 'FAIL') { $script:FailCount++ }
  Write-Host ('[{0}] {1}: {2}' -f $Level, $Name, $Detail)
}

function Require-File {
  param([string]$RelativePath)
  $full = Join-Path $RepoRoot $RelativePath
  if (Test-Path -LiteralPath $full -PathType Leaf) {
    Write-Check PASS ('file ' + $RelativePath) 'present'
    return $full
  }
  Write-Check FAIL ('file ' + $RelativePath) 'missing'
  return $null
}

try {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
} catch {
  Write-Check FAIL 'repository' ('path does not exist: ' + $RepoRoot)
  exit 1
}

Write-Host 'BUSINESS AI OS — Internal Live Operation V1 verification'
Write-Host ('Repository: ' + $RepoRoot)
Write-Host 'Read-only mode: no .env, credential, database, backup, or mutation command is read or executed.'

$requiredFiles = @(
  'render.yaml',
  'render-frontend.yaml',
  'backend/package.json',
  'backend/package-lock.json',
  'frontend/package.json',
  'frontend/package-lock.json',
  'backend/src/server.js',
  'backend/scripts/sync-supabase-backup.js',
  'docs/internal-live-v1/INTERNAL_RELEASE_AND_OPERATIONS_RUNBOOK.md',
  'docs/internal-live-v1/MODULE_ACTIVATION_STATUS.schema.json',
  'docs/internal-live-v1/MODULE_ACTIVATION_REPORT.json'
)

$paths = @{}
foreach ($relative in $requiredFiles) {
  $paths[$relative] = Require-File $relative
}

if (Get-Command git -ErrorAction SilentlyContinue) {
  $safeRoot = $RepoRoot.Replace('\', '/')
  $head = (& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot rev-parse HEAD 2>$null)
  $tree = (& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot rev-parse 'HEAD^{tree}' 2>$null)
  $branch = (& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot branch --show-current 2>$null)
  $status = @(& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot status --porcelain 2>$null)
  if ($head -match '^[0-9a-f]{40}$' -and $tree -match '^[0-9a-f]{40}$') {
    $branchLabel = if ($branch) { $branch } else { 'DETACHED' }
    Write-Check PASS 'git identity' ('branch=' + $branchLabel + ', commit=' + $head + ', tree=' + $tree)
  } else {
    Write-Check FAIL 'git identity' 'unable to resolve commit and tree'
  }
  if ($status.Count -eq 0) {
    Write-Check PASS 'working tree' 'clean'
  } else {
    $level = if ($Strict) { 'FAIL' } else { 'WARN' }
    Write-Check $level 'working tree' ($status.Count.ToString() + ' changed entries; freeze requires a clean checkout')
  }
} else {
  Write-Check FAIL 'git identity' 'git is unavailable'
}

if ($paths['backend/package.json']) {
  try {
    $package = Get-Content -Raw -LiteralPath $paths['backend/package.json'] | ConvertFrom-Json
    foreach ($name in @('start', 'test:tenant', 'db:verify-backup')) {
      if ([string]::IsNullOrWhiteSpace([string]$package.scripts.$name)) {
        Write-Check FAIL ('package script ' + $name) 'missing'
      } else {
        Write-Check PASS ('package script ' + $name) 'declared'
      }
    }
    if ([string]::IsNullOrWhiteSpace([string]$package.scripts.'test:business-os')) {
      Write-Check WARN 'package script test:business-os' 'not declared; record the reviewed cockpit/Business OS test command in the frozen record'
    } else {
      Write-Check PASS 'package script test:business-os' 'declared'
    }
    $verifyCommand = [string]$package.scripts.'db:verify-backup'
    if ($verifyCommand -match '--verify' -and $verifyCommand -notmatch 'db:sync|pg_restore') {
      Write-Check PASS 'backup package command' 'explicit verify mode'
    } else {
      Write-Check FAIL 'backup package command' 'not demonstrably verify-only'
    }
  } catch {
    Write-Check FAIL 'backend/package.json' ('invalid JSON: ' + $_.Exception.Message)
  }
}

if ($paths['frontend/package.json']) {
  try {
    $frontendPackage = Get-Content -Raw -LiteralPath $paths['frontend/package.json'] | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$frontendPackage.scripts.'test:business-os')) {
      Write-Check FAIL 'frontend package script test:business-os' 'missing'
    } else {
      Write-Check PASS 'frontend package script test:business-os' 'declared'
    }
  } catch {
    Write-Check FAIL 'frontend/package.json' ('invalid JSON: ' + $_.Exception.Message)
  }
}

if ($paths['render.yaml']) {
  $render = Get-Content -Raw -LiteralPath $paths['render.yaml']
  if ($render -match '(?m)^\s*healthCheckPath:\s*/api/health\s*$') {
    Write-Check PASS 'Render health check' '/api/health configured'
  } else {
    Write-Check FAIL 'Render health check' 'healthCheckPath missing'
  }
  if ($render -match '(?m)^\s*-\s+key:\s+SUPABASE_SERVICE_ROLE_KEY\s*$' -and
      $render -match '(?m)^\s*sync:\s*false\s*$') {
    Write-Check PASS 'Render secret declaration' 'managed sync:false declaration found'
  } else {
    Write-Check FAIL 'Render secret declaration' 'expected managed secret declaration missing'
  }
}

if ($paths['backend/src/server.js']) {
  $server = Get-Content -Raw -LiteralPath $paths['backend/src/server.js']
  if ($server -match "app\.get\('/api/health'") {
    Write-Check PASS 'health route' 'GET /api/health present'
  } else {
    Write-Check FAIL 'health route' 'GET /api/health missing'
  }
  if ($server -match "app\.get\('/api/metrics'") {
    Write-Check PASS 'metrics route' 'GET /api/metrics present'
  } else {
    Write-Check FAIL 'metrics route' 'GET /api/metrics missing'
  }
}

if ($paths['backend/scripts/sync-supabase-backup.js']) {
  $backup = Get-Content -Raw -LiteralPath $paths['backend/scripts/sync-supabase-backup.js']
  if ($backup -match "process\.argv\.includes\('--verify'\)" -and
      $backup -match 'SELECT COUNT\(\*\)' -and
      $backup -match 'await verify\(\);\s*return;') {
    Write-Check PASS 'backup verifier implementation' 'count-only verify branch returns before sync'
  } else {
    Write-Check FAIL 'backup verifier implementation' 'verify-only branch could not be proven statically'
  }
}

$allowedStatuses = @(
  'LIVE',
  'LIVE WITH DATA GAPS',
  'UNDER RECONCILIATION',
  'NOT CONNECTED',
  'BLOCKED',
  'FOUNDER DECISION REQUIRED'
)
$requiredModules = @(
  'founder_cockpit',
  'founder_configuration',
  'ecosystem_company_scope',
  'crm',
  'sales',
  'lead_deal',
  'commercial_documents',
  'project',
  'work_unified',
  'procurement_purchasing',
  'production',
  'manufacturing_capacity_view_a',
  'manufacturing_capacity_view_b',
  'logistics_delivery_installation',
  'accounting',
  'warranty_care',
  'people_kpi',
  'permission',
  'approval',
  'reporting',
  'planning_forecasting_capacity'
)

if ($paths['docs/internal-live-v1/MODULE_ACTIVATION_STATUS.schema.json']) {
  try {
    $null = Get-Content -Raw -LiteralPath $paths['docs/internal-live-v1/MODULE_ACTIVATION_STATUS.schema.json'] | ConvertFrom-Json
    Write-Check PASS 'activation schema' 'valid JSON'
  } catch {
    Write-Check FAIL 'activation schema' ('invalid JSON: ' + $_.Exception.Message)
  }
}

if ($paths['docs/internal-live-v1/MODULE_ACTIVATION_REPORT.json']) {
  try {
    $report = Get-Content -Raw -LiteralPath $paths['docs/internal-live-v1/MODULE_ACTIVATION_REPORT.json'] | ConvertFrom-Json
    Write-Check PASS 'activation report' 'valid JSON'
    if ($report.environment -eq 'INTERNAL_MANAGED') {
      Write-Check PASS 'environment boundary' 'INTERNAL_MANAGED'
    } else {
      Write-Check FAIL 'environment boundary' 'must be INTERNAL_MANAGED'
    }

    $seen = @{}
    foreach ($module in @($report.modules)) {
      $key = [string]$module.module_key
      if ($seen.ContainsKey($key)) {
        Write-Check FAIL ('module ' + $key) 'duplicate key'
      }
      $seen[$key] = $true
      if ($allowedStatuses -notcontains [string]$module.status) {
        Write-Check FAIL ('module ' + $key) ('invalid status ' + $module.status)
      }
      if ($module.status -eq 'LIVE') {
        $ready = $module.data_updated_at -and
          $module.gates.scope -eq $true -and
          $module.gates.permission -eq $true -and
          $module.gates.audit -eq $true -and
          $module.gates.reconciliation -eq $true -and
          $module.gates.drill_down -eq $true
        if ($ready) {
          Write-Check PASS ('module ' + $key) 'LIVE gates populated'
        } else {
          Write-Check FAIL ('module ' + $key) 'LIVE without all required gates'
        }
      }
      if ($module.controlled_actions.enabled -eq $true -and
          @($module.controlled_actions.application_services).Count -eq 0) {
        Write-Check FAIL ('module ' + $key) 'action enabled without named Application Service'
      }
    }

    foreach ($key in $requiredModules) {
      if (-not $seen.ContainsKey($key)) {
        Write-Check FAIL ('module coverage ' + $key) 'missing'
      }
    }
    if ($seen.Count -eq $requiredModules.Count) {
      Write-Check PASS 'module coverage' ($requiredModules.Count.ToString() + ' required modules present')
    }

    $frozen = $report.frozen_version.commit -match '^[0-9a-f]{40}$' -and
      $report.frozen_version.tree -match '^[0-9a-f]{40}$' -and
      $report.frozen_version.clean -eq $true
    if ($frozen) {
      Write-Check PASS 'frozen report identity' 'commit/tree set and clean=true'
    } else {
      $level = if ($Strict) { 'FAIL' } else { 'WARN' }
      Write-Check $level 'frozen report identity' 'UNSET or clean=false; activation remains HOLD'
    }
    if (@($report.modules | Where-Object { $_.controlled_actions.enabled -eq $true }).Count -eq 0) {
      Write-Check PASS 'controlled actions' 'none enabled in candidate'
    }
  } catch {
    Write-Check FAIL 'activation report' ('invalid structure: ' + $_.Exception.Message)
  }
}

if ($HealthUrl) {
  try {
    $uri = [Uri]$HealthUrl
    if ($uri.Scheme -notin @('http', 'https')) {
      throw 'HealthUrl must use http or https'
    }
    $health = Invoke-RestMethod -Method Get -Uri $uri -TimeoutSec 10 -MaximumRedirection 0
    $age = [Math]::Abs(((Get-Date).ToUniversalTime() - ([DateTimeOffset]::Parse([string]$health.time)).UtcDateTime).TotalMinutes)
    if ($health.status -eq 'ok' -and $age -le 5) {
      Write-Check PASS 'runtime health' ('status=ok; clock age=' + [Math]::Round($age, 2) + ' minutes')
    } else {
      Write-Check FAIL 'runtime health' ('status=' + $health.status + '; clock age=' + [Math]::Round($age, 2) + ' minutes')
    }
  } catch {
    Write-Check FAIL 'runtime health' ('GET failed: ' + $_.Exception.Message)
  }
} else {
  Write-Check WARN 'runtime health' 'not requested; pass the internal /api/health URL for an unauthenticated read-only GET'
}

Write-Host ('Summary: PASS={0} WARN={1} FAIL={2}' -f $script:PassCount, $script:WarnCount, $script:FailCount)
if ($script:FailCount -gt 0) { exit 1 }
exit 0
