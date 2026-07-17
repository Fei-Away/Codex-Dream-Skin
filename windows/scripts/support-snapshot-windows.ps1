[CmdletBinding()]
param(
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
  [string]$ConfigPath = (Join-Path $HOME '.codex\config.toml')
)

$ErrorActionPreference = 'Stop'

function ConvertTo-DreamSkinSupportSnapshotVersion {
  param([AllowNull()][string]$Value)

  $candidate = "$Value".Trim()
  if ($candidate -match '^[v]?[0-9][0-9A-Za-z.+-]{0,63}$') { return $candidate }
  return $null
}

$snapshot = [pscustomobject][ordered]@{
  schemaVersion = 1
  kind = 'codex-dream-skin-support-snapshot'
  product = 'Codex Dream Skin'
  platform = 'windows'
  collection = [pscustomobject][ordered]@{
    networkAccessed = $false
    cdpAccessed = $false
    writesPerformed = $false
  }
  privacy = [pscustomobject][ordered]@{
    manualSharingRequired = $true
    redacted = @(
      'paths', 'ports', 'processIds', 'browserIds', 'logs', 'screenshots',
      'themeMetadata', 'configContents', 'environment', 'credentials', 'chatAndTaskContent'
    )
  }
  runtime = [pscustomobject][ordered]@{
    officialAppDetected = $false
    officialAppValidated = $false
    nodeRuntimeValidated = $false
    codexVersion = $null
    nodeVersion = $null
  }
  payload = [pscustomobject][ordered]@{
    attempted = $false
    valid = $false
    skinVersion = $null
  }
  configuration = [pscustomobject][ordered]@{
    present = $false
  }
  state = [pscustomobject][ordered]@{
    present = $false
    readable = $false
    session = 'unavailable'
  }
  liveVerification = 'notChecked'
}

try {
  . (Join-Path $PSScriptRoot 'common-windows.ps1')
  . (Join-Path $PSScriptRoot 'theme-windows.ps1')

  $snapshot.configuration.present = [bool]($ConfigPath -and (Test-Path -LiteralPath $ConfigPath -PathType Leaf))
  $themePaths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $statePath = $themePaths.State
  $snapshot.state.present = Test-Path -LiteralPath $statePath -PathType Leaf
  if ($snapshot.state.present) {
    try {
      $savedState = Read-DreamSkinState -Path $statePath
      $snapshot.state.readable = $true
      $savedSession = "$($savedState.session)"
      $snapshot.state.session = if ($savedSession -in @('active', 'paused')) { $savedSession } else { 'unknown' }
    } catch {
      $snapshot.state.session = 'unavailable'
    }
  }

  try {
    $codex = Get-DreamSkinCodexInstall
    $snapshot.runtime.officialAppDetected = $true
    $snapshot.runtime.officialAppValidated = $true
    $snapshot.runtime.codexVersion = ConvertTo-DreamSkinSupportSnapshotVersion "$($codex.Version)"
  } catch {}

  $node = $null
  try {
    $node = Get-DreamSkinNodeRuntime
    $snapshot.runtime.nodeRuntimeValidated = $true
    $snapshot.runtime.nodeVersion = ConvertTo-DreamSkinSupportSnapshotVersion "$($node.Version)"
  } catch {}

  if ($null -ne $node) {
    $snapshot.payload.attempted = $true
    try {
      $injector = Join-Path $PSScriptRoot 'injector.mjs'
      $payloadOutput = @(& $node.Path $injector '--check-payload' '--theme-dir' $themePaths.Active 2>$null)
      if ($LASTEXITCODE -eq 0) {
        $payload = ($payloadOutput -join "`n") | ConvertFrom-Json -ErrorAction Stop
        $snapshot.payload.valid = [bool]$payload.pass
        $snapshot.payload.skinVersion = ConvertTo-DreamSkinSupportSnapshotVersion "$($payload.version)"
      }
    } catch {}
  }
} catch {}

$snapshot | ConvertTo-Json -Depth 6
