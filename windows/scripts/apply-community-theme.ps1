[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$Uri
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

function Show-DreamSkinCommunityMessage {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('Info', 'Error')][string]$Kind = 'Info'
  )
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  $icon = if ($Kind -eq 'Error') {
    [System.Windows.Forms.MessageBoxIcon]::Error
  } else {
    [System.Windows.Forms.MessageBoxIcon]::Information
  }
  [void][System.Windows.Forms.MessageBox]::Show(
    $Message,
    'Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    $icon
  )
}

function Format-DreamSkinCommunitySuccessMessage {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Name,
    [string]$CleanupWarning = ''
  )
  $message = "主题「$Name」已通过下载、SHA-256、主题包与 Safe CSS 校验，并已应用到 Codex。"
  if (-not [string]::IsNullOrWhiteSpace($CleanupWarning)) {
    $message += "`r`n`r`n主题已成功应用，但旧备份目录未能自动清理；新主题不会因此回滚。请稍后重启客户端并查看日志。"
  }
  return $message
}

function Confirm-DreamSkinCommunityApply {
  param([Parameter(Mandatory = $true)][object]$Metadata)
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  $sizeMiB = [Math]::Round($Metadata.PackageBytes / 1MB, 2)
  $message = @"
从 DreamSkin.cc 下载并应用“$($Metadata.Name)”？

作者：$($Metadata.AuthorDisplayName)
版本：$($Metadata.Version) · $sizeMiB MiB
SHA-256：$($Metadata.PackageSha256)

客户端只会连接固定官方 API，并重新校验下载大小、SHA-256、ZIP、清单和 Safe CSS。应用时 Codex 可能重启，未保存的输入可能丢失。主题内容不会作为命令执行。
"@
  $choice = [System.Windows.Forms.MessageBox]::Show(
    $message.Trim(),
    '确认一键换肤',
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question,
    [System.Windows.Forms.MessageBoxDefaultButton]::Button2
  )
  return $choice -eq [System.Windows.Forms.DialogResult]::Yes
}

