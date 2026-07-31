[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

# A verify can fail while the theme is demonstrably on screen: the renderer
# reports the document visible, the viewport sized and the shell structure
# present, and only Browser.getWindowForTarget -- which some Codex builds never
# resolve for a real window -- comes back false. Startup used to force-restart
# Codex in that state, taking a working skinned window away from the user and
# returning them to the stock appearance about 90 seconds after they applied a
# theme (#267). Startup must leave Codex alone when the skin is rendered, and
# must still restart it when the renderer reports a genuinely broken session.

$ErrorActionPreference = 'Stop'
$startPath = Join-Path $Root 'scripts\start-dream-skin.ps1'
$rawSource = [System.IO.File]::ReadAllText($startPath)
$dotSourcePattern = '(?m)^\.\s+\(Join-Path \$PSScriptRoot ''(?:common-windows|theme-windows)\.ps1''\)\r?\n'
if ([regex]::Matches($rawSource, $dotSourcePattern).Count -ne 2) {
  throw 'Preserved-skin fixture could not isolate the two runtime imports.'
}
$rawSource = [regex]::Replace($rawSource, $dotSourcePattern, '')
$rawSource = $rawSource.Replace(
  '$Injector = Join-Path $PSScriptRoot ''injector.mjs''',
  '$Injector = ''mock-injector.mjs'''
)
$rawSource = $rawSource.Replace(
  '(Split-Path -Parent $PSScriptRoot)',
  '''mock-skill-root'''
)
if ($rawSource.Contains('$PSScriptRoot')) {
  throw 'Preserved-skin fixture left a real script-root dependency in the isolated source.'
}

function Invoke-DreamSkinStartupFixture {
  param([Parameter(Mandatory = $true)][string]$VerifyPayload)

  $script:daemon = [pscustomobject]@{ Id = 4242; HasExited = $false }
  $script:daemon | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
    param([int]$Milliseconds)
    return $this.HasExited
  }
  $script:dateCall = 0
  $script:codexStopped = $false
  $script:codexStarted = $false
  $script:verifyPayload = $VerifyPayload
  $script:lastError = '(no error)'

  function Enter-DreamSkinOperationLock { param([int]$TimeoutMilliseconds); return 'mock-lock' }
  function Exit-DreamSkinOperationLock { param([object]$Mutex) }
  function Assert-DreamSkinPort { param([int]$Port) }
  function Get-DreamSkinNodeRuntime {
    return [pscustomobject]@{ Path = 'mock-node.exe'; Version = '22.23.1' }
  }
  function Get-DreamSkinCodexInstall {
    return [pscustomobject]@{
      Executable = 'C:\Program Files\WindowsApps\OpenAI.Codex\app\ChatGPT.exe'
      PackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex'
      PackageFullName = 'OpenAI.Codex_fixture'
      PackageFamilyName = 'OpenAI.Codex_fixture'
      Version = '26.707.9981.0'
    }
  }
  function Get-DreamSkinThemePaths {
    param([string]$StateRoot)
    return [pscustomobject]@{
      Root = $StateRoot
      Active = (Join-Path $StateRoot 'active-theme')
      PauseFile = (Join-Path $StateRoot 'paused')
    }
  }
  function Ensure-DreamSkinManagedDirectory { param([string]$Path, [string]$Root) }
  function Initialize-DreamSkinThemeStore {
    param([string]$SkillRoot, [string]$StateRoot)
    return Get-DreamSkinThemePaths -StateRoot $StateRoot
  }
  function Test-DreamSkinPaused { param([string]$StateRoot); return $false }
  function Read-DreamSkinState { param([string]$Path); return $null }
  function Get-DreamSkinCodexStatePathCandidate { param([object]$State); return $null }
  function Get-DreamSkinCodexInstallFromState { param([object]$State); return $null }
  function Test-DreamSkinPathEqual { param([string]$Left, [string]$Right); return $true }
  function Stop-DreamSkinRecordedInjector { param([object]$State); return $true }
  function Set-DreamSkinPaused { param([bool]$Paused, [string]$StateRoot); return $true }
  function Invoke-DreamSkinCodexWindowActivation { param([object]$Codex); return $true }
  function ConvertTo-DreamSkinProcessArgument { param([string]$Value); return $Value }
  function Get-DreamSkinProcessStartedAt { param([int]$ProcessId); return '2026-07-25T00:00:00.0000000Z' }
  function Write-DreamSkinState { param([string]$Path, [object]$State) }
  function Write-DreamSkinUtf8FileAtomically { param([string]$Path, [string]$Content) }

  # No Codex is running yet, so startup launches it with the debug port itself.
  # That is the branch that used to force-restart on any verify failure.
  function Get-DreamSkinCodexProcesses { param([object]$Codex); return @() }
  function Get-DreamSkinVerifiedCdpIdentity {
    param([int]$Port, [object]$Codex)
    return [pscustomobject]@{ BrowserId = 'fixture-browser' }
  }
  function Stop-DreamSkinCodex {
    param([object]$Codex, [switch]$AllowForce)
    $script:codexStopped = $true
  }
  function Start-DreamSkinCodex {
    param([object]$Codex)
    $script:codexStarted = $true
    return [pscustomobject]@{ Id = 909 }
  }

  function Invoke-DreamSkinNative {
    param([string]$FilePath, [object[]]$ArgumentList, [switch]$DiscardStderr)
    if ($ArgumentList -contains '--verify') {
      return [pscustomobject]@{ ExitCode = 2; Output = @($script:verifyPayload) }
    }
    if ($ArgumentList -contains '--once') {
      return [pscustomobject]@{ ExitCode = 2; Output = @($script:verifyPayload) }
    }
    if ($ArgumentList -contains '--remove') {
      return [pscustomobject]@{ ExitCode = 0; Output = @() }
    }
    throw 'The preserved-skin fixture received an unexpected native command.'
  }
  function Start-Process {
    [CmdletBinding()]
    param(
      [string]$FilePath,
      [object[]]$ArgumentList,
      [string]$WindowStyle,
      [switch]$PassThru,
      [string]$RedirectStandardOutput,
      [string]$RedirectStandardError
    )
    return $script:daemon
  }
  function Stop-Process {
    [CmdletBinding()]
    param([object]$InputObject, [switch]$Force)
    $InputObject.HasExited = $true
  }
  function Remove-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [switch]$Force)
  }
  function Write-Host {
    param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Object)
  }
  # Push every Get-Date past the 90 second verify deadline so the loop gives up
  # on the first pass instead of retrying for real time.
  function Get-Date {
    $script:dateCall += 1
    return [DateTime]::new(2026, 7, 25, 0, 0, 0, [DateTimeKind]::Utc).AddSeconds(120 * $script:dateCall)
  }
  function Start-Sleep { param([int]$Milliseconds, [int]$Seconds) }

  $originalLocalAppData = $env:LOCALAPPDATA
  $env:LOCALAPPDATA = Join-Path ([System.IO.Path]::GetTempPath()) 'dreamskin-preserved-skin-fixture'
  $failed = $false
  try {
    $startBlock = [scriptblock]::Create($rawSource)
    try {
      & $startBlock -Port 9335
    } catch {
      $script:lastError = $_.Exception.Message
      $failed = $_.Exception.Message -like 'Dream Skin verification failed.*'
    }
  } finally {
    $env:LOCALAPPDATA = $originalLocalAppData
  }

  return [pscustomobject]@{
    Failed = $failed
    CodexStopped = $script:codexStopped
    CodexStarted = $script:codexStarted
    LastError = $script:lastError
  }
}

