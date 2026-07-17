[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$injector = Join-Path $PSScriptRoot 'injector.mjs'
. (Join-Path $PSScriptRoot 'common-windows.ps1')

$operationLock = Enter-DreamSkinOperationLock
$verifyExitCode = 1
try {
  $StatePath = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\state.json'
  $state = Read-DreamSkinState -Path $StatePath
  if (-not $PortExplicit -and $null -ne $state -and $state.port) { $Port = [int]$state.port }
  Assert-DreamSkinPort -Port $Port
  $node = Get-DreamSkinNodeRuntime
  $currentCodex = Get-DreamSkinCodexInstall
  $codex = $currentCodex
  $cdpIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
  if ($null -eq $cdpIdentity -and $null -ne $state) {
    $savedCodex = Get-DreamSkinCodexInstallFromState -State $state
    if ($null -ne $savedCodex -and
      -not (Test-DreamSkinPathEqual -Left $savedCodex.Executable -Right $currentCodex.Executable)) {
      $savedIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $savedCodex
      if ($null -ne $savedIdentity) {
        $codex = $savedCodex
        $cdpIdentity = $savedIdentity
      }
    }
  }
  if ($null -eq $cdpIdentity) {
    throw "No verified Codex CDP endpoint is active on loopback port $Port."
  }
  if ($null -ne $state -and $state.browserId -and "$($state.browserId)" -cne $cdpIdentity.BrowserId) {
    throw 'The active CDP browser does not match the saved Dream Skin session; state was preserved.'
  }

  $arguments = @($injector, '--verify', '--port', "$Port", '--browser-id', $cdpIdentity.BrowserId,
    '--timeout-ms', '30000')
  if ($ScreenshotPath) { $arguments += @('--screenshot', $ScreenshotPath) }
  & $node.Path @arguments
  $verifyExitCode = $LASTEXITCODE
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}
exit $verifyExitCode
