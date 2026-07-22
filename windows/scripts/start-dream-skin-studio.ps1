[CmdletBinding()]
param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
$node = (Get-DreamSkinNodeRuntime).Path
$projectRoot = Split-Path -Parent $PSScriptRoot
$server = Join-Path $projectRoot 'studio\server.mjs'
try { Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 1 | Out-Null }
catch {
  $previousPort = $env:DREAM_SKIN_STUDIO_PORT
  try {
    $env:DREAM_SKIN_STUDIO_PORT = "$Port"
    Start-Process -FilePath $node -ArgumentList @($server) -WindowStyle Hidden -WorkingDirectory $Script:PlatformRoot
  } finally {
    if ($null -eq $previousPort) { Remove-Item Env:DREAM_SKIN_STUDIO_PORT -ErrorAction SilentlyContinue }
    else { $env:DREAM_SKIN_STUDIO_PORT = $previousPort }
  }
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 1 | Out-Null; break } catch {}
  }
}
Start-Process "http://127.0.0.1:$Port/"