function New-DreamSkinCommunityHttpRequest {
  param(
    [Parameter(Mandatory = $true)][string]$RequestUri,
    [Parameter(Mandatory = $true)][string]$Accept
  )
  if ($RequestUri -cnotmatch `
    '\Ahttps://api\.dreamskin\.cc/v1/themes/ver_[a-z0-9]{8,64}(?:/download)?\z') {
    throw 'Community theme network requests are restricted to the fixed DreamSkin.cc API.'
  }
  $request = [System.Net.HttpWebRequest][System.Net.WebRequest]::Create(
    [System.Uri]::new($RequestUri, [System.UriKind]::Absolute)
  )
  if ($request.RequestUri.AbsoluteUri -cne $RequestUri) {
    throw 'The community theme API request URI was not canonical.'
  }
  $request.Method = 'GET'
  $request.Accept = $Accept
  $request.UserAgent = 'CodexDreamSkin/1 community-theme-apply'
  $request.AllowAutoRedirect = $false
  $request.AutomaticDecompression = [System.Net.DecompressionMethods]::None
  $request.CachePolicy = [System.Net.Cache.RequestCachePolicy]::new(
    [System.Net.Cache.RequestCacheLevel]::NoCacheNoStore
  )
  $request.KeepAlive = $false
  $request.Headers['Accept-Encoding'] = 'identity'
  $request.Timeout = 20000
  $request.ReadWriteTimeout = 60000
  return $request
}

function Get-DreamSkinCommunityHttpResponse {
  param(
    [Parameter(Mandatory = $true)][string]$RequestUri,
    [Parameter(Mandatory = $true)][string]$Accept
  )
  $request = New-DreamSkinCommunityHttpRequest -RequestUri $RequestUri -Accept $Accept
  $response = $null
  try {
    $response = [System.Net.HttpWebResponse]$request.GetResponse()
  } catch {
    if ($_.Exception -is [System.Net.WebException] -and $null -ne $_.Exception.Response) {
      $_.Exception.Response.Dispose()
    }
    throw 'DreamSkin.cc did not return the requested approved theme without a redirect.'
  }
  if ([int]$response.StatusCode -ne 200 -or
    $response.ResponseUri.AbsoluteUri -cne $RequestUri) {
    $response.Dispose()
    throw 'DreamSkin.cc returned an unexpected status or redirect.'
  }
  return $response
}

function Read-DreamSkinCommunityMetadataResponse {
  param(
    [Parameter(Mandatory = $true)][System.Net.HttpWebResponse]$Response,
    [Parameter(Mandatory = $true)][string]$ExpectedVersionId
  )
  $contentType = ("$($Response.ContentType)" -split ';', 2)[0].Trim().ToLowerInvariant()
  if ($contentType -cne 'application/json') {
    throw 'DreamSkin.cc theme metadata did not use application/json.'
  }
  if ($Response.ContentLength -gt $script:DreamSkinMaxCommunityMetadataBytes) {
    throw 'DreamSkin.cc theme metadata exceeds the 64 KiB limit.'
  }
  $stream = $Response.GetResponseStream()
  $memory = [System.IO.MemoryStream]::new()
  try {
    $buffer = New-Object byte[] 8192
    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      if ($memory.Length + $read -gt $script:DreamSkinMaxCommunityMetadataBytes) {
        throw 'DreamSkin.cc theme metadata exceeds the 64 KiB limit.'
      }
      $memory.Write($buffer, 0, $read)
    }
    $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
    try { $json = $strictUtf8.GetString($memory.ToArray()) } catch {
      throw 'DreamSkin.cc theme metadata is not valid UTF-8.'
    }
  } finally {
    $memory.Dispose()
    $stream.Dispose()
  }
  return ConvertFrom-DreamSkinCommunityThemeMetadata -Json $json `
    -ExpectedVersionId $ExpectedVersionId
}

function Save-DreamSkinCommunityDownload {
  param(
    [Parameter(Mandatory = $true)][System.Net.HttpWebResponse]$Response,
    [Parameter(Mandatory = $true)][object]$Metadata,
    [Parameter(Mandatory = $true)][string]$ArchivePath
  )
  $contentType = ("$($Response.ContentType)" -split ';', 2)[0].Trim().ToLowerInvariant()
  if ($contentType -cne 'application/zip') {
    throw 'DreamSkin.cc theme download did not use application/zip.'
  }
  if ($Response.ContentLength -ge 0 -and $Response.ContentLength -ne $Metadata.PackageBytes) {
    throw 'DreamSkin.cc theme download Content-Length does not match approved metadata.'
  }
  $input = $Response.GetResponseStream()
  $output = $null
  $written = [int64]0
  try {
    $output = [System.IO.File]::Open(
      $ArchivePath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    $buffer = New-Object byte[] 65536
    while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $written += $read
      if ($written -gt $Metadata.PackageBytes -or
        $written -gt $script:DreamSkinMaxThemeArchiveBytes) {
        throw 'DreamSkin.cc theme download exceeded its approved size.'
      }
      $output.Write($buffer, 0, $read)
    }
  } finally {
    if ($null -ne $output) { $output.Dispose() }
    $input.Dispose()
  }
  if ($written -ne $Metadata.PackageBytes) {
    throw 'DreamSkin.cc theme download byte count does not match approved metadata.'
  }
  $actualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -cne $Metadata.PackageSha256) {
    throw 'DreamSkin.cc theme download SHA-256 does not match approved metadata.'
  }
}

