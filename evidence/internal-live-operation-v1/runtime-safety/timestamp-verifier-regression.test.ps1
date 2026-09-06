[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $repositoryDir 'scripts/verify-internal-live-v1.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'TIMESTAMP_VERIFIER_PARSE_FAILED' }
# Load the production function definitions only: never execute the verifier's
# top-level Git, health or acceptance workflow from this isolated regression.
$functions = @($ast.FindAll({ param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst]
}, $false))
foreach ($function in $functions) { . ([scriptblock]::Create($function.Extent.Text)) }
$script:EvidenceMaxAgeHours = 24
$script:EvidenceFutureSkewMinutes = 0
$script:checks = 0
function Assert-Test([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw ('TIMESTAMP_REGRESSION_FAILED:' + $Name) }
  $script:checks++
}

$utc = [DateTime]::UtcNow.AddMinutes(-2)
$utcText = $utc.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
$json = '{"checked_at":"' + $utcText + '"}'
$decoded = $json | ConvertFrom-Json
Assert-Test (Get-CurrentTimestampValidation $utcText).Valid 'raw_utc'
Assert-Test (Get-CurrentTimestampValidation $decoded.checked_at).Valid 'reproduced_json_utc_type'
Assert-Test (Get-CurrentTimestampValidation $utc).Valid 'typed_utc_datetime'
Assert-Test (Get-CurrentTimestampValidation ([DateTimeOffset]::new($utc))).Valid 'typed_utc_datetimeoffset'
Assert-Test ((Get-CurrentTimestampValidation $utc).Timestamp.UtcDateTime.Ticks -eq $utc.Ticks) 'subsecond_ticks_preserved'
Assert-Test (Get-CurrentTimestampValidation ($utcText.Replace('Z', '+00:00'))).Valid 'explicit_zero_offset'
foreach ($suffix in @('Z', '+00:00', '+07:00')) {
  $literal = $utcText.Replace('Z', $suffix)
  $parsed = ConvertFrom-VerifierJson ('{"checked_at":"' + $literal + '","optional":null}')
  Assert-Test ($parsed.checked_at -is [string] -and $parsed.checked_at -ceq $literal) 'json_source_offset_and_precision_preserved'
  Assert-Test ($null -eq $parsed.optional) 'json_null_preserved'
  Assert-Test ((Get-CurrentTimestampValidation $parsed.checked_at).Valid -eq ($suffix -ne '+07:00')) 'json_utc_only'
}

