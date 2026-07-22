[CmdletBinding()]
param(
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $root 'assets\Codex Dream Skin.exe' }
$source = Join-Path $PSScriptRoot 'CodexDreamSkinLauncher.cs'
$icon = Join-Path $root 'assets\codex-icon.ico'
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $compiler) { throw '.NET Framework 4.x C# compiler was not found.' }
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Launcher source is missing: $source" }
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { throw "Launcher icon is missing: $icon" }

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
$temporaryDirectory = Join-Path $outputDirectory ('.launcher-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$temporaryOutput = Join-Path $temporaryDirectory (Split-Path -Leaf $OutputPath)

$arguments = @(
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  '/debug-',
  '/codepage:65001',
  "/win32icon:$icon",
  "/out:$temporaryOutput",
  '/reference:System.dll',
  '/reference:System.Windows.Forms.dll',
  $source
)
try {
  & $compiler @arguments
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporaryOutput -PathType Leaf)) {
    throw "Launcher compilation failed with exit code $LASTEXITCODE."
  }

  $bytes = [System.IO.File]::ReadAllBytes($temporaryOutput)
  if ($bytes.Length -lt 512 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) {
    throw 'Launcher compiler output is not a valid PE image.'
  }
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
  $subsystem = [BitConverter]::ToUInt16($bytes, $peOffset + 24 + 68)
  if ($subsystem -ne 2) { throw 'Launcher compiler output is not a Windows GUI executable.' }

  if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
    $replacementBackup = Join-Path $temporaryDirectory ((Split-Path -Leaf $OutputPath) + '.backup')
    [System.IO.File]::Replace($temporaryOutput, $OutputPath, $replacementBackup, $true)
  } else {
    [System.IO.File]::Move($temporaryOutput, $OutputPath)
  }
} finally {
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}
Get-Item -LiteralPath $OutputPath
