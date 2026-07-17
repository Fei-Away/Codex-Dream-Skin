[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
$portExplicit = $PSBoundParameters.ContainsKey('Port')
$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'

function Write-DreamSkinLauncherError {
  param(
    [Parameter(Mandatory = $true)][System.Exception]$Exception,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$LauncherPath,
    [Parameter(Mandatory = $true)][string]$StartScriptPath,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $fullStateRoot = [System.IO.Path]::GetFullPath($StateRoot)
  [System.IO.Directory]::CreateDirectory($fullStateRoot) | Out-Null
  $logPath = Join-Path $fullStateRoot 'launcher-error.log'
  $singleLineMessage = ([string]$Exception.Message -replace '[\r\n]+', ' ').Trim()
  $lines = @(
    "timestamp=$([DateTime]::UtcNow.ToString('o'))",
    "port=$Port",
    "exceptionType=$($Exception.GetType().FullName)",
    "message=$singleLineMessage",
    "launcherPath=$([System.IO.Path]::GetFullPath($LauncherPath))",
    "startScriptPath=$([System.IO.Path]::GetFullPath($StartScriptPath))"
  )
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($logPath, ($lines -join [Environment]::NewLine), $utf8WithoutBom)
  return $logPath
}

try {
  $startParameters = @{ PromptRestart = $true }
  if ($portExplicit) { $startParameters.Port = $Port }
  & $startScript @startParameters
  exit 0
} catch {
  $logPath = Write-DreamSkinLauncherError -Exception $_.Exception -Port $Port `
    -LauncherPath $PSCommandPath -StartScriptPath $startScript
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      "Codex Dream Skin could not start.`n`nDetails were written to:`n$logPath",
      'Codex Dream Skin',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {}
  exit 1
}
