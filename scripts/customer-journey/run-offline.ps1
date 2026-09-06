[CmdletBinding()]
param(
  [ValidateSet('test', 'build', 'browser', 'preview', 'verify')]
  [string]$Mode = 'verify',
  [ValidateRange(1024, 65535)]
  [int]$Port = 4179
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$preservedCommit = 'ed3b64c0e64909a18c8d58fca07e3da4e593e565'
$preservedTree = 'adf60dad69f4ab00462d5c2f0b7833c644b25ce1'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd([IO.Path]::DirectorySeparatorChar)
$runtimeRoot = Join-Path $repositoryRoot 'evidence/internal-live-operation-v1/runtime-safety/runtime'
$stagingParent = Join-Path $runtimeRoot 'customer-journey-staging'
$candidateParent = Join-Path $runtimeRoot 'candidates'
$preload = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'isolation-preload.cjs'))
$runner = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'offline-runner.cjs'))

function Test-ContainedPath([string]$Parent, [string]$Target, [bool]$AllowSame = $true) {
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $targetPath = [IO.Path]::GetFullPath($Target).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if ($targetPath.Equals($parentPath, [StringComparison]::OrdinalIgnoreCase)) { return $AllowSame }
  return $targetPath.StartsWith($parentPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparseChain([string]$Boundary, [string]$Target, [bool]$RequireLeaf = $false) {
  $boundaryPath = [IO.Path]::GetFullPath($Boundary).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $targetPath = [IO.Path]::GetFullPath($Target).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not (Test-ContainedPath $boundaryPath $targetPath $true)) { throw 'JOURNEY_PATH_BOUNDARY_DENIED' }
  if (-not (Test-Path -LiteralPath $boundaryPath)) { throw 'JOURNEY_PATH_BOUNDARY_MISSING' }
  $boundaryItem = Get-Item -LiteralPath $boundaryPath -Force
  if (($boundaryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'JOURNEY_REPARSE_PATH_DENIED' }
  $relative = [IO.Path]::GetRelativePath($boundaryPath, $targetPath)
  $current = $boundaryPath
  foreach ($part in @($relative -split '[\\/]' | Where-Object { $_ -and $_ -ne '.' })) {
    $current = Join-Path $current $part
    if (-not (Test-Path -LiteralPath $current)) { break }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'JOURNEY_REPARSE_PATH_DENIED' }
  }
  if ($RequireLeaf -and -not (Test-Path -LiteralPath $targetPath)) { throw 'JOURNEY_REQUIRED_PATH_MISSING' }
}

function Assert-RegularFile([string]$File) {
  if (-not [IO.Path]::IsPathFullyQualified($File) -or -not (Test-Path -LiteralPath $File -PathType Leaf)) { throw 'JOURNEY_EXECUTABLE_OR_SCRIPT_MISSING' }
  $item = Get-Item -LiteralPath $File -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'JOURNEY_REPARSE_FILE_DENIED' }
}

function Invoke-ReadOnlyGit([string[]]$Arguments) {
  $output = & $script:gitExecutable --no-optional-locks -C $repositoryRoot @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'JOURNEY_GIT_READ_FAILED' }
  return (@($output) -join "`n").Trim()
}

function Get-TreeFingerprint([string]$Directory) {
  if (-not (Test-Path -LiteralPath $Directory)) { return 'ABSENT' }
  Assert-NoReparseChain $repositoryRoot $Directory $true
  $records = foreach ($file in @(Get-ChildItem -LiteralPath $Directory -Recurse -Force -File | Sort-Object FullName)) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'JOURNEY_PROTECTED_TREE_LINK_DENIED' }
    $relative = [IO.Path]::GetRelativePath($Directory, $file.FullName).Replace('\', '/')
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$relative`0$($file.Length)`0$hash"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes((@($records) -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToHexString($sha.ComputeHash($bytes)).ToLowerInvariant() }
  finally { $sha.Dispose() }
}

Assert-NoReparseChain $repositoryRoot $repositoryRoot $true
Assert-NoReparseChain $repositoryRoot $PSScriptRoot $true
Assert-RegularFile $preload
Assert-RegularFile $runner

