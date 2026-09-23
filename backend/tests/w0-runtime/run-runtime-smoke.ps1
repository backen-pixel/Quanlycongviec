param(
  [Parameter(Mandatory=$true)][string]$DependencyBackend,
  [string]$EvidenceRoot = (Join-Path $env:LOCALAPPDATA 'BusinessAIOS/w0-runtime-evidence')
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$deps = (Resolve-Path $DependencyBackend).Path
$baseline = '48b6735669d5b2b9e0544d87801d1504e1b75e22'
$expected = [ordered]@{
  'backend/src/routes/workTasks.js' = 'e501e27641a89f76ce45252b08c1955f717b16145b7c016ff006699f1134f144'
  'backend/src/helpers/unifiedTasksQuery.js' = '1b764006a1e544ea0f7e0f423ce06b2549838ab729af0e2e3729132d4e5671a2'
  'backend/src/middleware/auth.js' = '24e429610b942cd6ca16e376dfa2a9c86b8cc2df296ec36d0211754a00eabb6c'
  'backend/src/middleware/tenantGate.js' = '3f4d82161843c14f28c252bf54c14e074eb7908c829130eb2faeda17185d63cd'
  'backend/src/helpers/tenantScope.js' = '06eed21a0a751ec84a0e67ce8a6fb3b5a2c2178b2e93225ea39426a615fc7adf'
  'backend/src/helpers/adminRole.js' = '124c567eb16c99bcc9c2ebaa2a7c380b6ecf893b1af26a022c441225f51a9b43'
  'backend/src/helpers/crmTaskAttachmentCounts.js' = '5ee2bcde741c41b72ea0c3e88be79eb3a9b4a8b6cfd4e07030d20a4b920920e6'
}
foreach ($f in $expected.Keys) {
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $repo $f)).Hash.ToLower()
  if ($actual -ne $expected[$f]) { throw "Candidate source changed: $f. Review and create a new source binding before testing." }
}
$head = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve candidate commit' }
& git -C $repo merge-base --is-ancestor $baseline HEAD
if ($LASTEXITCODE -ne 0) { throw 'Worktree is not descended from the reviewed candidate' }
$branch = (& git -C $repo branch --show-current).Trim()
if ($branch -ne 'codex/w0-summary-fix-20260923') { throw 'Unexpected worktree branch' }
$tree = (& git -C $repo rev-parse 'HEAD^{tree}').Trim()
$status = @(& git -C $repo status --porcelain)
if (!(Test-Path (Join-Path $deps 'node_modules/express/package.json'))) { throw 'DependencyBackend must contain the approved existing node_modules' }
$runId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$out = Join-Path ([IO.Path]::GetFullPath($EvidenceRoot)) $runId
New-Item -ItemType Directory -Path $out -Force | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$meta = [ordered]@{
  contract='bos-w0-http-fixture-smoke-v1'; run_id=$runId; baseline_commit=$baseline;
  repository_head=$head; repository_tree=$tree; branch=$branch; git_status=$status;
  repository_root=$repo; dependency_backend=$deps; started_at=[DateTime]::UtcNow.ToString('o');
  source_sha256=$expected; persistence='SYNTHETIC_HTTP_FIXTURE_NOT_SQL';
  source_binding='Exact Windows file hashes of seven candidate application modules; ancestry baseline is provenance only, current HEAD and working status are recorded';
  isolation='Fresh process environment; Node filesystem/child-process permissions; explicit VM imports and loopback HTTP origins. Not an OS network sandbox.'
}
[IO.File]::WriteAllText((Join-Path $out 'launch.json'), ($meta | ConvertTo-Json -Depth 8), $utf8)
$node = (Get-Command node.exe -ErrorAction Stop).Source
$runner = Join-Path $PSScriptRoot 'runtime-smoke.cjs'
$argsList = @('--permission', "--allow-fs-read=$repo", "--allow-fs-read=$deps/node_modules", "--allow-fs-read=$out", "--allow-fs-write=$out", $runner, '--repo', $repo, '--deps', $deps, '--output', $out)
foreach ($arg in $argsList) { if ($arg.Contains('"') -or $arg.Contains("`n")) { throw 'Invalid argument character' } }
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $node
$psi.Arguments = (($argsList | ForEach-Object { '"' + $_ + '"' }) -join ' ')
$psi.WorkingDirectory = $repo
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.EnvironmentVariables.Clear()
foreach ($key in @('SystemRoot','WINDIR','PATH','TEMP','TMP')) {
  $value = [Environment]::GetEnvironmentVariable($key)
  if ($value) { $psi.EnvironmentVariables[$key] = $value }
}
$psi.EnvironmentVariables['NODE_ENV'] = 'test'
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
[void]$process.Start()
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$timedOut = !$process.WaitForExit(90000)
if ($timedOut) { $process.Kill(); $process.WaitForExit() }
[IO.File]::WriteAllText((Join-Path $out 'stdout.log'), $stdout.Result, $utf8)
[IO.File]::WriteAllText((Join-Path $out 'stderr.log'), $stderr.Result, $utf8)
$finish = [ordered]@{finished_at=[DateTime]::UtcNow.ToString('o');pid=$process.Id;exit_code=$process.ExitCode;timed_out=$timedOut;process_exited=$process.HasExited}
[IO.File]::WriteAllText((Join-Path $out 'finish.json'), ($finish | ConvertTo-Json), $utf8)
Write-Output "Evidence: $out"
Write-Output "Exit code: $($process.ExitCode); timed out: $timedOut"
if (Test-Path (Join-Path $out 'runtime-smoke.json')) {
  $result = Get-Content -Raw -Encoding UTF8 (Join-Path $out 'runtime-smoke.json') | ConvertFrom-Json
  [PSCustomObject]@{result=$result.result;passed=$result.tests_passed;failed=$result.tests_failed;fatal=$result.fatal;cleanup=$result.cleanup} | ConvertTo-Json -Depth 5
  $result.tests | Where-Object { $_.result -eq 'FAIL' } | ConvertTo-Json -Depth 5
}
if ($timedOut) { exit 124 }
exit $process.ExitCode