# The exact renderer output from #267: theme installed and painted, every
# readiness signal true except the native-window probe.
$renderedPayload = @'
{"installed":true,"version":"1.5.11","stylePresent":true,"homePresent":true,
"nativeWindow":{"pass":false,"bound":false,"reason":"target-window-unavailable"},
"documentVisibility":"visible","documentHidden":false,
"viewport":{"width":1289,"height":829},
"readiness":{"windowPass":false,"documentPass":true,"viewportPass":true,"structurePass":true},
"pass":false}
'@

$rendered = Invoke-DreamSkinStartupFixture -VerifyPayload $renderedPayload
if (-not $rendered.Failed) {
  throw 'A failed verify must still abort startup even when the skin is rendered.'
}
if ($rendered.CodexStopped -or $rendered.CodexStarted) {
  throw 'Startup force-restarted Codex even though the renderer reported a visible, structurally complete skin.'
}
# The user-facing warning is asserted statically rather than through the
# fixture: Write-Warning resolves to the real cmdlet inside the script block, so
# a mock defined out here never sees it, and a fixture that silently captures
# nothing would pass no matter what the script does.
$startSource = [System.IO.File]::ReadAllText($startPath)
if (-not $startSource.Contains('the theme is rendered')) {
  throw 'Startup no longer explains why Codex was left running unverified.'
}

# The two negative cases -- a hidden document and unparseable verify output --
# are asserted statically rather than through this fixture. Driving the startup
# script three times in one process does not isolate cleanly: the faked Get-Date
# advances monotonically across calls, so later runs enter the verify loop past
# their own deadline and take a different path. Rather than assert something the
# harness cannot actually establish, pin the guard shape itself.
$startSource = [System.IO.File]::ReadAllText($startPath)
if (-not $startSource.Contains('the theme is rendered')) {
  throw 'Startup no longer explains why Codex was left running unverified.'
}
if (-not $startSource.Contains('$launchedWithCdp -and -not $skinLooksRendered')) {
  throw 'Startup no longer restarts Codex when the skin is not rendered.'
}
foreach ($required in @('$verifyJson.installed', '$verifyJson.stylePresent',
  '$readiness.documentPass', '$readiness.viewportPass', '$readiness.structurePass')) {
  if (-not $startSource.Contains($required)) {
    throw "The rendered-skin check no longer requires $required, so a broken session could be mistaken for a working one."
  }
}
# A parse failure must not be read as a rendered skin.
if (-not $startSource.Contains('$skinLooksRendered = $false')) {
  throw 'Unparseable verify output no longer falls back to the restarting rollback.'
}

Write-Output 'PASS: a rendered-but-unverified skin keeps Codex running.'