$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Where-Object {
  (Get-Item -LiteralPath $_.Source).VersionInfo.FileMajorPart -ge 24
} | Select-Object -First 1
if (-not $nodeCommand) { throw 'JOURNEY_NODE_24_OR_NEWER_REQUIRED' }
$nodeExecutable = [IO.Path]::GetFullPath($nodeCommand.Source)
$script:gitExecutable = [IO.Path]::GetFullPath((Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source)
Assert-RegularFile $nodeExecutable
Assert-RegularFile $script:gitExecutable

$actualGitRoot = [IO.Path]::GetFullPath((Invoke-ReadOnlyGit @('rev-parse', '--show-toplevel'))).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not $actualGitRoot.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'JOURNEY_WORKTREE_MISMATCH' }
if ((Invoke-ReadOnlyGit @('show', '-s', '--format=%T', $preservedCommit)) -ne $preservedTree) { throw 'JOURNEY_C3_R2_OBJECT_MISMATCH' }
$headCommit = Invoke-ReadOnlyGit @('rev-parse', 'HEAD')
$headTree = Invoke-ReadOnlyGit @('show', '-s', '--format=%T', 'HEAD')
if ($headCommit -notmatch '^[0-9a-f]{40}$' -or $headTree -notmatch '^[0-9a-f]{40}$') { throw 'JOURNEY_HEAD_IDENTITY_INVALID' }
$clean = -not [bool](Invoke-ReadOnlyGit @('status', '--porcelain', '--untracked-files=all'))

