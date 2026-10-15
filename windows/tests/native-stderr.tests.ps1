[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\common-windows.ps1')
. (Join-Path $Root 'scripts\theme-windows.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('dreamskin stderr ' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
$savedEnvironment = @{}
foreach ($name in @('NODE_OPTIONS', 'NODE_USE_ENV_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY')) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$nativePreference = Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
$hadNativePreference = $null -ne $nativePreference
$savedNativePreference = if ($hadNativePreference) { $nativePreference.Value } else { $null }

function Assert-StderrTestRejected {
  param([scriptblock]$Action, [string]$Label, [string]$MessagePattern = '.')
  $failure = $null
  try { $null = & $Action } catch { $failure = $_ }
  if ($null -eq $failure) { throw "$Label accepted invalid input with native stderr present." }
  if ($failure.Exception.Message -notmatch $MessagePattern) {
    throw "$Label lost its validation diagnostic: $($failure.Exception.Message)"
  }
}

try {
  $preload = Join-Path $testRoot 'warning preload.cjs'
  # A deterministic warning keeps coverage on Node versions that no longer emit
  # UNDICI-EHPA. The fetch also exercises actual env-proxy initialization without
  # making a network request or relying on a proxy service being available.
  [IO.File]::WriteAllText($preload,
    "process.stderr.write('dreamskin-preload-warning\n'); void fetch('data:text/plain,fixture');",
    [Text.UTF8Encoding]::new($false))
  $env:NODE_OPTIONS = '--require "' + $preload.Replace('\', '/') + '"'
  $env:NODE_USE_ENV_PROXY = '1'
  $env:HTTP_PROXY = 'http://127.0.0.1:9'
  $env:HTTPS_PROXY = 'http://127.0.0.1:9'
  $PSNativeCommandUseErrorActionPreference = $true
  $node = Get-DreamSkinNodeRuntime

  $successScript = Join-Path $testRoot 'success.cjs'
  [IO.File]::WriteAllText($successScript, 'console.log(JSON.stringify({ok:true}));', [Text.UTF8Encoding]::new($false))
  $success = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @($successScript) -SeparateStderr
  if ($success.ExitCode -ne 0 -or -not (($success.Output -join "`n") | ConvertFrom-Json).ok -or
    ($success.ErrorOutput -join "`n") -notmatch 'dreamskin-preload-warning') {
    throw 'A successful native process did not retain clean JSON stdout and separate stderr.'
  }
  if ($ErrorActionPreference -ne 'Stop' -or -not $PSNativeCommandUseErrorActionPreference) {
    throw 'Native invocation changed the caller error preferences.'
  }

  $failureScript = Join-Path $testRoot 'failure.cjs'
  [IO.File]::WriteAllText($failureScript,
    "process.stderr.write('intentional-validator-rejection\n'); process.exitCode = 7;",
    [Text.UTF8Encoding]::new($false))
  $failure = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @($failureScript) -SeparateStderr
  if ($failure.ExitCode -ne 7 -or ($failure.ErrorOutput -join "`n") -notmatch 'intentional-validator-rejection') {
    throw 'Native failure lost its real exit code or stderr diagnostic.'
  }
  if ($ErrorActionPreference -ne 'Stop' -or -not $PSNativeCommandUseErrorActionPreference) {
    throw 'Failed native invocation changed the caller error preferences.'
  }

  # Real initialization/import exercises image metadata, CSS, package JSON,
  # source payload, and final staged payload checks under the same warning.
  $stateRoot = Join-Path $testRoot 'state'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  $packRoot = Join-Path $testRoot 'pack'
  $null = New-Item -ItemType Directory -Path $packRoot
  Copy-Item -LiteralPath (Join-Path $Root 'assets\dream-reference.jpg') -Destination (Join-Path $packRoot 'background.jpg')
  $theme = [ordered]@{
    schemaVersion = 1; id = 'native-stderr-fixture'; name = 'Native stderr fixture'
    image = 'background.jpg'; appearance = 'auto'; quote = 'STDERR REGRESSION'
    art = [ordered]@{ safeArea = 'auto'; taskMode = 'auto' }
  }
  [IO.File]::WriteAllText((Join-Path $packRoot 'theme.json'), ($theme | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
  $cssPath = Join-Path $packRoot 'theme.css'
  [IO.File]::WriteAllText($cssPath, '[data-ds-part="root"] { color: var(--ds-theme-color-text); }', [Text.UTF8Encoding]::new($false))
  $null = Get-DreamSkinValidatedImageMetadata -Path (Join-Path $packRoot 'background.jpg')
  Assert-DreamSkinSafeCssFile -Path $cssPath
  $archive = Join-Path $testRoot 'valid.zip'
  [IO.Compression.ZipFile]::CreateFromDirectory($packRoot, $archive)
  $import = Import-DreamSkinThemeZip -ArchivePath $archive -StateRoot $stateRoot
  if ($import.PackageFormat -cne 'simple' -or $import.SafeCssStatus -cne 'validated' -or
    -not (Test-Path -LiteralPath (Join-Path $import.Path 'theme.json'))) {
    throw 'Valid ZIP import failed under native stderr warnings.'
  }

  $badImage = Join-Path $testRoot 'invalid.jpg'
  [IO.File]::WriteAllText($badImage, 'not an image', [Text.UTF8Encoding]::new($false))
  Assert-StderrTestRejected -Label 'Image metadata' -Action { Get-DreamSkinValidatedImageMetadata -Path $badImage } -MessagePattern 'Image metadata'
  [IO.File]::WriteAllText($cssPath, 'body { color: red; }', [Text.UTF8Encoding]::new($false))
  Assert-StderrTestRejected -Label 'Safe CSS' -Action { Assert-DreamSkinSafeCssFile -Path $cssPath } -MessagePattern 'selector|Safe CSS|scope'
  $invalidArchive = Join-Path $testRoot 'invalid.zip'
  [IO.Compression.ZipFile]::CreateFromDirectory($packRoot, $invalidArchive)
  Assert-StderrTestRejected -Label 'ZIP package' -Action {
    Import-DreamSkinThemeZip -ArchivePath $invalidArchive -StateRoot $stateRoot
  } -MessagePattern 'Theme package validation failed'

  $themeSource = [IO.File]::ReadAllText((Join-Path $Root 'scripts\theme-windows.ps1'))
  if ($themeSource -match '(?m)&\s*\$node\.Path[^\r\n]*(?:`\r?\n[^\r\n]*)?2>&1') {
    throw 'Theme validators still invoke Node with raw merged stderr under Stop preference.'
  }
  Write-Host 'Native stderr regression tests passed.'
} finally {
  foreach ($name in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
  if ($hadNativePreference) { $PSNativeCommandUseErrorActionPreference = $savedNativePreference }
  else { Remove-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue }
  # testRoot was created above as an absolute unique child of the temp directory.
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
