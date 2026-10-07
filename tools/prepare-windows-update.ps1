[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$InstallRoot)

# Prepare a tested local build without closing the calling Codex chat. Runtime
# activation remains owned by the normal bootstrap's Codex/manager guards.
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repositoryRoot 'windows'
. (Join-Path $sourceRoot 'scripts\common-windows.ps1')
. (Join-Path $sourceRoot 'scripts\theme-windows.ps1')
$installDirectory = [IO.Path]::GetFullPath($InstallRoot)
Assert-DreamSkinNoReparseComponents -Path $installDirectory
$payload = Join-Path $installDirectory 'payload'
$bootstrap = Join-Path $installDirectory 'setup-bootstrap.ps1'
if (-not (Test-Path -LiteralPath $payload -PathType Container) -or
    -not (Test-Path -LiteralPath $bootstrap -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $installDirectory 'unins000.exe') -PathType Leaf)) {
  throw 'The destination is not an existing Dream Skin installation.'
}
Assert-DreamSkinRuntimeTree -Path $payload
$manager = Join-Path $sourceRoot 'assets\theme-manager\DreamSkin.ThemeManager.exe'
if (-not (Test-Path -LiteralPath $manager -PathType Leaf)) { throw 'Build the theme manager before preparing an update.' }
foreach ($name in @('panel-operation.ps1', 'operation-log.ps1', 'launch-themed-codex.ps1')) {
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "scripts\$name") -PathType Leaf)) {
    throw 'The source is missing the panel runtime.'
  }
}
$runtime = Join-Path $payload 'runtime'
$null = Get-DreamSkinValidatedNodeRuntime -Path (Join-Path $runtime 'node\node.exe')
$link = Join-Path $installDirectory 'Update DreamSkin Panel.lnk'
$manifestPath = Join-Path $installDirectory 'local-panel-build.json'
Assert-DreamSkinNoReparseComponents -Path $link
Assert-DreamSkinNoReparseComponents -Path $manifestPath
$shell = New-Object -ComObject WScript.Shell
$hostExe = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
  (ConvertTo-DreamSkinProcessArgument -Value $bootstrap) + ' -Install -LaunchTray -ShowWindow'
$linkExisted = Test-Path -LiteralPath $link
if ($linkExisted) {
  $existing = $shell.CreateShortcut($link)
  if (-not (Test-DreamSkinPathEqual -Left $existing.TargetPath -Right $hostExe) -or $existing.Arguments -cne $arguments) {
    throw 'An unrelated update shortcut already exists; it was preserved.'
  }
}
$manifestExisted = Test-Path -LiteralPath $manifestPath
$token = [guid]::NewGuid().ToString('N')
$stage = Join-Path $installDirectory ('.panel-staging-' + $token)
$backup = Join-Path $installDirectory ('.local-backup-panel-' + $token)
Ensure-DreamSkinManagedDirectory -Path $stage -Root $installDirectory
Ensure-DreamSkinManagedDirectory -Path $backup -Root $installDirectory
$oldMoved = $false; $newPublished = $false; $bootstrapPublished = $false; $manifestPublished = $false; $linkPublished = $false
try {
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'VERSION') -Destination $stage
  foreach ($name in @('assets', 'scripts', 'presets')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $stage -Recurse
  }
  Copy-Item -LiteralPath $runtime -Destination $stage -Recurse
  Assert-DreamSkinRuntimeTree -Path $stage
  $manifest = @()
  foreach ($file in Get-ChildItem -LiteralPath $stage -Recurse -File) {
    $relative = $file.FullName.Substring($stage.Length + 1)
    $origin = if ($relative.StartsWith('runtime\', [StringComparison]::OrdinalIgnoreCase)) {
      Join-Path $payload $relative
    } else { Join-Path $sourceRoot $relative }
    $digest = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ($digest -cne (Get-FileHash -LiteralPath $origin -Algorithm SHA256).Hash) { throw 'Staged update failed hash verification.' }
    $manifest += [ordered]@{ path = $relative; sha256 = $digest; bytes = $file.Length }
  }
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $stage 'scripts') -Filter '*.ps1') {
    Unblock-File -LiteralPath $file.FullName
  }
  $newBootstrap = Join-Path $installDirectory ('.bootstrap-staging-' + $token + '.ps1')
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'installer\setup-bootstrap.ps1') -Destination $newBootstrap
  if ((Get-FileHash -LiteralPath $newBootstrap).Hash -cne
      (Get-FileHash -LiteralPath (Join-Path $sourceRoot 'installer\setup-bootstrap.ps1')).Hash) { throw 'Bootstrap hash verification failed.' }
  Unblock-File -LiteralPath $newBootstrap
  Copy-Item -LiteralPath $bootstrap -Destination (Join-Path $backup 'setup-bootstrap.ps1')
  if ($manifestExisted) { Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $backup 'local-panel-build.json') }
  Move-Item -LiteralPath $payload -Destination (Join-Path $backup 'payload')
  $oldMoved = $true
  Move-Item -LiteralPath $stage -Destination $payload
  $newPublished = $true
  Move-Item -LiteralPath $newBootstrap -Destination $bootstrap -Force
  $bootstrapPublished = $true
  Write-DreamSkinUtf8FileAtomically -Path $manifestPath `
    -Content ([ordered]@{ schemaVersion = 1; preparedAt = [DateTimeOffset]::UtcNow.ToString('o'); files = $manifest } | ConvertTo-Json -Depth 5)
  $manifestPublished = $true
  # This is an explicit maintenance entry; ordinary management and launch links
  # keep their roles. It requests no forced shutdown and starts no process now.
  if (-not $linkExisted) {
    $newLink = Join-Path $installDirectory ('.shortcut-staging-' + $token + '.lnk')
    $shortcut = $shell.CreateShortcut($newLink)
    $shortcut.TargetPath = $hostExe
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $installDirectory
    $shortcut.IconLocation = (Join-Path $payload 'assets\codex-dream-skin.ico') + ',0'
    $shortcut.Save()
    [IO.File]::Move($newLink, $link)
    $linkPublished = $true
  }
  Write-Host "Prepared payload: $payload"
  Write-Host "Previous payload backup: $backup"
  Write-Host "Activate after closing Codex: $link"
} catch {
  # Only the explicitly named and path-verified installation subtree is touched.
  if ($newPublished) { Remove-DreamSkinManagedDirectoryVerified -Path $payload -Root $installDirectory }
  if ($oldMoved) { Move-Item -LiteralPath (Join-Path $backup 'payload') -Destination $payload }
  if ($bootstrapPublished) { Copy-Item -LiteralPath (Join-Path $backup 'setup-bootstrap.ps1') -Destination $bootstrap -Force }
  if ($manifestPublished) {
    if ($manifestExisted) { Copy-Item -LiteralPath (Join-Path $backup 'local-panel-build.json') -Destination $manifestPath -Force }
    else { Remove-Item -LiteralPath $manifestPath }
  }
  if ($linkPublished) { Remove-Item -LiteralPath $link }
  throw
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-DreamSkinManagedDirectoryVerified -Path $stage -Root $installDirectory }
  if ($newBootstrap -and (Test-Path -LiteralPath $newBootstrap)) { Remove-Item -LiteralPath $newBootstrap }
  if ($newLink -and (Test-Path -LiteralPath $newLink)) { Remove-Item -LiteralPath $newLink }
}
