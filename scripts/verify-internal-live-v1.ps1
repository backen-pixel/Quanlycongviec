[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$HealthUrl = '',
  [string]$HealthBearerToken = $env:BUSINESS_OS_HEALTH_BEARER_TOKEN,
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$script:PassCount = 0
$script:WarnCount = 0
$script:FailCount = 0
$script:EvidenceMaxAgeHours = 24
$script:EvidenceFutureSkewMinutes = 0

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

function Require-Directory {
  param([string]$RelativePath)
  $full = Join-Path $RepoRoot $RelativePath
  if (Test-Path -LiteralPath $full -PathType Container) {
    Write-Check PASS ('directory ' + $RelativePath) 'present'
    return $full
  }
  Write-Check FAIL ('directory ' + $RelativePath) 'missing'
  return $null
}

function Test-RuntimeEvidencePath {
  param([string]$Reference)
  if ([string]::IsNullOrWhiteSpace($Reference)) { return $false }
  $normalized = $Reference.Replace('\', '/')
  if (-not $normalized.StartsWith('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/', [StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }
  if ($normalized.Split('/') -contains '..') { return $false }
  return $true
}

function Test-RuntimeEvidenceReference {
  param([string]$Reference)
  if (-not (Test-RuntimeEvidencePath $Reference)) { return $false }
  $normalized = $Reference.Replace('\', '/')
  return Test-Path -LiteralPath (Join-Path $RepoRoot $normalized) -PathType Leaf
}

function Test-StringSetEqual {
  param([object[]]$Expected, [object[]]$Actual)
  $expectedStrings = @($Expected | ForEach-Object { [string]$_ })
  $actualStrings = @($Actual | ForEach-Object { [string]$_ })
  return $expectedStrings.Count -eq $actualStrings.Count -and @(Compare-Object $expectedStrings $actualStrings).Count -eq 0
}

function Test-EvidenceHashInventory {
  param(
    [object]$HashInventory,
    [object[]]$ExpectedReferences
  )
  $expected = @($ExpectedReferences | ForEach-Object { ([string]$_).Replace('\', '/') } | Sort-Object -Unique)
  $properties = if ($null -eq $HashInventory) { @() } else { @($HashInventory.PSObject.Properties) }
  $actual = @($properties | ForEach-Object { [string]$_.Name })
  if (-not (Test-StringSetEqual $expected $actual)) { return $false }
  foreach ($property in $properties) {
    $reference = [string]$property.Name
    $recorded = ([string]$property.Value).ToLowerInvariant()
    if ($recorded -notmatch '^[0-9a-f]{64}$' -or -not (Test-RuntimeEvidenceReference $reference)) {
      return $false
    }
    $actualHash = (Get-FileHash -LiteralPath (Join-Path $RepoRoot $reference) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $recorded) { return $false }
  }
  return $true
}

function ConvertFrom-VerifierJson {
  param([string]$Json)
  # Newer pwsh otherwise converts ISO timestamps to DateTime and loses the
  # source offset when later coerced to text. Windows PowerShell keeps strings.
  if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) {
    return ConvertFrom-Json -InputObject $Json -DateKind String
  }
  return ConvertFrom-Json -InputObject $Json
}

function Get-CurrentTimestampValidation {
  param([object]$Value)
  try {
    if ($Value -is [DateTimeOffset]) {
      $timestamp = $Value
    } elseif ($Value -is [DateTime]) {
      if ($Value.Kind -ne [DateTimeKind]::Utc) { throw 'not UTC' }
      $timestamp = [DateTimeOffset]::new($Value)
    } else {
      if ($Value -isnot [string] -or $Value -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|\+00:00)$') {
        throw 'missing_or_not_utc_iso_timestamp'
      }
      $timestamp = [DateTimeOffset]::Parse($Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None)
    }
    $now = [DateTimeOffset]::UtcNow
    if ($timestamp.Offset -ne [TimeSpan]::Zero) { throw 'not UTC' }
    if ($timestamp -gt $now.AddMinutes($script:EvidenceFutureSkewMinutes)) { throw 'future' }
    if ($timestamp -lt $now.AddHours(-$script:EvidenceMaxAgeHours)) { throw 'stale' }
    return [PSCustomObject]@{ Valid = $true; Timestamp = $timestamp; Reason = '' }
  } catch {
    return [PSCustomObject]@{ Valid = $false; Timestamp = $null; Reason = 'timestamp_invalid_or_stale' }
  }
}

function Get-RuntimeEvidenceValidation {
  param(
    [string]$Reference,
    [string]$CandidateCommit,
    [string]$CandidateTree,
    [string]$AttestationSha256,
    [object]$AttestedAt
  )
  $normalized = $Reference.Replace('\', '/')
  $specifications = @{
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/candidate-attestation.json' = @{ Type = 'FOUNDER_LOCAL_CANDIDATE_ATTESTATION'; Kind = 'attestation'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/static-verification.json' = @{ Type = 'FOUNDER_LOCAL_STATIC_VERIFICATION'; Kind = 'static'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/configuration-rollback-verification.json' = @{ Type = 'FOUNDER_ADVISORY_CONFIGURATION_ROLLBACK_VERIFICATION'; Kind = 'configuration'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/founder-local-safety-verification.json' = @{ Type = 'FOUNDER_LOCAL_STATIC_SAFETY_VERIFICATION'; Kind = 'safety'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/runtime-acceptance-summary.json' = @{ Type = 'FOUNDER_LOCAL_RUNTIME_ACCEPTANCE'; Kind = 'runtime'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/browser-runtime-verification.json' = @{ Type = 'FOUNDER_LOCAL_BROWSER_RUNTIME_VERIFICATION'; Kind = 'browser'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/lifecycle-runtime-verification.json' = @{ Type = 'FOUNDER_LOCAL_LIFECYCLE_RUNTIME_VERIFICATION'; Kind = 'lifecycle'; Timestamp = 'checked_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/real-data-live-read.json' = @{ Type = 'FOUNDER_COCKPIT_REAL_DATA_LIVE_READ'; Kind = 'live_read'; Timestamp = 'generated_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/real-data-reconciliation.json' = @{ Type = 'FOUNDER_COCKPIT_REAL_DATA_RECONCILIATION'; Kind = 'reconciliation'; Timestamp = 'generated_at' }
    'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/backup-failover-verification.json' = @{ Type = 'FOUNDER_LOCAL_BACKUP_FAILOVER_VERIFICATION'; Kind = 'backup'; Timestamp = 'checked_at' }
  }
  $specification = $specifications[$normalized]
  if (-not $specification -or -not (Test-RuntimeEvidenceReference $normalized)) {
    return [PSCustomObject]@{ Valid = $false; Timestamp = $null; Reason = 'unknown_or_missing_artifact'; Artifact = $null }
  }
  try {
    $artifact = ConvertFrom-VerifierJson (Get-Content -Raw -LiteralPath (Join-Path $RepoRoot $normalized))
    $timestampValidation = Get-CurrentTimestampValidation $artifact.($specification.Timestamp)
    $valid = $artifact.schema_version -eq '1.0.0' -and
      $artifact.evidence_type -eq $specification.Type -and
      $artifact.result -eq 'PASS' -and
      $timestampValidation.Valid

    if ($specification.Kind -eq 'attestation') {
      $attestedRoot = try { [IO.Path]::GetFullPath([string]$artifact.repository.authorized_worktree_root) } catch { '' }
      $valid = $valid -and
        $artifact.repository.commit -eq $CandidateCommit -and
        $artifact.repository.tree -eq $CandidateTree -and
        $artifact.repository.worktree_clean -eq $true -and
        $artifact.repository.linked_worktree -eq $true -and
        $attestedRoot -eq [IO.Path]::GetFullPath($RepoRoot) -and
        $artifact.repository.branch -eq 'codex/business-ai-os-founder-local-live-v1' -and
        $artifact.repository.remote -eq 'https://github.com/backen-pixel/Quanlycongviec.git' -and
        $artifact.repository.root_workspace_status_inspected -eq $false -and
        $artifact.repository.root_workspace_modified_by_task -eq $false -and
        $artifact.repository.user_level_codex_directory_status_inspected -eq $false -and
        $artifact.repository.user_level_codex_directory_modified_by_task -eq $false
    } else {
      $attestedAtValidation = Get-CurrentTimestampValidation $AttestedAt
      $artifactAttestedAtValidation = Get-CurrentTimestampValidation $artifact.candidate.attested_at
      $valid = $valid -and
        $artifact.candidate.commit -eq $CandidateCommit -and
        $artifact.candidate.tree -eq $CandidateTree -and
        [string]$artifact.candidate.candidate_attestation_sha256 -match '^[0-9a-fA-F]{64}$' -and
        [string]$artifact.candidate.candidate_attestation_sha256 -eq $AttestationSha256 -and
        $attestedAtValidation.Valid -and
        $artifactAttestedAtValidation.Valid -and
        $artifactAttestedAtValidation.Timestamp.UtcDateTime.Ticks -eq $attestedAtValidation.Timestamp.UtcDateTime.Ticks -and
        $timestampValidation.Timestamp.UtcDateTime.Ticks -ge $attestedAtValidation.Timestamp.UtcDateTime.Ticks
    }

    switch ($specification.Kind) {
      'attestation' {
        $valid = $valid -and
          $artifact.security.real_customer_data_included -eq $false -and
          $artifact.security.real_financial_data_included -eq $false -and
          $artifact.security.real_hr_data_included -eq $false -and
          $artifact.security.secret_values_included -eq $false
      }
      'static' {
        $requiredChecks = @('structural_candidate_verifier', 'timestamp_verifier_regression', 'tenant_isolation', 'backend_business_os', 'advisory_configuration', 'founder_local_safety', 'browser_readiness_regression', 'candidate_evidence_isolation', 'founder_local_lifecycle_regression', 'frontend_business_os', 'frontend_founder_local_build')
        $passedChecks = @($artifact.checks | Where-Object { $_.status -eq 'PASS' } | ForEach-Object { [string]$_.id })
        $valid = $valid -and $artifact.candidate.clean_before -eq $true -and $artifact.candidate.clean_after -eq $true -and
          $artifact.candidate.head_and_tree_unchanged -eq $true -and $artifact.candidate.attestation_unchanged -eq $true -and
          $artifact.supply_chain.candidate_environment_files_changed -eq 0 -and
          [string]$artifact.supply_chain.frontend_dist_sha256 -match '^[0-9a-fA-F]{64}$' -and
          @($requiredChecks | Where-Object { $passedChecks -notcontains $_ }).Count -eq 0 -and
          $artifact.security.command_output_recorded -eq $false -and
          $artifact.security.credentials_recorded -eq $false -and
          $artifact.security.environment_values_recorded -eq $false -and
          $artifact.security.real_business_values_recorded -eq $false
      }
      'configuration' {
        $controls = $artifact.controls
        $valid = $valid -and
          $controls.authenticated_admin_and_permission_gate -eq $true -and
          $controls.bounded_validation -eq $true -and
          $controls.explicit_approval -eq $true -and
          $controls.idempotent_versioned_persistence -eq $true -and
          $controls.sanitized_audit_attribution -eq $true -and
          $controls.rollback_rehearsed_in_isolated_local_state -eq $true -and
          $controls.canonical_business_rule_changed -eq $false -and
          $controls.operational_effect -eq $false -and
          (Test-StringSetEqual @('backend_business_os', 'advisory_configuration', 'founder_local_safety') @($artifact.source_checks)) -and
          $artifact.security.credentials_recorded -eq $false -and
          $artifact.security.environment_values_recorded -eq $false -and
          $artifact.security.real_business_values_recorded -eq $false
      }
      'safety' {
        $controls = $artifact.controls
        $valid = $valid -and
          $controls.loopback_only_profile -eq $true -and
          $controls.canonical_database_mutations_blocked -eq $true -and
          $controls.unreviewed_rpc_blocked -eq $true -and
          $controls.operational_http_writes_blocked -eq $true -and
          $controls.unapproved_get_routes_blocked -eq $true -and
          $controls.source_scope_attested -eq $true -and
          $controls.integration_credentials_isolated -eq $true -and
          $controls.process_identity_bound -eq $true -and
          $controls.background_writers_disabled -eq $true -and
          $controls.tenant_isolation_suite_passed -eq $true -and
          (Test-StringSetEqual @('founder_local_safety', 'tenant_isolation') @($artifact.source_checks)) -and
          $artifact.security.credentials_recorded -eq $false -and
          $artifact.security.environment_values_recorded -eq $false -and
          $artifact.security.real_business_values_recorded -eq $false
      }
      'runtime' {
        $requiredChecks = @('runtime_posture', 'login_page', 'non_loopback_origin_denied', 'realtime_handshake_denied', 'business_uploads_denied', 'admin_boundary', 'domain_http_write_denied', 'bounded_founder_token', 'authenticated_health', 'expired_token_denied', 'legacy_token_denied', 'non_admin_boundary', 'authenticated_domain_write_denied', 'unapproved_source_reads_denied', 'source_scope_required', 'browser_runtime')
        $failedChecks = @($requiredChecks | Where-Object { $artifact.checks.$_.status -ne 'PASS' })
        $runtimePosture = $artifact.checks.runtime_posture
        $authenticatedHealth = $artifact.checks.authenticated_health
        $boundedFounderToken = $artifact.checks.bounded_founder_token
        $expiredToken = $artifact.checks.expired_token_denied
        $legacyToken = $artifact.checks.legacy_token_denied
        $nonAdminBoundary = $artifact.checks.non_admin_boundary
        $nonAdminValid = ($nonAdminBoundary.identity_available -eq $true -and
            $nonAdminBoundary.http_status -eq 403 -and
            $nonAdminBoundary.code -eq 'FOUNDER_LOCAL_ADMIN_REQUIRED' -and
            $nonAdminBoundary.business_payload_present -eq $false) -or
          ($nonAdminBoundary.identity_available -eq $false -and
            $nonAdminBoundary.check_result -eq 'NOT_APPLICABLE_NO_ACTIVE_TENANT_BOUND_NON_ADMIN')
        $valid = $valid -and $artifact.profile -eq 'founder-local-read-only' -and $artifact.target -eq '127.0.0.1:4010' -and $failedChecks.Count -eq 0 -and
          $runtimePosture.bind_host -eq '127.0.0.1' -and
          $runtimePosture.controlled_real_writes_enabled -eq $false -and
          $runtimePosture.background_writers_enabled -eq $false -and
          $runtimePosture.realtime_writes_enabled -eq $false -and
          $runtimePosture.public_binding_enabled -eq $false -and
          $runtimePosture.process_identity_attested -eq $true -and
          $runtimePosture.candidate_identity_attested -eq $true -and
          $runtimePosture.frontend_manifest_identity_attested -eq $true -and
          $runtimePosture.static_frontend_dist_attested -eq $true -and
          $runtimePosture.process_record_attested -eq $true -and
          $runtimePosture.launcher_process_alive -eq $true -and
          $runtimePosture.launcher_owns_runtime -eq $true -and
          $artifact.checks.non_loopback_origin_denied.allow_origin_header_present -eq $false -and
          $artifact.checks.business_uploads_denied.http_status -eq 403 -and
          $artifact.checks.admin_boundary.unauthenticated_http_status -eq 401 -and
          $artifact.checks.domain_http_write_denied.http_status -eq 405 -and
          $artifact.checks.domain_http_write_denied.code -eq 'FOUNDER_LOCAL_WRITE_BLOCKED' -and
          $boundedFounderToken.audience -eq 'founder-local-read-only' -and
          $boundedFounderToken.issued_at_present -eq $true -and $boundedFounderToken.expires_at_present -eq $true -and
          $boundedFounderToken.ttl_at_most_seconds -eq 3600 -and
          $authenticatedHealth.http_status -eq 200 -and $authenticatedHealth.contract_version -eq 'founder_cockpit_health_v1' -and
          $authenticatedHealth.ready -eq $true -and $nonAdminValid -and
          $expiredToken.http_status -eq 401 -and $expiredToken.code -eq 'FOUNDER_LOCAL_TOKEN_INVALID' -and
          $expiredToken.business_payload_present -eq $false -and
          $legacyToken.http_status -eq 401 -and $legacyToken.code -eq 'FOUNDER_LOCAL_TOKEN_INVALID' -and
          $legacyToken.business_payload_present -eq $false -and
          $artifact.checks.authenticated_domain_write_denied.http_status -eq 405 -and
          $artifact.checks.authenticated_domain_write_denied.code -eq 'FOUNDER_LOCAL_WRITE_BLOCKED' -and
          $artifact.checks.unapproved_source_reads_denied.route_count -eq 2 -and
          $artifact.checks.unapproved_source_reads_denied.http_status -eq 403 -and
          $artifact.checks.unapproved_source_reads_denied.code -eq 'FOUNDER_LOCAL_READ_ROUTE_NOT_APPROVED' -and
          $artifact.checks.source_scope_required.http_status -eq 400 -and
          $artifact.checks.source_scope_required.code -eq 'FOUNDER_LOCAL_SCOPE_REQUIRED' -and
          $artifact.security.identities_recorded -eq $false -and $artifact.security.credentials_recorded -eq $false -and
          $artifact.security.environment_file_path_recorded -eq $false -and $artifact.security.raw_business_values_recorded -eq $false
      }
      'browser' {
        $controls = $artifact.controls
        $valid = $valid -and
          $controls.same_origin_only -eq $true -and
          $controls.loopback_only -eq $true -and
          $controls.admin_authenticated -eq $true -and
          $controls.business_os_rendered -eq $true -and
          $controls.crm_drilldown_loaded -eq $true -and
          $controls.company_scope_persisted -eq $true -and
          $controls.drilldown_scope_enforced -eq $true -and
          $controls.partial_read_disclosed -eq $true -and
          $controls.crm_partial_totals_disclosed -eq $true -and
          $controls.ephemeral_browser_context -eq $true -and
          $controls.parent_temp_confined -eq $true -and
          $artifact.rendered_contract.http_status -eq 200 -and
          $artifact.rendered_contract.contract_version -eq 'founder_cockpit_v1' -and
          $artifact.rendered_contract.visible_content_validated -eq $true -and
          $artifact.rendered_contract.counts.systems -eq 6 -and
          $artifact.rendered_contract.counts.capabilities -eq 19 -and
          $artifact.rendered_contract.counts.configuration -eq 1 -and
          $artifact.rendered_contract.counts.signal_hub -eq 1 -and
          $controls.stale_acceptance_profiles_removed -eq $true -and
          $controls.unapproved_ui_route_denied -eq $true -and
          $controls.no_write_observed -eq $true -and
          $controls.secrets_recorded -eq $false
      }
      'lifecycle' {
        $cycles = @($artifact.cycles)
        $finished = Get-CurrentTimestampValidation $artifact.finished_at
        $valid = $valid -and $cycles.Count -eq 2 -and
          $artifact.clean_restart_verified -eq $true -and $artifact.cleanup_failed -ne $true -and
          $finished.Valid -and $finished.Timestamp -ge $timestampValidation.Timestamp -and
          @($cycles | ForEach-Object { $_.run_ref } | Sort-Object -Unique).Count -eq 2 -and
          $artifact.security.credentials_recorded -eq $false -and
          $artifact.security.environment_file_path_recorded -eq $false -and
          $artifact.security.raw_business_values_recorded -eq $false -and
          $artifact.security.canonical_writes_enabled -eq $false
        foreach ($cycle in $cycles) {
          $valid = $valid -and $cycle.result -eq 'PASS' -and
            [string]$cycle.run_ref -match '^[0-9a-f]{16}$' -and
            $cycle.candidate_bound -eq $true -and $cycle.loopback_only -eq $true -and
            $cycle.operational_writes_disabled -eq $true -and
            $cycle.owned_launcher_and_child_attested -eq $true -and
            $cycle.stop_succeeded -eq $true -and $cycle.repeated_stop_succeeded -eq $true -and
            $cycle.exact_processes_dead -eq $true -and $cycle.port_closed -eq $true -and
            $cycle.pid_and_lock_absent -eq $true -and $cycle.manual_cleanup_used -eq $false
        }
      }
      'live_read' {
        $valid = $valid -and $artifact.ok -eq $true -and $artifact.system_count -eq 6 -and
          $artifact.module_count -eq 15 -and $artifact.platform_capability_count -eq 19 -and
          $artifact.manufacturing_view_count -eq 2 -and $artifact.negative_scope_checks -gt 0 -and
          $artifact.writes_enabled -eq $false -and $artifact.security.synthetic_fallback_enabled -eq $false -and
          $artifact.security.raw_business_values_recorded -eq $false -and $artifact.security.identities_recorded -eq $false -and
          $artifact.security.credentials_recorded -eq $false
      }
      'reconciliation' {
        $mismatches = @($artifact.checks | Where-Object { $_.state -ne 'MATCH' })
        $valid = $valid -and $artifact.runtime_profile -eq 'FOUNDER_LOCAL_READ_ONLY' -and
          @($artifact.checks).Count -gt 0 -and $mismatches.Count -eq 0 -and
          @($artifact.representative_source_fingerprints).Count -gt 0 -and
          $artifact.security.synthetic_fallback_enabled -eq $false -and
          $artifact.security.controlled_write_enabled -eq $false -and
          $artifact.security.raw_business_values_recorded -eq $false -and $artifact.security.identities_recorded -eq $false -and
          $artifact.security.credentials_recorded -eq $false
      }
    }
    return [PSCustomObject]@{
      Valid = [bool]$valid
      Timestamp = $timestampValidation.Timestamp
      Reason = if ($valid) { '' } else { 'schema_type_binding_or_controls_invalid' }
      Artifact = $artifact
    }
  } catch {
    return [PSCustomObject]@{ Valid = $false; Timestamp = $null; Reason = 'artifact_json_invalid'; Artifact = $null }
  }
}

function Get-EvidenceSetValidation {
  param(
    [object[]]$References,
    [object]$CheckedAt,
    [string]$CandidateCommit,
    [string]$CandidateTree,
    [string]$AttestationSha256,
    [object]$AttestedAt
  )
  $referencesArray = @($References | ForEach-Object { [string]$_ })
  if ($referencesArray.Count -eq 0) {
    return [PSCustomObject]@{ Valid = $false; Reason = 'evidence_inventory_empty'; Validations = @() }
  }
  $validations = @($referencesArray | ForEach-Object {
    Get-RuntimeEvidenceValidation $_ $CandidateCommit $CandidateTree $AttestationSha256 $AttestedAt
  })
  $gateTimestamp = Get-CurrentTimestampValidation $CheckedAt
  $validArtifactTimestamps = @($validations | Where-Object { $_.Valid -and $_.Timestamp })
  $latestArtifact = @($validArtifactTimestamps | Sort-Object { $_.Timestamp.UtcDateTime.Ticks } -Descending | Select-Object -First 1)
  $timestampMatches = $gateTimestamp.Valid -and $latestArtifact.Count -eq 1 -and
    $gateTimestamp.Timestamp.UtcDateTime.Ticks -eq $latestArtifact[0].Timestamp.UtcDateTime.Ticks
  $invalid = @($validations | Where-Object { -not $_.Valid })
  return [PSCustomObject]@{
    Valid = $invalid.Count -eq 0 -and $timestampMatches
    Reason = if ($invalid.Count -gt 0) { [string]$invalid[0].Reason } elseif (-not $timestampMatches) { 'checked_at_must_equal_latest_artifact_timestamp' } else { '' }
    Validations = $validations
  }
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
  'backend/package.json',
  'backend/package-lock.json',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/scripts/verify-founder-local-dist.mjs',
  'frontend/src/business-os/founderLocalReadOnly.js',
  'backend/src/server.js',
  'backend/src/config/runtimeProfile.js',
  'backend/src/config/founderLocalEnv.js',
  'backend/src/config/founderLocalRuntimeProvenance.js',
  'backend/src/config/founderLocalProcessBinding.js',
  'backend/src/config/founderLocalWriteScope.js',
  'backend/src/middleware/founderLocalReadOnly.js',
  'backend/scripts/start-founder-local-read-only.js',
  'backend/scripts/stop-founder-local-read-only.js',
  'backend/src/helpers/founderLocalSupabaseGuard.js',
  'backend/src/helpers/founderPlatformCapabilities.js',
  'backend/src/routes/businessOs.js',
  'backend/src/services/founderAdvisoryConfig.js',
  'backend/tests/founder-advisory-config.test.js',
  'backend/tests/founder-cockpit-live-read.js',
  'backend/tests/founder-cockpit-reconciliation-live.js',
  'backend/scripts/sync-supabase-backup.js',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_FOUNDER_ACCEPTANCE.md',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_RUNBOOK.md',
  'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_VERIFICATION_SUMMARY.md',
  'docs/internal-live-v1/MODULE_ACTIVATION_STATUS.schema.json',
  'evidence/internal-live-operation-v1/runtime-safety/README.md',
  'evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json',
  'evidence/internal-live-operation-v1/runtime-safety/candidate-binding.js',
  'evidence/internal-live-operation-v1/runtime-safety/founder-local-read-only.test.js',
  'evidence/internal-live-operation-v1/runtime-safety/run-static-verification.js',
  'evidence/internal-live-operation-v1/runtime-safety/verify-founder-local-runtime.js',
  'evidence/internal-live-operation-v1/runtime-safety/write-candidate-attestation.js',
  'evidence/internal-live-operation-v1/runtime-safety/runtime/.gitignore'
)

$paths = @{}
foreach ($relative in $requiredFiles) {
  $paths[$relative] = Require-File $relative
}
$evidenceRoot = Require-Directory 'evidence/internal-live-operation-v1/runtime-safety'
$runtimeEvidenceDirectory = Require-Directory 'evidence/internal-live-operation-v1/runtime-safety/runtime'
$head = ''
$tree = ''
$branch = ''
$worktreeClean = $false
$evidenceManifest = $null

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
    $worktreeClean = $true
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
    if ([string]::IsNullOrWhiteSpace([string]$frontendPackage.scripts.'build:founder-local')) {
      Write-Check FAIL 'frontend package script build:founder-local' 'missing'
    } else {
      Write-Check PASS 'frontend package script build:founder-local' 'declared'
    }
  } catch {
    Write-Check FAIL 'frontend/package.json' ('invalid JSON: ' + $_.Exception.Message)
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
  if ($server -match 'applyRuntimeProfile' -and
      $server -match 'installFounderLocalSupabaseGuard' -and
      $server -match 'backgroundWritersAllowed' -and
      $server -match 'serverBinding' -and
      $server -match 'assertFounderLocalRuntimeFileBinding' -and
      $server -match 'FOUNDER_LOCAL_LAUNCHER_IPC_REQUIRED' -and
      $server -match "process\.once\('disconnect'" -and
      $server -notmatch 'http://(?:127\.0\.0\.1|localhost):5173') {
    Write-Check PASS 'Founder-local server integration' 'profile, provenance, live launcher, writer gate, same-origin CORS, and loopback binding are wired'
  } else {
    Write-Check FAIL 'Founder-local server integration' 'required fail-closed runtime hooks are not all wired'
  }
}

if ($paths['backend/src/config/runtimeProfile.js']) {
  $profile = Get-Content -Raw -LiteralPath $paths['backend/src/config/runtimeProfile.js']
  $profileChecks = @(
    ($profile -match "FOUNDER_LOCAL_READ_ONLY_PROFILE\s*=\s*'founder-local-read-only'")
    ($profile -match "FOUNDER_LOCAL_BIND_HOST\s*=\s*'127\.0\.0\.1'")
    ($profile -match "SUPABASE_AUTO_FAILOVER:\s*'0'")
    ($profile -match "SUPABASE_REPLICATION_DISABLED:\s*'1'")
    ($profile -match "BATCH_QUEUE_DISABLED:\s*'1'")
    ($profile -match 'function backgroundWritersAllowed')
    ($profile -match 'function canonicalWritesAllowed')
  )
  if ($profileChecks -notcontains $false) {
    Write-Check PASS 'Founder-local runtime profile' 'loopback and writer-off controls are declared'
  } else {
    Write-Check FAIL 'Founder-local runtime profile' 'one or more loopback/writer-off controls are missing'
  }
}

if ($paths['backend/src/middleware/founderLocalReadOnly.js']) {
  $founderBoundary = Get-Content -Raw -LiteralPath $paths['backend/src/middleware/founderLocalReadOnly.js']
  if ($founderBoundary -match "FOUNDER_LOCAL_APPROVED_SOURCE_READS\s*=\s*new Set" -and
      $founderBoundary -match "GET /api/crm/web-dashboard-bootstrap" -and
      $founderBoundary -match 'FOUNDER_LOCAL_READ_ROUTE_NOT_APPROVED' -and
      $founderBoundary -match 'attestFounderLocalCompanyScope' -and
      $founderBoundary -match 'FOUNDER_LOCAL_SCOPE_REQUIRED') {
    Write-Check PASS 'Founder-local source read boundary' 'unreviewed GETs fail closed and the approved CRM read is tenant/company-attested'
  } else {
    Write-Check FAIL 'Founder-local source read boundary' 'explicit allowlist or scope attestation is incomplete'
  }
}

if ($paths['backend/src/config/founderLocalEnv.js'] -and
    $paths['backend/src/config/founderLocalRuntimeProvenance.js'] -and
    $paths['backend/src/config/founderLocalProcessBinding.js'] -and
    $paths['backend/scripts/start-founder-local-read-only.js'] -and
    $paths['backend/scripts/stop-founder-local-read-only.js']) {
  $founderEnv = Get-Content -Raw -LiteralPath $paths['backend/src/config/founderLocalEnv.js']
  $founderProvenance = Get-Content -Raw -LiteralPath $paths['backend/src/config/founderLocalRuntimeProvenance.js']
  $founderProcessBinding = Get-Content -Raw -LiteralPath $paths['backend/src/config/founderLocalProcessBinding.js']
  $founderLauncher = Get-Content -Raw -LiteralPath $paths['backend/scripts/start-founder-local-read-only.js']
  $founderStopper = Get-Content -Raw -LiteralPath $paths['backend/scripts/stop-founder-local-read-only.js']
  if ($founderEnv -match 'buildFounderLocalChildEnvironment' -and
      $founderLauncher -match 'buildFounderLocalChildEnvironment' -and
      $founderLauncher -match 'process\.lock\.json' -and
      $founderLauncher -match "flag:\s*'wx'" -and
      $founderLauncher -match 'founder-local-ready-v1' -and
      $founderProvenance -match 'FOUNDER_LOCAL_RUN_ID' -and
      $founderProvenance -match 'FOUNDER_LOCAL_FRONTEND_DIST_SHA256' -and
      $founderProcessBinding -match 'assertFounderLocalProcessBinding' -and
      $founderStopper -match 'assertFounderLocalProcessBinding' -and
      $founderStopper -match 'signalExactProcess' -and
      $founderStopper -match 'expected:\s*owned\.child' -and
      $founderStopper -match 'waitForOwnedRuntimeStop' -and
      $founderStopper -match 'cleanExactRuntimeRecords' -and
      $founderProcessBinding -match 'processInstanceMatches' -and
      $founderLauncher -match 'removeExactRuntimeRecord' -and
      $founderLauncher -match 'assertWorkspaceRuntimeDirectory' -and
      $founderStopper -match 'founderLocalRecordIdentityMatches') {
    Write-Check PASS 'Founder-local process isolation' 'minimal child environment, candidate/dist provenance, exclusive identity, and live ownership are wired'
  } else {
    Write-Check FAIL 'Founder-local process isolation' 'credential isolation or exclusive process identity is incomplete'
  }
}

if ($paths['backend/src/helpers/founderLocalSupabaseGuard.js']) {
  $guard = Get-Content -Raw -LiteralPath $paths['backend/src/helpers/founderLocalSupabaseGuard.js']
  if ($guard -match "\['insert', 'upsert', 'update', 'delete'\]" -and
      $guard -match 'unknown_rpc_blocked:\s*true' -and
      $guard -match 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED') {
    Write-Check PASS 'Founder-local database guard' 'PostgREST mutations and unknown RPCs fail closed'
  } else {
    Write-Check FAIL 'Founder-local database guard' 'write-blocking contract could not be proven statically'
  }
}

if ($paths['backend/src/routes/businessOs.js']) {
  $businessOs = Get-Content -Raw -LiteralPath $paths['backend/src/routes/businessOs.js']
  if ($businessOs -match "FOUNDER_ROLES\s*=\s*new Set\(\['admin'\]\)" -and
      $businessOs -match "router\.get\('/health'" -and
      $businessOs -match "router\.put\('/configuration'" -and
      $businessOs -match "router\.post\('/configuration/rollback'") {
    Write-Check PASS 'Founder API boundary' 'admin-only route family and health/advisory endpoints are present'
  } else {
    Write-Check FAIL 'Founder API boundary' 'admin-only route family or required endpoints are missing'
  }
}

if ($paths['backend/src/services/founderAdvisoryConfig.js']) {
  $advisory = Get-Content -Raw -LiteralPath $paths['backend/src/services/founderAdvisoryConfig.js']
  if ($advisory -match 'operational_effect:\s*false' -and
      $advisory -match 'canonical:\s*false' -and
      $advisory -match 'FOUNDER_CONFIG_IDEMPOTENCY_CONFLICT' -and
      $advisory -match 'FOUNDER_CONFIG_VERSION_CONFLICT' -and
      $advisory -match 'async rollback') {
    Write-Check PASS 'advisory configuration contract' 'non-canonical, zero-effect, idempotent, versioned rollback surface is present'
  } else {
    Write-Check FAIL 'advisory configuration contract' 'bounded advisory guarantees could not be proven statically'
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
  'FOUNDER DECISION REQUIRED',
  'SANDBOX'
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
$requiredPlatformCapabilities = @(
  'strategy_objective_center',
  'founder_executive_cockpit',
  'portfolio_planning_forecasting',
  'capacity_workload_balancing',
  'founder_decision_exception_center',
  'management_reporting_profitability',
  'correction_evolution',
  'founder_configuration_center',
  'cross_domain_signal_hub',
  'module_registry_feature_flags',
  'connector_center',
  'data_quality_reconciliation',
  'customer_tenant_administration',
  'industry_pack_template_studio',
  'customer_onboarding_data_portability',
  'licensing_billing',
  'release_upgrade_rollback',
  'monitoring_backup_support',
  'executive_domain_ai_interfaces'
)

if ($paths['docs/internal-live-v1/MODULE_ACTIVATION_STATUS.schema.json']) {
  try {
    $null = Get-Content -Raw -LiteralPath $paths['docs/internal-live-v1/MODULE_ACTIVATION_STATUS.schema.json'] | ConvertFrom-Json
    Write-Check PASS 'activation schema' 'valid JSON'
  } catch {
    Write-Check FAIL 'activation schema' ('invalid JSON: ' + $_.Exception.Message)
  }
}

if ($paths['evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json']) {
  try {
    $evidenceManifest = ConvertFrom-VerifierJson (Get-Content -Raw -LiteralPath $paths['evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json'])
    $expectedManifestArtifacts = @{
      runtime = @(
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/candidate-attestation.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/static-verification.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/lifecycle-runtime-verification.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/runtime-acceptance-summary.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/browser-runtime-verification.json'
      )
      health = @(
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/runtime-acceptance-summary.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/real-data-live-read.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/browser-runtime-verification.json'
      )
      reconciliation = @('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/real-data-reconciliation.json')
      configuration_rollback = @('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/configuration-rollback-verification.json')
      no_write = @(
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/founder-local-safety-verification.json',
        'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/runtime-acceptance-summary.json'
      )
      backup_failover = @('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/backup-failover-verification.json')
      advisory_configuration = @('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/configuration-rollback-verification.json')
    }
    $manifestBlockingNames = @($evidenceManifest.readiness_gates.blocking.PSObject.Properties.Name)
    $expectedBlockingNames = @('runtime', 'health', 'reconciliation', 'configuration_rollback', 'no_write')
    $manifestBlockingDiff = @(Compare-Object $expectedBlockingNames $manifestBlockingNames)
    $manifestInformationalNames = @($evidenceManifest.readiness_gates.informational.PSObject.Properties.Name)
    $manifestInformationalDiff = @(Compare-Object @('backup_failover') $manifestInformationalNames)
    $manifestGates = @(
      $expectedBlockingNames | ForEach-Object { $evidenceManifest.readiness_gates.blocking.$_ }
    ) + @($evidenceManifest.readiness_gates.informational.backup_failover)
    $invalidManifestGate = @($manifestGates | Where-Object {
      [string]$_.status -notin @('PASS', 'PENDING', 'FAIL') -or @($_.artifacts).Count -eq 0
    })
    $invalidManifestPath = @($manifestGates | ForEach-Object { @($_.artifacts) } | Where-Object {
      -not (Test-RuntimeEvidencePath ([string]$_))
    })
    $manifestAdvisory = $evidenceManifest.advisory_configuration
    $invalidAdvisoryPath = @($manifestAdvisory.artifacts | Where-Object {
      -not (Test-RuntimeEvidencePath ([string]$_))
    })
    $manifestArtifactInventoryValid = $true
    foreach ($gateName in $expectedBlockingNames) {
      if (-not (Test-StringSetEqual $expectedManifestArtifacts[$gateName] @($evidenceManifest.readiness_gates.blocking.$gateName.artifacts))) {
        $manifestArtifactInventoryValid = $false
      }
    }
    $manifestArtifactInventoryValid = $manifestArtifactInventoryValid -and
      (Test-StringSetEqual $expectedManifestArtifacts.backup_failover @($evidenceManifest.readiness_gates.informational.backup_failover.artifacts)) -and
      (Test-StringSetEqual $expectedManifestArtifacts.advisory_configuration @($manifestAdvisory.artifacts))
    $hashRequiredReferences = @(
      $expectedBlockingNames | ForEach-Object {
        $gate = $evidenceManifest.readiness_gates.blocking.$_
        if ($gate.status -eq 'PASS') { @($gate.artifacts) }
      }
    )
    if ($evidenceManifest.readiness_gates.informational.backup_failover.status -eq 'PASS') {
      $hashRequiredReferences += @($evidenceManifest.readiness_gates.informational.backup_failover.artifacts)
    }
    if ($manifestAdvisory.status -eq 'ENABLED') {
      $hashRequiredReferences += @($manifestAdvisory.artifacts)
    }
    $manifestHashesValid = Test-EvidenceHashInventory $evidenceManifest.artifact_sha256 $hashRequiredReferences
    if ($evidenceManifest.schema_version -eq '1.1.0' -and
        $evidenceManifest.environment -eq 'FOUNDER_LOCAL_PRIVATE' -and
        $evidenceManifest.evidence_root -eq 'evidence/internal-live-operation-v1/runtime-safety' -and
        $evidenceManifest.generated_artifact_directory -eq 'runtime/candidates/c3-r2' -and
        $evidenceManifest.generated_artifacts_git_ignored -eq $true -and
        $evidenceManifest.secrets_allowed -eq $false -and
        $manifestBlockingDiff.Count -eq 0 -and
        $manifestInformationalDiff.Count -eq 0 -and
        $invalidManifestGate.Count -eq 0 -and
        $invalidManifestPath.Count -eq 0 -and
        $manifestArtifactInventoryValid -and
        $manifestHashesValid -and
        $manifestAdvisory.status -in @('DISABLED', 'PENDING_VERIFICATION', 'ENABLED') -and
        $manifestAdvisory.default_enabled -eq $false -and
        $manifestAdvisory.canonical_business_rule -eq $false -and
        $manifestAdvisory.operational_effect -eq $false -and
        @($manifestAdvisory.artifacts).Count -gt 0 -and
        $invalidAdvisoryPath.Count -eq 0 -and
        $evidenceManifest.readiness_gates.informational.backup_failover.blocking -eq $false) {
      Write-Check PASS 'evidence manifest' 'five blocking gates, non-blocking backup/failover, and sanitized artifact inventory are valid'
    } else {
      Write-Check FAIL 'evidence manifest' 'boundary, gate inventory, artifact path, or secret policy is invalid'
    }
  } catch {
    Write-Check FAIL 'evidence manifest' ('invalid JSON: ' + $_.Exception.Message)
  }
}

if ($paths['docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json']) {
  try {
    $report = ConvertFrom-VerifierJson (Get-Content -Raw -LiteralPath $paths['docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json'])
    Write-Check PASS 'activation report' 'valid JSON'
    $verifiedCandidate = $report.verified_source_candidate
    $candidateCommit = [string]$verifiedCandidate.commit
    $candidateTree = [string]$verifiedCandidate.tree
    $candidateShapeValid = $candidateCommit -match '^[0-9a-f]{40}$' -and
      $candidateTree -match '^[0-9a-f]{40}$' -and
      $verifiedCandidate.clean -eq $true
    $attestationReference = 'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/candidate-attestation.json'
    $attestationSha256 = ''
    $attestedAt = ''
    if (Test-RuntimeEvidenceReference $attestationReference) {
      try {
        $attestationPath = Join-Path $RepoRoot $attestationReference
        $candidateAttestation = ConvertFrom-VerifierJson (Get-Content -Raw -LiteralPath $attestationPath)
        $attestationSha256 = (Get-FileHash -LiteralPath $attestationPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $attestedAt = $candidateAttestation.checked_at
      } catch {
        $attestationSha256 = ''
        $attestedAt = ''
      }
    }
    if ($report.environment -eq 'FOUNDER_LOCAL_PRIVATE') {
      Write-Check PASS 'environment boundary' 'FOUNDER_LOCAL_PRIVATE'
    } else {
      Write-Check FAIL 'environment boundary' 'must be FOUNDER_LOCAL_PRIVATE'
    }

    $controls = $report.environment_controls
    $roles = @($controls.allowed_roles)
    $bindHosts = @($controls.bind_hosts)
    $unexpectedBindHosts = @($bindHosts | Where-Object { @('127.0.0.1', 'localhost', '::1') -notcontains [string]$_ })
    if ($controls.deployment_class -eq 'FOUNDER_LOCAL_PRIVATE' -and
        $controls.admin_only -eq $true -and
        $roles.Count -eq 1 -and [string]$roles[0] -eq 'admin' -and
        $controls.public_internet_exposed -eq $false -and
        $controls.background_write_jobs_default_enabled -eq $false -and
        $bindHosts.Count -gt 0 -and $unexpectedBindHosts.Count -eq 0) {
      Write-Check PASS 'Founder-local controls' 'loopback, admin-only, private, and background-writers-off'
    } else {
      Write-Check FAIL 'Founder-local controls' 'environment controls do not match the fixed Founder authority'
    }

    $dataPolicy = $report.data_policy
    $readPaths = @($dataPolicy.allowed_read_paths)
    $readPathDiff = @(Compare-Object @('APPLICATION_SERVICE', 'APPROVED_READ_MODEL') $readPaths)
    if ($dataPolicy.read_in_place -eq $true -and
        $readPathDiff.Count -eq 0 -and
        $dataPolicy.direct_database_write_allowed -eq $false -and
        $dataPolicy.silent_synthetic_fallback_allowed -eq $false -and
        $dataPolicy.secondary_writable_business_store_allowed -eq $false) {
      Write-Check PASS 'real-data policy' 'read in place; no direct write, writable duplicate, or synthetic fallback'
    } else {
      Write-Check FAIL 'real-data policy' 'report violates the approved real-data contract'
    }

    $capacity = $report.capacity_policy
    if ($capacity.mode -eq 'PROVISIONAL_ADVISORY_ONLY' -and
        $capacity.canonical_business_rule -eq $false -and
        $capacity.warning_only -eq $true -and
        $capacity.may_auto_change_operations -eq $false -and
        $capacity.may_enable_operational_domain_writes -eq $false) {
      Write-Check PASS 'capacity policy' 'provisional warning only with zero operational authority'
    } else {
      Write-Check FAIL 'capacity policy' 'capacity settings could be interpreted as canonical or operational'
    }

    $writePolicy = $report.controlled_write_policy
    $advisoryPolicy = $writePolicy.advisory_configuration
    $sixGates = @(
      'existing_business_rule',
      'permission',
      'approval_and_validation',
      'idempotency',
      'audit',
      'rollback_or_compensation'
    )
    $sixGateDiff = @(Compare-Object $sixGates @($writePolicy.required_six_gates))
    $advisoryInvariant = $advisoryPolicy.status -in @('DISABLED', 'PENDING_VERIFICATION', 'ENABLED') -and
      $advisoryPolicy.storage -eq 'FOUNDER_LOCAL_FILE' -and
      $advisoryPolicy.default_enabled -eq $false -and
      $advisoryPolicy.canonical_business_rule -eq $false -and
      $advisoryPolicy.operational_effect -eq $false -and
      $advisoryPolicy.automatic_actions_enabled -eq $false -and
      $advisoryPolicy.explicit_founder_confirmation_required -eq $true -and
      $advisoryPolicy.validation_required -eq $true -and
      $advisoryPolicy.idempotency_required -eq $true -and
      $advisoryPolicy.audit_and_versioning_required -eq $true -and
      $advisoryPolicy.rollback_required -eq $true
    if ($writePolicy.operational_domain_writes_enabled -eq $false -and
        $writePolicy.direct_database_write_allowed -eq $false -and
        $writePolicy.schema_change_allowed -eq $false -and
        $writePolicy.permission_increase_allowed -eq $false -and
        $sixGateDiff.Count -eq 0 -and $advisoryInvariant) {
      Write-Check PASS 'write policy' ('operational/domain writes disabled; advisory=' + $advisoryPolicy.status)
    } else {
      Write-Check FAIL 'write policy' 'operational protection or advisory invariant is incomplete'
    }
    if ($advisoryPolicy.status -eq 'ENABLED') {
      $advisoryEvidence = @($advisoryPolicy.evidence)
      $advisoryEvidenceSet = Get-EvidenceSetValidation $advisoryEvidence $advisoryPolicy.checked_at $candidateCommit $candidateTree $attestationSha256 $attestedAt
      if ($advisoryEvidenceSet.Valid -and
          (Test-StringSetEqual @('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/configuration-rollback-verification.json') $advisoryEvidence)) {
        Write-Check PASS 'advisory enablement evidence' 'current candidate-bound six-gate evidence is present under the dedicated root'
      } else {
        Write-Check FAIL 'advisory enablement evidence' ('ENABLED is forbidden without current local six-gate evidence: ' + $advisoryEvidenceSet.Reason)
      }
    } else {
      Write-Check PASS 'advisory default' ('not enabled: ' + $advisoryPolicy.status)
    }
    if ($evidenceManifest) {
      $manifestAdvisoryArtifacts = @($evidenceManifest.advisory_configuration.artifacts)
      $manifestContainsAdvisoryEvidence = $advisoryPolicy.status -ne 'ENABLED' -or
        (Test-StringSetEqual $manifestAdvisoryArtifacts @($advisoryPolicy.evidence))
      if ($evidenceManifest.advisory_configuration.status -eq $advisoryPolicy.status -and
          [string]$evidenceManifest.advisory_configuration.checked_at -eq [string]$advisoryPolicy.checked_at -and
          $manifestContainsAdvisoryEvidence) {
        Write-Check PASS 'manifest advisory parity' 'status, timestamp, and enabled evidence inventory agree'
      } else {
        Write-Check FAIL 'manifest advisory parity' 'module report and evidence manifest disagree'
      }
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
      if ($module.controlled_actions.enabled -eq $true) {
        Write-Check FAIL ('module ' + $key) 'operational/domain action enabled in Founder-local V1'
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

    $capabilitySeen = @{}
    foreach ($capability in @($report.platform_capabilities)) {
      $capabilityKey = [string]$capability.key
      if ($capabilitySeen.ContainsKey($capabilityKey)) {
        Write-Check FAIL ('platform capability ' + $capabilityKey) 'duplicate key'
      }
      $capabilitySeen[$capabilityKey] = $true
      if ($allowedStatuses -notcontains [string]$capability.status -or @($capability.evidence).Count -eq 0) {
        Write-Check FAIL ('platform capability ' + $capabilityKey) 'invalid status or missing evidence'
      }
    }
    $capabilityDiff = @(Compare-Object $requiredPlatformCapabilities @($capabilitySeen.Keys))
    if ($report.platform_capability_count -eq 19 -and $capabilitySeen.Count -eq 19 -and $capabilityDiff.Count -eq 0) {
      Write-Check PASS 'platform capability coverage' 'exact 19 unique registry keys with evidence'
    } else {
      Write-Check FAIL 'platform capability coverage' 'must contain exactly the 19 canonical capability keys'
    }
    $sandboxKeys = @(
      'customer_tenant_administration',
      'industry_pack_template_studio',
      'customer_onboarding_data_portability',
      'licensing_billing',
      'release_upgrade_rollback',
      'executive_domain_ai_interfaces'
    )
    $badSandbox = @($report.platform_capabilities | Where-Object { $sandboxKeys -contains $_.key -and $_.status -ne 'SANDBOX' })
    if ($badSandbox.Count -eq 0) {
      Write-Check PASS 'sandbox truthfulness' 'productization and Executive AI remain SANDBOX'
    } else {
      Write-Check FAIL 'sandbox truthfulness' 'productization or Executive AI is overclaimed'
    }

    $nonBlocking = @($report.non_blocking_not_connected_modules)
    $warranty = @($report.modules | Where-Object { $_.module_key -eq 'warranty_care' }) | Select-Object -First 1
    if ($nonBlocking.Count -eq 1 -and $nonBlocking[0] -eq 'warranty_care' -and
        $warranty.status -eq 'NOT CONNECTED' -and
        $warranty.source_type -eq 'NONE' -and
        -not $warranty.data_updated_at -and
        @($warranty.gaps).Count -gt 0) {
      Write-Check PASS 'Warranty/Care exception' 'explicit NOT CONNECTED, source NONE, non-blocking only for V1'
    } else {
      Write-Check FAIL 'Warranty/Care exception' 'must be the sole explicit non-blocking NOT CONNECTED module'
    }

    $gateNames = @('runtime', 'health', 'reconciliation', 'configuration_rollback', 'no_write')
    $allReadinessPass = $true
    foreach ($gateName in $gateNames) {
      $gate = $report.readiness_gates.blocking.$gateName
      if ([string]$gate.status -notin @('PASS', 'PENDING', 'FAIL')) {
        Write-Check FAIL ('readiness gate ' + $gateName) 'invalid status'
        $allReadinessPass = $false
        continue
      }
      if ($gate.status -eq 'PASS') {
        $gateEvidence = @($gate.evidence)
        $gateEvidenceSet = Get-EvidenceSetValidation $gateEvidence $gate.checked_at $candidateCommit $candidateTree $attestationSha256 $attestedAt
        $gateInventoryValid = $expectedManifestArtifacts -and
          (Test-StringSetEqual $expectedManifestArtifacts[$gateName] $gateEvidence)
        if ($gateEvidenceSet.Valid -and $gateInventoryValid) {
          Write-Check PASS ('readiness gate ' + $gateName) 'PASS with current, typed, candidate-bound evidence'
        } else {
          $reason = if (-not $gateInventoryValid) { 'evidence_inventory_mismatch' } else { $gateEvidenceSet.Reason }
          Write-Check FAIL ('readiness gate ' + $gateName) ('PASS evidence invalid: ' + $reason)
          $allReadinessPass = $false
        }
      } else {
        Write-Check WARN ('readiness gate ' + $gateName) ([string]$gate.status)
        $allReadinessPass = $false
      }

      if ($evidenceManifest) {
        $manifestGate = $evidenceManifest.readiness_gates.blocking.$gateName
        $manifestContainsEvidence = $true
        $manifestArtifactsValid = $true
        if ($gate.status -eq 'PASS') {
          $manifestArtifacts = @($manifestGate.artifacts)
          $manifestContainsEvidence = Test-StringSetEqual $manifestArtifacts @($gate.evidence)
          $manifestEvidenceSet = Get-EvidenceSetValidation $manifestArtifacts $manifestGate.checked_at $candidateCommit $candidateTree $attestationSha256 $attestedAt
          $manifestArtifactsValid = $manifestEvidenceSet.Valid
        }
        if ([string]$manifestGate.status -eq [string]$gate.status -and
            [string]$manifestGate.checked_at -eq [string]$gate.checked_at -and
            $manifestContainsEvidence -and $manifestArtifactsValid) {
          Write-Check PASS ('manifest parity ' + $gateName) 'status, timestamp, and PASS evidence inventory agree'
        } else {
          Write-Check FAIL ('manifest parity ' + $gateName) 'module report and evidence manifest disagree'
          $allReadinessPass = $false
        }
      }
    }

    if ($allReadinessPass) {
      if ($report.ready_for_internal_daily_use -eq $true -and $report.acceptance_decision -eq 'APPROVE_INTERNAL') {
        Write-Check PASS 'readiness decision' 'all blocking evidence gates pass and report is approved'
      } else {
        Write-Check FAIL 'readiness decision' 'all gates pass but readiness/decision is inconsistent'
      }
    } else {
      if ($report.ready_for_internal_daily_use -eq $false -and $report.acceptance_decision -ne 'APPROVE_INTERNAL') {
        Write-Check PASS 'readiness decision' ('fail-closed: ready=false, decision=' + $report.acceptance_decision)
      } else {
        Write-Check FAIL 'readiness decision' 'READY/APPROVE_INTERNAL is forbidden while a blocking gate is incomplete'
      }
    }

    $backupGate = $report.readiness_gates.informational.backup_failover
    if ([string]$backupGate.status -notin @('PASS', 'PENDING', 'FAIL')) {
      Write-Check FAIL 'backup/failover evidence' 'invalid informational gate status'
    } elseif ($backupGate.status -eq 'PASS') {
      $backupEvidence = @($backupGate.evidence)
      $backupEvidenceSet = Get-EvidenceSetValidation $backupEvidence $backupGate.checked_at $candidateCommit $candidateTree $attestationSha256 $attestedAt
      if ($backupEvidenceSet.Valid -and
          (Test-StringSetEqual @('evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/backup-failover-verification.json') $backupEvidence)) {
        Write-Check PASS 'backup/failover evidence' 'informational PASS has current candidate-bound evidence'
      } else {
        Write-Check FAIL 'backup/failover evidence' ('PASS claim lacks valid current evidence: ' + $backupEvidenceSet.Reason)
      }
    } else {
      Write-Check WARN 'backup/failover evidence' (([string]$backupGate.status) + '; informational and non-blocking for Founder-local read-only')
    }

    if ($evidenceManifest) {
      $manifestBackupGate = $evidenceManifest.readiness_gates.informational.backup_failover
      if ([string]$manifestBackupGate.status -eq [string]$backupGate.status -and
          [string]$manifestBackupGate.checked_at -eq [string]$backupGate.checked_at -and
          ($backupGate.status -ne 'PASS' -or (Test-StringSetEqual @($manifestBackupGate.artifacts) @($backupGate.evidence))) -and
          $evidenceManifest.decision -eq $report.acceptance_decision) {
        Write-Check PASS 'manifest decision parity' 'informational gate and acceptance decision agree'
      } else {
        Write-Check FAIL 'manifest decision parity' 'manifest and module report disagree'
      }
    }

    $candidateGitValid = $false
    if ($candidateShapeValid -and $head -match '^[0-9a-f]{40}$') {
      $safeRoot = $RepoRoot.Replace('\', '/')
      $resolvedCandidateTree = (& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot rev-parse ($candidateCommit + '^{tree}') 2>$null)
      & git -c ('safe.directory=' + $safeRoot) -C $RepoRoot merge-base --is-ancestor $candidateCommit $head 2>$null
      $candidateIsAncestor = $LASTEXITCODE -eq 0
      $candidateGitValid = $resolvedCandidateTree -eq $candidateTree -and $candidateIsAncestor
    }
    if ($candidateShapeValid -and $candidateGitValid) {
      Write-Check PASS 'frozen report identity' 'clean implementation commit/tree exist and remain an ancestor of the acceptance checkout'
    } else {
      $level = if ($Strict) { 'FAIL' } else { 'WARN' }
      Write-Check $level 'frozen report identity' 'UNSET, not clean, missing, non-ancestor, or tree mismatch; activation remains HOLD'
    }

    if ($allReadinessPass) {
      $attestationValidation = Get-RuntimeEvidenceValidation $attestationReference $candidateCommit $candidateTree $attestationSha256 $attestedAt
      if ($attestationValidation.Valid) {
        Write-Check PASS 'candidate attestation binding' 'all runtime evidence is rooted in the recorded clean implementation candidate'
      } else {
        Write-Check FAIL 'candidate attestation binding' ('invalid candidate attestation: ' + $attestationValidation.Reason)
      }

      if ($Strict) {
        $acceptanceDeltaAllowlist = @(
          'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_FOUNDER_ACCEPTANCE.md',
          'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_MODULE_STATUS.json',
          'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_RUNBOOK.md',
          'docs/internal-live-v1/INTERNAL_LIVE_OPERATION_V1_VERIFICATION_SUMMARY.md',
          'evidence/internal-live-operation-v1/runtime-safety/EVIDENCE_MANIFEST.json'
        )
        $acceptanceDelta = @()
        $acceptanceMergeCommits = @()
        if ($candidateGitValid) {
          $acceptanceDelta = @(& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot diff --name-only ($candidateCommit + '..HEAD') 2>$null | ForEach-Object { $_.Replace('\', '/') })
          $acceptanceMergeCommits = @(& git -c ('safe.directory=' + $safeRoot) -C $RepoRoot rev-list --merges ($candidateCommit + '..HEAD') 2>$null)
        }
        $disallowedAcceptanceDelta = @($acceptanceDelta | Where-Object { $acceptanceDeltaAllowlist -notcontains $_ })
        if ($candidateGitValid -and $disallowedAcceptanceDelta.Count -eq 0 -and $acceptanceMergeCommits.Count -eq 0) {
          Write-Check PASS 'C4 acceptance-only delta' ($acceptanceDelta.Count.ToString() + ' tracked acceptance-record files changed after C3')
        } else {
          Write-Check FAIL 'C4 acceptance-only delta' 'merge commit or code, tests, schema, verifier, generator, or another non-acceptance file changed after C3'
        }
      }
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
    if (-not [string]::IsNullOrWhiteSpace($uri.UserInfo)) {
      throw 'HealthUrl must not contain credentials'
    }
    if ($uri.DnsSafeHost.ToLowerInvariant() -notin @('127.0.0.1', 'localhost', '::1')) {
      throw 'HealthUrl must target loopback only'
    }
    if ($uri.AbsolutePath.TrimEnd('/') -ne '/api/business-os/health') {
      throw 'HealthUrl must target /api/business-os/health exactly'
    }
    if ([string]::IsNullOrWhiteSpace($HealthBearerToken)) {
      throw 'set BUSINESS_OS_HEALTH_BEARER_TOKEN in the current protected process environment'
    }
    $headers = @{ Authorization = ('Bearer ' + $HealthBearerToken) }
    $health = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 10 -MaximumRedirection 0
    $healthTimestamp = Get-CurrentTimestampValidation $health.checked_at
    if (-not $healthTimestamp.Valid) { throw 'health timestamp_invalid_or_stale' }
    $age = ([DateTimeOffset]::UtcNow - $healthTimestamp.Timestamp).TotalMinutes
    $healthSafe = $health.contract_version -eq 'founder_cockpit_health_v1' -and
      $health.ready -eq $true -and
      [string]$health.status -in @('PASS', 'DEGRADED') -and
      $health.scope.status -eq 'PASS' -and
      $health.protections.status -eq 'PASS' -and
      $health.protections.write_enabled -eq $false -and
      $health.protections.direct_database_write_enabled -eq $false -and
      $health.protections.synthetic_fallback_enabled -eq $false -and
      $health.protections.external_send_enabled -eq $false -and
      $age -le 5
    if ($healthSafe) {
      Write-Check PASS 'runtime health' ('Founder Cockpit ready on loopback; clock age=' + [Math]::Round($age, 2) + ' minutes')
    } else {
      Write-Check FAIL 'runtime health' ('unsafe/degraded contract; status=' + $health.status + '; clock age=' + [Math]::Round($age, 2) + ' minutes')
    }
  } catch {
    Write-Check FAIL 'runtime health' ('GET failed: ' + $_.Exception.Message)
  }
} else {
  Write-Check WARN 'runtime health' 'not requested; pass an authenticated loopback /api/business-os/health URL when generating runtime evidence'
}

Write-Host ('Summary: PASS={0} WARN={1} FAIL={2}' -f $script:PassCount, $script:WarnCount, $script:FailCount)
if ($script:FailCount -gt 0) { exit 1 }
exit 0