foreach ($invalid in @($null, '', 'invalid', '2026-02-30T00:00:00Z', '2026-09-06',
  $utcText.TrimEnd('Z'), $utcText.Replace('Z', '+07:00'), $utcText.Replace('Z', '-05:00'),
  [DateTime]::SpecifyKind($utc, [DateTimeKind]::Unspecified),
  [DateTime]::SpecifyKind($utc, [DateTimeKind]::Local),
  ([DateTimeOffset]::new($utc)).ToOffset([TimeSpan]::FromHours(7)))) {
  Assert-Test (-not (Get-CurrentTimestampValidation $invalid).Valid) 'invalid_or_non_utc_denied'
}
Assert-Test (Get-CurrentTimestampValidation ([DateTime]::UtcNow.AddHours(-23))).Valid 'inside_24h'
Assert-Test (-not (Get-CurrentTimestampValidation ([DateTime]::UtcNow.AddHours(-25))).Valid) 'stale_denied'
Assert-Test (-not (Get-CurrentTimestampValidation ([DateTime]::UtcNow.AddMinutes(1))).Valid) 'future_denied'
$priorCulture = [Threading.Thread]::CurrentThread.CurrentCulture
try {
  foreach ($culture in @('en-US', 'vi-VN', 'fr-FR')) {
    [Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo($culture)
    Assert-Test ((Get-CurrentTimestampValidation $utcText).Timestamp.UtcDateTime.Ticks -eq $utc.Ticks) 'culture_independent_string'
    Assert-Test ((Get-CurrentTimestampValidation $utc).Timestamp.UtcDateTime.Ticks -eq $utc.Ticks) 'culture_independent_datetime'
  }
} finally { [Threading.Thread]::CurrentThread.CurrentCulture = $priorCulture }

$fixtureParent = Join-Path $repositoryDir 'backend/.runtime'
[IO.Directory]::CreateDirectory($fixtureParent) | Out-Null
$fixtureRoot = Join-Path $fixtureParent ('timestamp-regression-' + [Guid]::NewGuid().ToString('N'))
$prefix = 'evidence/internal-live-operation-v1/runtime-safety/runtime/candidates/c3-r2/'
$fixtureDir = Join-Path $fixtureRoot $prefix
[IO.Directory]::CreateDirectory($fixtureDir) | Out-Null
$RepoRoot = $fixtureRoot
$commit = 'a' * 40
$tree = 'b' * 40
$hash = 'c' * 64
$attestedAt = [DateTime]::UtcNow.AddMinutes(-3)
$checkedAt = $attestedAt.AddSeconds(1).AddTicks(1234)
$reference = $prefix + 'lifecycle-runtime-verification.json'
$artifact = [ordered]@{
  schema_version = '1.0.0'
  evidence_type = 'FOUNDER_LOCAL_LIFECYCLE_RUNTIME_VERIFICATION'
  checked_at = $checkedAt.ToString('o')
  finished_at = $checkedAt.AddSeconds(1).ToString('o')
  candidate = @{ commit = $commit; tree = $tree; candidate_attestation_sha256 = $hash; attested_at = $attestedAt.ToString('o') }
  result = 'PASS'
  clean_restart_verified = $true
  cycles = @(@{ run_ref = '1' * 16 }, @{ run_ref = '2' * 16 })
  security = @{ credentials_recorded = $false; environment_file_path_recorded = $false; raw_business_values_recorded = $false; canonical_writes_enabled = $false }
}
foreach ($cycle in $artifact.cycles) {
  $cycle.result = 'PASS'
  foreach ($key in @('candidate_bound', 'loopback_only', 'operational_writes_disabled',
    'owned_launcher_and_child_attested', 'stop_succeeded', 'repeated_stop_succeeded',
    'exact_processes_dead', 'port_closed', 'pid_and_lock_absent')) { $cycle[$key] = $true }
  $cycle.manual_cleanup_used = $false
}
function Write-Fixture {
  [IO.File]::WriteAllText((Join-Path $fixtureRoot $reference), ($artifact | ConvertTo-Json -Depth 10))
}
try {
  Write-Fixture
  Assert-Test (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt).Valid 'artifact_typed_attestation'
  Assert-Test (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt.ToString('o')).Valid 'artifact_string_attestation'
  $artifact.candidate.attested_at = $attestedAt.ToString('o').Replace('Z', '+00:00')
  Write-Fixture
  Assert-Test (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt).Valid 'equivalent_utc_attestation_ticks'
  $artifact.candidate.attested_at = $attestedAt.ToString('o')
  Write-Fixture
  Assert-Test (-not (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt.AddTicks(1)).Valid) 'attestation_one_tick_mismatch'
  Assert-Test (-not (Get-RuntimeEvidenceValidation $reference ('d' * 40) $tree $hash $attestedAt).Valid) 'cross_candidate_denied'
  Assert-Test (-not (Get-RuntimeEvidenceValidation $reference $commit $tree ('d' * 64) $attestedAt).Valid) 'wrong_attestation_hash_denied'
  Assert-Test (Get-EvidenceSetValidation @($reference) $checkedAt $commit $tree $hash $attestedAt).Valid 'gate_exact_latest_timestamp'
  Assert-Test (-not (Get-EvidenceSetValidation @($reference) $checkedAt.AddTicks(1) $commit $tree $hash $attestedAt).Valid) 'gate_one_tick_mismatch'
  $artifact.checked_at = $attestedAt.AddTicks(-1).ToString('o')
  Write-Fixture
  Assert-Test (-not (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt).Valid) 'artifact_before_attestation_denied'
  $artifact.checked_at = [DateTime]::UtcNow.AddMinutes(1).ToString('o')
  Write-Fixture
  Assert-Test (-not (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt).Valid) 'future_artifact_denied'
  $artifact.checked_at = $checkedAt.ToString('o')
  $artifact.cycles[0].port_closed = $false
  Write-Fixture
  Assert-Test (-not (Get-RuntimeEvidenceValidation $reference $commit $tree $hash $attestedAt).Valid) 'lifecycle_controls_not_weakened'
} finally {
  $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
  $resolvedParent = [IO.Path]::GetFullPath($fixtureParent).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not $resolvedFixture.StartsWith($resolvedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolvedFixture) -notmatch '^timestamp-regression-[a-f0-9]{32}$') { throw 'UNSAFE_TEST_CLEANUP' }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
[ordered]@{ result = 'PASS'; checks_passed = $script:checks; powershell_version = $PSVersionTable.PSVersion.ToString(); real_data_used = $false } | ConvertTo-Json -Compress