Assert-NoReparseChain $repositoryRoot $stagingParent $false
[IO.Directory]::CreateDirectory($stagingParent) | Out-Null
Assert-NoReparseChain $repositoryRoot $stagingParent $true
$runRoot = Join-Path $stagingParent ('run-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($runRoot) | Out-Null
Assert-NoReparseChain $repositoryRoot $runRoot $true
$temporaryRoot = Join-Path $runRoot 'temp'
[IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null

$evidenceRoot = $null
if ($clean -and $headCommit -ne $preservedCommit) {
  Assert-NoReparseChain $repositoryRoot $candidateParent $true
  $evidenceRoot = Join-Path $candidateParent ('customer-journey-' + $headCommit.Substring(0, 12))
  if (Test-Path -LiteralPath $evidenceRoot) {
    if ($Mode -ne 'preview') { throw 'JOURNEY_EVIDENCE_ROOT_ALREADY_EXISTS' }
  } else {
    if ($Mode -eq 'preview') { throw 'JOURNEY_PREVIEW_EVIDENCE_MISSING' }
    [IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
  }
  Assert-NoReparseChain $repositoryRoot $evidenceRoot $true
}

$esbuildExecutable = Join-Path $repositoryRoot 'frontend/node_modules/@esbuild/win32-x64/esbuild.exe'
Assert-NoReparseChain $repositoryRoot $esbuildExecutable $true
Assert-RegularFile $esbuildExecutable
$edgeExecutable = $null
foreach ($candidate in @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)) {
  if (Test-Path -LiteralPath $candidate -PathType Leaf) { $edgeExecutable = [IO.Path]::GetFullPath($candidate); Assert-RegularFile $edgeExecutable; break }
}

$protectedFrontend = Join-Path $repositoryRoot 'frontend/dist'
$protectedC3 = Join-Path $candidateParent 'c3-r2'
$frontendBefore = Get-TreeFingerprint $protectedFrontend
$c3Before = Get-TreeFingerprint $protectedC3

$processInfo = [Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $nodeExecutable
$processInfo.WorkingDirectory = $repositoryRoot
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$processInfo.ArgumentList.Add('--require')
$processInfo.ArgumentList.Add($preload)
$processInfo.ArgumentList.Add($runner)
$processInfo.ArgumentList.Add($Mode)
$processInfo.ArgumentList.Add([string]$Port)
$processInfo.EnvironmentVariables.Clear()
$systemRoot = [Environment]::GetEnvironmentVariable('SystemRoot')
if (-not $systemRoot) { throw 'JOURNEY_SYSTEM_ROOT_MISSING' }
$processInfo.EnvironmentVariables['SystemRoot'] = $systemRoot
$processInfo.EnvironmentVariables['WINDIR'] = $systemRoot
$processInfo.EnvironmentVariables['ComSpec'] = Join-Path $systemRoot 'System32/cmd.exe'
$processInfo.EnvironmentVariables['PATHEXT'] = '.COM;.EXE;.BAT;.CMD'
$minimalPath = @((Split-Path -Parent $nodeExecutable), (Split-Path -Parent $script:gitExecutable), (Join-Path $systemRoot 'System32')) | Select-Object -Unique
$processInfo.EnvironmentVariables['PATH'] = $minimalPath -join [IO.Path]::PathSeparator
$processInfo.EnvironmentVariables['TEMP'] = $temporaryRoot
$processInfo.EnvironmentVariables['TMP'] = $temporaryRoot
$processInfo.EnvironmentVariables['TMPDIR'] = $temporaryRoot
$processInfo.EnvironmentVariables['XDG_CACHE_HOME'] = $temporaryRoot
$processInfo.EnvironmentVariables['XDG_CONFIG_HOME'] = $temporaryRoot
$processInfo.EnvironmentVariables['APPDATA'] = $temporaryRoot
$processInfo.EnvironmentVariables['LOCALAPPDATA'] = $temporaryRoot
$processInfo.EnvironmentVariables['NODE_DISABLE_COMPILE_CACHE'] = '1'
$processInfo.EnvironmentVariables['GIT_OPTIONAL_LOCKS'] = '0'
$processInfo.EnvironmentVariables['JOURNEY_OFFLINE_ISOLATED'] = '1'
$processInfo.EnvironmentVariables['JOURNEY_OFFLINE_RUN_ROOT'] = $runRoot
$processInfo.EnvironmentVariables['JOURNEY_OFFLINE_PORT'] = [string]$Port
$processInfo.EnvironmentVariables['JOURNEY_NODE_EXECUTABLE'] = $nodeExecutable
$processInfo.EnvironmentVariables['JOURNEY_GIT_EXECUTABLE'] = $script:gitExecutable
$processInfo.EnvironmentVariables['JOURNEY_ESBUILD_EXECUTABLE'] = $esbuildExecutable
$processInfo.EnvironmentVariables['ESBUILD_BINARY_PATH'] = $esbuildExecutable
$processInfo.EnvironmentVariables['JOURNEY_CANDIDATE_COMMIT'] = $headCommit
$processInfo.EnvironmentVariables['JOURNEY_CANDIDATE_TREE'] = $headTree
if ($evidenceRoot) { $processInfo.EnvironmentVariables['JOURNEY_OFFLINE_EVIDENCE_ROOT'] = $evidenceRoot }
if ($edgeExecutable) { $processInfo.EnvironmentVariables['JOURNEY_EDGE_EXECUTABLE'] = $edgeExecutable }
$processInfo.EnvironmentVariables['NODE_ENV'] = 'test'
$processInfo.EnvironmentVariables['RUNTIME_PROFILE'] = 'test'
$processInfo.EnvironmentVariables['SUPABASE_HEALTH_CHECK_DISABLED'] = '1'
$processInfo.EnvironmentVariables['REDIS_DISABLED'] = '1'
$processInfo.EnvironmentVariables['PG_POOL_DISABLED'] = '1'
$processInfo.EnvironmentVariables['FOUNDER_ADVISORY_CONFIG_ENABLED'] = '0'
$processInfo.EnvironmentVariables['BACKGROUND_WRITE_JOBS_ENABLED'] = '0'
$processInfo.EnvironmentVariables['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD'] = '1'

$timeoutSeconds = switch ($Mode) {
  'build' { 300 }
  'browser' { 300 }
  'preview' { 930 }
  'test' { 1200 }
  default { 1800 }
}
$exitCode = 1
$verificationProcess = $null
try {
  $verificationProcess = [Diagnostics.Process]::Start($processInfo)
  $outputLineTask = $verificationProcess.StandardOutput.ReadLineAsync()
  $errorTask = $verificationProcess.StandardError.ReadToEndAsync()
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
  while (-not $verificationProcess.HasExited) {
    while ($outputLineTask -and $outputLineTask.IsCompleted) {
      $line = $outputLineTask.GetAwaiter().GetResult()
      if ($null -eq $line) { $outputLineTask = $null; break }
      Write-Output $line
      $outputLineTask = $verificationProcess.StandardOutput.ReadLineAsync()
    }
    if ([DateTime]::UtcNow -ge $deadline) {
      try { $verificationProcess.Kill($true) } catch { try { $verificationProcess.Kill() } catch { } }
      if (-not $verificationProcess.WaitForExit(5000)) { throw 'JOURNEY_OWNED_PROCESS_KILL_NOT_CONFIRMED' }
      throw 'JOURNEY_OFFLINE_TIMEOUT'
    }
    $null = $verificationProcess.WaitForExit(200)
  }
  $exitCode = $verificationProcess.ExitCode
  if ($outputLineTask) {
    $line = $outputLineTask.GetAwaiter().GetResult()
    if ($null -ne $line) { Write-Output $line }
  }
  $standardOutput = $verificationProcess.StandardOutput.ReadToEnd()
  $standardError = $errorTask.GetAwaiter().GetResult()
  if ($standardOutput) { Write-Output $standardOutput }
  if ($standardError) { Write-Output $standardError }
} finally {
  if ($verificationProcess -and -not $verificationProcess.HasExited) {
    $verificationProcess.Kill($true)
    if (-not $verificationProcess.WaitForExit(5000)) { throw 'JOURNEY_OWNED_PROCESS_EXIT_NOT_CONFIRMED' }
  }
  if ((Get-TreeFingerprint $protectedFrontend) -ne $frontendBefore) { throw 'JOURNEY_FRONTEND_DIST_CHANGED' }
  if ((Get-TreeFingerprint $protectedC3) -ne $c3Before) { throw 'JOURNEY_C3_R2_HISTORY_CHANGED' }
  if ($verificationProcess) { $verificationProcess.Dispose() }
}
exit $exitCode