function Copy-DreamSkinActiveThemeSnapshot {
  param(
    [Parameter(Mandatory = $true)][object]$Paths,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (Test-Path -LiteralPath $Destination) {
    throw 'The active-theme snapshot destination already exists.'
  }
  Ensure-DreamSkinManagedDirectory -Path $Destination -Root $Paths.Root
  $active = Read-DreamSkinTheme -ThemeDirectory $Paths.Active
  $imageName = [System.IO.Path]::GetFileName($active.ImagePath)
  Copy-Item -LiteralPath $active.ThemePath -Destination (Join-Path $Destination 'theme.json') -Force
  Copy-Item -LiteralPath $active.ImagePath -Destination (Join-Path $Destination $imageName) -Force
  $activeCss = Join-Path $Paths.Active 'theme.css'
  if (Test-Path -LiteralPath $activeCss -PathType Leaf) {
    Assert-DreamSkinSafeCssFile -Path $activeCss
    Copy-Item -LiteralPath $activeCss -Destination (Join-Path $Destination 'theme.css') -Force
  }
  return Read-DreamSkinTheme -ThemeDirectory $Destination
}

function Copy-DreamSkinImportedThemeSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][object]$Paths,
    [Parameter(Mandatory = $true)][string]$ExpectedContentFingerprint
  )
  if ($ExpectedContentFingerprint -cnotmatch '\A[a-f0-9]{64}\z') {
    throw 'The imported theme content fingerprint is invalid.'
  }
  $sourceRoot = [System.IO.Path]::GetFullPath($SourceDirectory)
  if (-not (Test-DreamSkinThemePathWithin -Path $sourceRoot -Root $Paths.Saved)) {
    throw 'The imported theme escaped the managed saved-theme library.'
  }
  if (Test-Path -LiteralPath $Destination) {
    throw 'The imported-theme snapshot destination already exists.'
  }
  $source = Read-DreamSkinTheme -ThemeDirectory $sourceRoot
  $sourceCss = Join-Path $sourceRoot 'theme.css'
  Assert-DreamSkinSafeCssFile -Path $sourceCss
  Ensure-DreamSkinManagedDirectory -Path $Destination -Root $Paths.Root
  $imageName = [System.IO.Path]::GetFileName($source.ImagePath)
  Copy-Item -LiteralPath $source.ThemePath -Destination (Join-Path $Destination 'theme.json') -Force
  Copy-Item -LiteralPath $source.ImagePath -Destination (Join-Path $Destination $imageName) -Force
  Copy-Item -LiteralPath $sourceCss -Destination (Join-Path $Destination 'theme.css') -Force
  $sourceLicense = Join-Path $sourceRoot 'LICENSE.txt'
  if (Test-Path -LiteralPath $sourceLicense -PathType Leaf) {
    Assert-DreamSkinNoReparseComponents -Path $sourceLicense
    Copy-Item -LiteralPath $sourceLicense -Destination (Join-Path $Destination 'LICENSE.txt') -Force
  }
  $null = Read-DreamSkinTheme -ThemeDirectory $Destination
  Assert-DreamSkinSafeCssFile -Path (Join-Path $Destination 'theme.css')
  $contentFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $Destination
  if ($contentFingerprint -cne $ExpectedContentFingerprint) {
    throw 'The imported theme changed before its private apply snapshot was completed.'
  }
  return [pscustomobject]@{
    Directory = $Destination
    ContentFingerprint = $contentFingerprint
  }
}

function Restore-DreamSkinActiveThemeSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$SnapshotDirectory,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedContentFingerprint
  )
  $snapshot = Read-DreamSkinTheme -ThemeDirectory $SnapshotDirectory
  $theme = $snapshot.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $cssPath = Join-Path $SnapshotDirectory 'theme.css'
  if (-not (Test-Path -LiteralPath $cssPath -PathType Leaf)) { $cssPath = $null }
  $null = Set-DreamSkinActiveTheme -ImagePath $snapshot.ImagePath -Theme $theme `
    -SafeCssPath $cssPath -StateRoot $StateRoot
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $restoredFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
  if ($restoredFingerprint -cne $ExpectedContentFingerprint) {
    throw 'The previous active-theme files were not restored exactly.'
  }
  return $restoredFingerprint
}

function Set-DreamSkinActiveThemeFromSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$SnapshotDirectory,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedContentFingerprint
  )
  $candidateFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
    -ThemeDirectory $SnapshotDirectory
  if ($candidateFingerprint -cne $ExpectedContentFingerprint) {
    throw 'The private imported-theme snapshot no longer matches its validated content.'
  }
  $candidate = Read-DreamSkinTheme -ThemeDirectory $SnapshotDirectory
  $cssPath = Join-Path $SnapshotDirectory 'theme.css'
  Assert-DreamSkinSafeCssFile -Path $cssPath
  $theme = $candidate.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $null = Set-DreamSkinActiveTheme -ImagePath $candidate.ImagePath -Theme $theme `
    -SafeCssPath $cssPath -StateRoot $StateRoot
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $activeFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
  if ($activeFingerprint -cne $ExpectedContentFingerprint) {
    throw 'The active theme does not match the validated imported content.'
  }
  return $activeFingerprint
}

