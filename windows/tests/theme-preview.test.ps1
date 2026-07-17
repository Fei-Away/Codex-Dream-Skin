[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts\common-windows.ps1')
. (Join-Path $Root 'scripts\theme-windows.ps1')

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "codex-dream-skin-preview-tests-$PID-$([guid]::NewGuid().ToString('N'))"
)
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  $traySource = Read-DreamSkinUtf8File `
    -Path (Join-Path $Root 'scripts\tray-dream-skin.ps1')
  foreach ($requiredTrayPreview in @(
    '安全试穿',
    'Start-DreamSkinThemePreview',
    'Complete-DreamSkinThemePreview',
    'Undo-DreamSkinThemePreview',
    'Get-DreamSkinProcessStartedAt',
    '[System.Windows.Forms.MessageBoxButtons]::YesNo'
  )) {
    if (-not $traySource.Contains($requiredTrayPreview)) {
      throw "Windows tray safe-preview action is missing: $requiredTrayPreview"
    }
  }

  $paths = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $temporaryRoot
  $candidate = Join-Path $paths.Saved 'candidate-test'
  New-Item -ItemType Directory -Path $candidate | Out-Null
  Copy-Item -LiteralPath (Join-Path $Root 'assets\dream-reference.jpg') `
    -Destination (Join-Path $candidate 'candidate.jpg')
  $candidateTheme = [pscustomobject]@{
    schemaVersion = 1
    id = 'candidate-test'
    name = '候选主题'
    image = 'candidate.jpg'
    appearance = 'auto'
    art = [pscustomobject]@{ safeArea = 'auto'; taskMode = 'auto' }
    palette = [pscustomobject]@{}
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $candidate 'theme.json'),
    (($candidateTheme | ConvertTo-Json -Depth 8) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )

  $original = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $originalImage = [System.IO.File]::ReadAllBytes($original.ImagePath)
  $previewed = Start-DreamSkinThemePreview `
    -ThemeDirectory $candidate -StateRoot $temporaryRoot
  if ($previewed.Theme.id -cne 'candidate-test' -or
    -not (Test-Path -LiteralPath (Join-Path $paths.Preview 'backup\theme.json')) -or
    -not (Test-Path -LiteralPath (Join-Path $paths.Preview 'candidate\theme.json'))) {
    throw 'Preview start did not publish the candidate with a complete recovery transaction.'
  }
  $restored = Undo-DreamSkinThemePreview -StateRoot $temporaryRoot
  if ($restored.Theme.id -cne $original.Theme.id -or
    -not (Test-DreamSkinBytesEqual -Left $originalImage `
      -Right ([System.IO.File]::ReadAllBytes($restored.ImagePath))) -or
    (Test-Path -LiteralPath $paths.Preview)) {
    throw 'Preview cancel did not restore the original theme and remove the transaction.'
  }

  $null = Start-DreamSkinThemePreview `
    -ThemeDirectory $candidate -StateRoot $temporaryRoot
  $kept = Complete-DreamSkinThemePreview -StateRoot $temporaryRoot
  if ($kept.Theme.id -cne 'candidate-test' -or
    (Test-Path -LiteralPath $paths.Preview)) {
    throw 'Preview keep did not retain the candidate and remove the transaction.'
  }

  $defaultTheme = Join-Path $paths.Saved 'preset-arina-hashimoto'
  $null = Start-DreamSkinThemePreview `
    -ThemeDirectory $defaultTheme -StateRoot $temporaryRoot
  $null = Complete-DreamSkinThemePreview -StateRoot $temporaryRoot
  $beforeCrash = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $null = Start-DreamSkinThemePreview `
    -ThemeDirectory $candidate -StateRoot $temporaryRoot
  $statePath = Join-Path $paths.Preview 'preview.json'
  $state = (Read-DreamSkinUtf8File -Path $statePath) | ConvertFrom-Json
  $state.ownerPid = $PID
  $state.ownerStartedAt = '2000-01-01T00:00:00.0000000Z'
  $stateBytes = [System.Text.UTF8Encoding]::new($false).GetBytes(
    (($state | ConvertTo-Json -Depth 4) + "`r`n")
  )
  Write-DreamSkinPreviewBytesAtomically -Path $statePath -Bytes $stateBytes
  $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $temporaryRoot
  $recovered = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  if ($recovered.Theme.id -cne $beforeCrash.Theme.id -or
    (Test-Path -LiteralPath $paths.Preview)) {
    throw 'Theme-store startup did not recover the theme from an interrupted preview.'
  }

  $invalid = Join-Path $paths.Saved 'invalid-preview'
  New-Item -ItemType Directory -Path $invalid | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $invalid 'theme.json'),
    "{`"schemaVersion`":1,`"id`":`"invalid-preview`",`"image`":`"missing.png`"}`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  $invalidRejected = $false
  try {
    $null = Start-DreamSkinThemePreview `
      -ThemeDirectory $invalid -StateRoot $temporaryRoot
  } catch {
    $invalidRejected = $true
  }
  if (-not $invalidRejected -or (Test-Path -LiteralPath $paths.Preview) -or
    (Read-DreamSkinTheme -ThemeDirectory $paths.Active).Theme.id -cne $beforeCrash.Theme.id) {
    throw 'Invalid preview input changed the active theme or left a pending transaction.'
  }

  Write-Host 'PASS: Windows theme preview keeps, cancels, recovers, and rejects invalid candidates.'
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