function Invoke-DreamSkinCommunityStartAndVerify {
  param(
    [ValidateRange(1000, 300000)]
    [int]$OperationLockTimeoutMilliseconds = 180000
  )
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  Assert-DreamSkinNoReparseComponents -Path $startScript
  if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    throw 'The managed Dream Skin start script is missing.'
  }
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $argumentLine = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
    (ConvertTo-DreamSkinProcessArgument -Value $startScript) + ' -RestartExisting' +
    ' -RequireUnpaused -OperationLockTimeoutMilliseconds ' +
    "$OperationLockTimeoutMilliseconds"
  $startProcess = Start-Process -FilePath $powershell -ArgumentList $argumentLine `
    -WindowStyle Hidden -PassThru
  if (-not $startProcess.WaitForExit($OperationLockTimeoutMilliseconds)) {
    try { Stop-Process -InputObject $startProcess -Force -ErrorAction SilentlyContinue } catch {}
    [void]$startProcess.WaitForExit(15000)
    throw "Dream Skin start verification did not finish within $OperationLockTimeoutMilliseconds ms."
  }
  if ($startProcess.ExitCode -ne 0) {
    throw "Dream Skin could not start and visibly verify the active theme (exit code $($startProcess.ExitCode))."
  }
}

function Assert-DreamSkinCommunityActiveBaseline {
  param(
    [Parameter(Mandatory = $true)][object]$Paths,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [ValidateRange(1000, 120000)]
    [int]$RendererTimeoutMilliseconds = 30000
  )
  if (Test-DreamSkinPaused -StateRoot $StateRoot) {
    throw 'One-click apply requires an active, unpaused Dream Skin renderer.'
  }
  $selectedFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
    -ThemeDirectory $Paths.Active
  $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
  if ($null -eq $session) {
    throw 'One-click apply requires an existing verified Dream Skin session.'
  }
  if (-not (Test-DreamSkinPathEqual -Left $session.Paths.Active -Right $Paths.Active)) {
    throw 'The active Dream Skin session does not use the selected theme directory.'
  }
  $verify = Invoke-DreamSkinNative -FilePath $session.NodePath -ArgumentList @(
    $session.Injector,
    '--verify',
    '--port', "$($session.Port)",
    '--browser-id', $session.BrowserId,
    '--theme-dir', $Paths.Active,
    '--timeout-ms', "$RendererTimeoutMilliseconds"
  ) -DiscardStderr
  if ($verify.ExitCode -ne 0) {
    throw 'The selected theme is not the exact theme currently visible in Codex.'
  }
  if (Test-DreamSkinPaused -StateRoot $StateRoot) {
    throw 'A pause request superseded one-click apply during baseline verification.'
  }
  $verifiedFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
    -ThemeDirectory $Paths.Active
  if ($verifiedFingerprint -cne $selectedFingerprint) {
    throw 'The selected theme changed during baseline renderer verification.'
  }
  return [pscustomobject]@{ ContentFingerprint = $verifiedFingerprint }
}

function Get-DreamSkinCommunityActiveState {
  param(
    [Parameter(Mandatory = $true)][object]$Paths,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [ValidateRange(1000, 300000)]
    [int]$OperationLockTimeoutMilliseconds = 180000
  )
  $stateLock = Enter-DreamSkinOperationLock `
    -TimeoutMilliseconds $OperationLockTimeoutMilliseconds
  try {
    $paused = Test-DreamSkinPaused -StateRoot $StateRoot
    $fingerprint = $null
    $readable = $false
    try {
      $fingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
        -ThemeDirectory $Paths.Active
      $readable = $true
    } catch {}
    return [pscustomobject]@{
      Paused = $paused
      Readable = $readable
      Fingerprint = $fingerprint
    }
  } finally {
    Exit-DreamSkinOperationLock -Mutex $stateLock
  }
}

function Move-DreamSkinCommunityRollbackSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$WorkRoot,
    [Parameter(Mandatory = $true)][object]$Paths,
    [Parameter(Mandatory = $true)][string]$ExpectedContentFingerprint
  )
  if ($ExpectedContentFingerprint -cnotmatch '\A[a-f0-9]{64}\z') {
    throw 'The rollback snapshot fingerprint is invalid.'
  }
  $workFullPath = [System.IO.Path]::GetFullPath($WorkRoot)
  $snapshotPath = [System.IO.Path]::GetFullPath((Join-Path $workFullPath 'active-before'))
  if (-not (Test-DreamSkinPathWithin -Path $workFullPath -Root $Paths.Root) -or
    -not (Test-DreamSkinPathWithin -Path $snapshotPath -Root $workFullPath) -or
    -not (Test-Path -LiteralPath $snapshotPath -PathType Container)) {
    throw 'The rollback snapshot is not inside its private community work directory.'
  }
  Assert-DreamSkinNoReparseComponents -Path $snapshotPath
  $snapshotFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
    -ThemeDirectory $snapshotPath
  if ($snapshotFingerprint -cne $ExpectedContentFingerprint) {
    throw 'The rollback snapshot changed before it could be retained.'
  }
  $destination = Join-Path $Paths.Root `
    ('.community-rollback-' + [guid]::NewGuid().ToString('N'))
  Assert-DreamSkinNoReparseComponents -Path $destination
  [System.IO.Directory]::Move($snapshotPath, $destination)
  return $destination
}

function New-DreamSkinCommunityApplyException {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('Verified', 'Failed', 'Superseded')][string]$Recovery,
    [AllowNull()][System.Exception]$InnerException,
    [AllowNull()][string]$RollbackSnapshot,
    [AllowNull()][string]$RollbackFingerprint
  )
  $exception = if ($null -ne $InnerException) {
    [System.InvalidOperationException]::new($Message, $InnerException)
  } else {
    [System.InvalidOperationException]::new($Message)
  }
  $exception.Data['DreamSkinRecovery'] = $Recovery
  if ($Recovery -ceq 'Failed' -and $RollbackSnapshot -and $RollbackFingerprint) {
    $exception.Data['DreamSkinRollbackSnapshot'] = $RollbackSnapshot
    $exception.Data['DreamSkinRollbackFingerprint'] = $RollbackFingerprint
  }
  return $exception
}

function Invoke-DreamSkinCommunityThemeTransaction {
  param(
    [Parameter(Mandatory = $true)][object]$Imported,
    [Parameter(Mandatory = $true)][object]$Paths,
    [Parameter(Mandatory = $true)][string]$WorkRoot,
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [ValidateRange(1000, 300000)]
    [int]$OperationLockTimeoutMilliseconds = 180000
  )
  if ($Imported.ContentFingerprint -isnot [string] -or
    $Imported.ContentFingerprint -cnotmatch '\A[a-f0-9]{64}\z') {
    throw 'The strict theme importer did not return a valid content fingerprint.'
  }
  $expectedFingerprint = $Imported.ContentFingerprint
  $candidateRoot = Join-Path $WorkRoot 'apply-candidate'
  $candidate = Copy-DreamSkinImportedThemeSnapshot -SourceDirectory $Imported.Path `
    -Destination $candidateRoot -Paths $Paths -ExpectedContentFingerprint $expectedFingerprint
  if ($candidate.ContentFingerprint -cne $expectedFingerprint) {
    throw 'The private imported-theme snapshot identity is inconsistent.'
  }

  $snapshotRoot = Join-Path $WorkRoot 'active-before'
  $rollbackFingerprint = $null
  $writeFailure = $null
  $rollbackWriteFailure = $null
  $operationLock = Enter-DreamSkinOperationLock
  try {
    $baseline = Assert-DreamSkinCommunityActiveBaseline -Paths $Paths `
      -StateRoot $StateRoot
    $null = Copy-DreamSkinActiveThemeSnapshot -Paths $Paths -Destination $snapshotRoot
    $rollbackFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
      -ThemeDirectory $snapshotRoot
    if ($rollbackFingerprint -cne $baseline.ContentFingerprint) {
      throw 'The active theme changed between renderer verification and rollback snapshot.'
    }
    if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $candidateRoot) -cne
      $expectedFingerprint) {
      throw 'The private imported-theme snapshot changed before application.'
    }
    try {
      $null = Set-DreamSkinActiveThemeFromSnapshot -SnapshotDirectory $candidateRoot `
        -StateRoot $StateRoot -ExpectedContentFingerprint $expectedFingerprint
    } catch {
      $writeFailure = $_
      try {
        $null = Restore-DreamSkinActiveThemeSnapshot -SnapshotDirectory $snapshotRoot `
          -StateRoot $StateRoot -ExpectedContentFingerprint $rollbackFingerprint
      } catch {
        $rollbackWriteFailure = $_
      }
    }
  } finally {
    Exit-DreamSkinOperationLock -Mutex $operationLock
  }

  if ($null -ne $writeFailure) {
    if ($null -ne $rollbackWriteFailure) {
      throw (New-DreamSkinCommunityApplyException `
        -Message ("The imported theme could not be written, and the previous active-theme files " +
          "could not be restored: $($rollbackWriteFailure.Exception.Message)") `
        -Recovery 'Failed' -InnerException $writeFailure.Exception `
        -RollbackSnapshot $snapshotRoot -RollbackFingerprint $rollbackFingerprint)
    }
    try {
      Invoke-DreamSkinCommunityStartAndVerify `
        -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
    } catch {
      $rollbackStartFailure = $_
      try {
        $rollbackState = Get-DreamSkinCommunityActiveState -Paths $Paths `
          -StateRoot $StateRoot `
          -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
      } catch {
        throw (New-DreamSkinCommunityApplyException `
          -Message 'Another theme action superseded rollback verification.' `
          -Recovery 'Superseded' -InnerException $rollbackStartFailure.Exception)
      }
      if ($rollbackState.Paused -or -not $rollbackState.Readable -or
        $rollbackState.Fingerprint -cne $rollbackFingerprint) {
        throw (New-DreamSkinCommunityApplyException `
          -Message 'Another theme action superseded the restored theme; its choice was not overwritten.' `
          -Recovery 'Superseded' -InnerException $rollbackStartFailure.Exception)
      }
      throw (New-DreamSkinCommunityApplyException `
        -Message ("The imported theme could not be written. The previous active-theme files were " +
          "restored, but their renderer could not be verified: $($rollbackStartFailure.Exception.Message)") `
        -Recovery 'Failed' -InnerException $writeFailure.Exception `
        -RollbackSnapshot $snapshotRoot -RollbackFingerprint $rollbackFingerprint)
    }
    try {
      $rollbackState = Get-DreamSkinCommunityActiveState -Paths $Paths `
        -StateRoot $StateRoot `
        -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
    } catch {
      throw (New-DreamSkinCommunityApplyException `
        -Message 'Another theme action superseded rollback verification.' `
        -Recovery 'Superseded' -InnerException $writeFailure.Exception)
    }
    if ($rollbackState.Paused -or -not $rollbackState.Readable -or
      $rollbackState.Fingerprint -cne $rollbackFingerprint) {
      throw (New-DreamSkinCommunityApplyException `
        -Message 'Another theme action superseded the restored theme; its choice was not overwritten.' `
        -Recovery 'Superseded' -InnerException $writeFailure.Exception)
    }
    throw (New-DreamSkinCommunityApplyException `
      -Message 'The imported theme could not be written. The previous theme was reapplied and visibly verified.' `
      -Recovery 'Verified' -InnerException $writeFailure.Exception)
  }

  try {
    Invoke-DreamSkinCommunityStartAndVerify `
      -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
  } catch {
    $startFailure = $_
    $superseded = $false
    $rollbackFailure = $null
    $rollbackLock = $null
    try {
      $rollbackLock = Enter-DreamSkinOperationLock `
        -TimeoutMilliseconds $OperationLockTimeoutMilliseconds
    } catch {
      throw (New-DreamSkinCommunityApplyException `
        -Message ("The imported theme failed visible verification, and the operation lock " +
          "could not be reacquired for recovery: $($_.Exception.Message)") `
        -Recovery 'Failed' -InnerException $startFailure.Exception `
        -RollbackSnapshot $snapshotRoot -RollbackFingerprint $rollbackFingerprint)
    }
    try {
      if (Test-DreamSkinPaused -StateRoot $StateRoot) {
        $superseded = $true
      } else {
        try {
          $currentFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
            -ThemeDirectory $Paths.Active
        } catch {
          $superseded = $true
        }
      }
      if (-not $superseded -and $currentFingerprint -cne $expectedFingerprint) {
        $superseded = $true
      }
      if (-not $superseded) {
        try {
          $null = Restore-DreamSkinActiveThemeSnapshot -SnapshotDirectory $snapshotRoot `
            -StateRoot $StateRoot -ExpectedContentFingerprint $rollbackFingerprint
        } catch {
          $rollbackFailure = $_
        }
      }
    } finally {
      Exit-DreamSkinOperationLock -Mutex $rollbackLock
    }
    if ($superseded) {
      throw (New-DreamSkinCommunityApplyException `
        -Message 'Another theme or pause action changed the active state; its choice was not overwritten.' `
        -Recovery 'Superseded' -InnerException $startFailure.Exception)
    }
    if ($null -ne $rollbackFailure) {
      throw (New-DreamSkinCommunityApplyException `
        -Message ("The imported theme failed visible verification, and the previous active-theme " +
          "files could not be restored: $($rollbackFailure.Exception.Message)") `
        -Recovery 'Failed' -InnerException $startFailure.Exception `
        -RollbackSnapshot $snapshotRoot -RollbackFingerprint $rollbackFingerprint)
    }
    try {
      Invoke-DreamSkinCommunityStartAndVerify `
        -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
    } catch {
      $restoredStartFailure = $_
      try {
        $restoredState = Get-DreamSkinCommunityActiveState -Paths $Paths `
          -StateRoot $StateRoot `
          -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
      } catch {
        throw (New-DreamSkinCommunityApplyException `
          -Message 'Another theme action superseded recovery verification.' `
          -Recovery 'Superseded' -InnerException $restoredStartFailure.Exception)
      }
      if ($restoredState.Paused -or -not $restoredState.Readable -or
        $restoredState.Fingerprint -cne $rollbackFingerprint) {
        throw (New-DreamSkinCommunityApplyException `
          -Message 'Another theme action superseded recovery; its choice was not overwritten.' `
          -Recovery 'Superseded' -InnerException $restoredStartFailure.Exception)
      }
      throw (New-DreamSkinCommunityApplyException `
        -Message ("The imported theme failed visible verification. The previous active-theme files " +
          "were restored, but their renderer could not be verified: $($restoredStartFailure.Exception.Message)") `
        -Recovery 'Failed' -InnerException $startFailure.Exception `
        -RollbackSnapshot $snapshotRoot -RollbackFingerprint $rollbackFingerprint)
    }
    try {
      $restoredState = Get-DreamSkinCommunityActiveState -Paths $Paths `
        -StateRoot $StateRoot `
        -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
    } catch {
      throw (New-DreamSkinCommunityApplyException `
        -Message 'Another theme action superseded recovery verification.' `
        -Recovery 'Superseded' -InnerException $startFailure.Exception)
    }
    if ($restoredState.Paused -or -not $restoredState.Readable -or
      $restoredState.Fingerprint -cne $rollbackFingerprint) {
      throw (New-DreamSkinCommunityApplyException `
        -Message 'Another theme action superseded recovery; its choice was not overwritten.' `
        -Recovery 'Superseded' -InnerException $startFailure.Exception)
    }
    throw (New-DreamSkinCommunityApplyException `
      -Message 'The imported theme failed visible verification. The previous theme was reapplied and visibly verified.' `
      -Recovery 'Verified' -InnerException $startFailure.Exception)
  }

  try {
    $successState = Get-DreamSkinCommunityActiveState -Paths $Paths `
      -StateRoot $StateRoot `
      -OperationLockTimeoutMilliseconds $OperationLockTimeoutMilliseconds
  } catch {
    throw (New-DreamSkinCommunityApplyException `
      -Message 'Another theme action superseded final one-click verification.' `
      -Recovery 'Superseded' -InnerException $null)
  }
  if ($successState.Paused -or -not $successState.Readable -or
    $successState.Fingerprint -cne $expectedFingerprint) {
    throw (New-DreamSkinCommunityApplyException `
      -Message 'Another theme or pause action superseded one-click apply; its choice was not overwritten.' `
      -Recovery 'Superseded' -InnerException $null)
  }
  return [pscustomobject]@{ ContentFingerprint = $successState.Fingerprint }
}

function Invoke-DreamSkinCommunityApply {
  param([Parameter(Mandatory = $true)][string]$ApplyUri)
  $versionId = Resolve-DreamSkinCommunityApplyUri -Uri $ApplyUri
  $endpoints = Get-DreamSkinCommunityThemeEndpoints -VersionId $versionId
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.CommunityApply")
  $acquired = $false
  $workRoot = $null
  $retainWorkRoot = $false
  $stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
    }
    if (-not $acquired) {
      throw 'Another one-click theme apply is already running. Try again shortly.'
    }

    $metadataResponse = Get-DreamSkinCommunityHttpResponse `
      -RequestUri $endpoints.MetadataUri -Accept 'application/json'
    try {
      $metadata = Read-DreamSkinCommunityMetadataResponse -Response $metadataResponse `
        -ExpectedVersionId $versionId
    } finally {
      $metadataResponse.Dispose()
    }
    if (-not (Confirm-DreamSkinCommunityApply -Metadata $metadata)) {
      return [pscustomobject]@{ Canceled = $true; Name = $metadata.Name }
    }

    $paths = Get-DreamSkinThemePaths -StateRoot $stateRoot
    Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
    $workRoot = Join-Path $paths.Root ('.community-apply-' + [guid]::NewGuid().ToString('N'))
    Ensure-DreamSkinManagedDirectory -Path $workRoot -Root $paths.Root
    $archivePath = Join-Path $workRoot 'theme.zip'
    Assert-DreamSkinNoReparseComponents -Path $archivePath

    $downloadResponse = Get-DreamSkinCommunityHttpResponse `
      -RequestUri $endpoints.DownloadUri -Accept 'application/zip'
    try {
      Save-DreamSkinCommunityDownload -Response $downloadResponse -Metadata $metadata `
        -ArchivePath $archivePath
    } finally {
      $downloadResponse.Dispose()
    }

    $imported = Import-DreamSkinThemeZip -ArchivePath $archivePath -StateRoot $stateRoot `
      -ExpectedArchiveBytes $metadata.PackageBytes `
      -ExpectedArchiveSha256 $metadata.PackageSha256
    if ($imported.SafeCssStatus -cne 'validated' -or
      $imported.Status -notin @('Imported', 'Duplicate') -or
      $imported.ContentFingerprint -isnot [string] -or
      $imported.ContentFingerprint -cnotmatch '\A[a-f0-9]{64}\z') {
      throw 'The downloaded theme did not complete the strict ZIP and Safe CSS import.'
    }
    $cleanupProperty = $imported.PSObject.Properties['CleanupWarning']
    $cleanupWarning = if ($null -ne $cleanupProperty) { "$($cleanupProperty.Value)" } else { '' }
    try {
      $null = Invoke-DreamSkinCommunityThemeTransaction -Imported $imported -Paths $paths `
        -WorkRoot $workRoot -StateRoot $stateRoot
    } catch {
      $transactionError = $_
      if ("$($transactionError.Exception.Data['DreamSkinRecovery'])" -ceq 'Failed') {
        $expectedSnapshot = [System.IO.Path]::GetFullPath((Join-Path $workRoot 'active-before'))
        $recordedSnapshot = "$($transactionError.Exception.Data['DreamSkinRollbackSnapshot'])"
        $rollbackFingerprint = "$($transactionError.Exception.Data['DreamSkinRollbackFingerprint'])"
        if ($recordedSnapshot -and
          [System.IO.Path]::GetFullPath($recordedSnapshot).Equals(
            $expectedSnapshot,
            [System.StringComparison]::OrdinalIgnoreCase
          ) -and (Test-Path -LiteralPath $expectedSnapshot -PathType Container)) {
          try {
            $retainedSnapshot = Move-DreamSkinCommunityRollbackSnapshot `
              -WorkRoot $workRoot -Paths $paths `
              -ExpectedContentFingerprint $rollbackFingerprint
            $transactionError.Exception.Data['DreamSkinRollbackPath'] = $retainedSnapshot
          } catch {
            $retainWorkRoot = $true
            $transactionError.Exception.Data['DreamSkinRollbackPath'] = $expectedSnapshot
            $transactionError.Exception.Data['DreamSkinWorkRootRetained'] = $true
            $transactionError.Exception.Data['DreamSkinRollbackPreservationError'] = `
              $_.Exception.Message
          }
        }
      }
      throw $transactionError
    }
    return [pscustomobject]@{
      Canceled = $false
      Name = $metadata.Name
      CleanupWarning = $cleanupWarning
    }
  } finally {
    if (-not $retainWorkRoot -and $workRoot -and (Test-Path -LiteralPath $workRoot)) {
      Assert-DreamSkinNoReparseComponents -Path $workRoot
      Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
  }
}

$previousProtocol = [System.Net.ServicePointManager]::SecurityProtocol
try {
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  $result = Invoke-DreamSkinCommunityApply -ApplyUri $Uri
  if (-not $result.Canceled) {
    Show-DreamSkinCommunityMessage `
      -Message (Format-DreamSkinCommunitySuccessMessage -Name $result.Name `
        -CleanupWarning $result.CleanupWarning)
  }
  exit 0
} catch {
  $recovery = "$($_.Exception.Data['DreamSkinRecovery'])"
  $rollbackPath = "$($_.Exception.Data['DreamSkinRollbackPath'])"
  $workRootRetained = [bool]$_.Exception.Data['DreamSkinWorkRootRetained']
  $recoveryMessage = switch ($recovery) {
    'Verified' { '新主题未能生效；此前主题已重新应用并完成可见渲染验证。' }
    'Failed' { '新主题未能生效；此前主题的自动恢复或渲染验证未完成。请重新打开客户端检查。' }
    'Superseded' { '检测到另一个换肤操作，客户端保留了较新的选择，没有覆盖它。' }
    default { '新主题未写入已验证的活动状态。' }
  }
  $cleanupMessage = if ($workRootRetained) {
    '恢复工作目录已保留，未自动删除。'
  } else {
    '下载临时文件已清理。'
  }
  $rollbackMessage = if ($rollbackPath) {
    "`r`n回滚快照：$rollbackPath"
  } else {
    ''
  }
  Show-DreamSkinCommunityMessage -Kind Error -Message (
    "一键换肤失败。$cleanupMessage$recoveryMessage`r`n`r`n" +
      $_.Exception.Message + $rollbackMessage
  )
  [Console]::Error.WriteLine($_.Exception.Message)
  if ($recovery -ceq 'Verified') { exit 20 }
  if ($recovery -ceq 'Failed') { exit 21 }
  if ($recovery -ceq 'Superseded') { exit 22 }
  exit 1
} finally {
  [System.Net.ServicePointManager]::SecurityProtocol = $previousProtocol
}
