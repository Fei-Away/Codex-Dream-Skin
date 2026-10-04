[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\common-windows.ps1')
. (Join-Path $root 'scripts\theme-windows.ps1')
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('dreamskin-manager-maintenance-' + [guid]::NewGuid().ToString('N'))
$managerPath = Join-Path $fixture 'engine\assets\theme-manager\DreamSkin.ThemeManager.exe'
New-Item -ItemType Directory -Path (Split-Path -Parent $managerPath) -Force | Out-Null
[System.IO.File]::WriteAllText($managerPath, 'isolated process-boundary fixture')
$script:fixtureProcesses = @()
$script:passes = 0

function Check([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw $Name }
  $script:passes++
  Write-Host "PASS $Name"
}
function Refuses([scriptblock]$Action, [string]$Name) {
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  Check $rejected $Name
}
# Only the process boundary is replaced. Path validation and shutdown policy
# execute unchanged; no installed process or user theme is touched.
function Get-Process {
  param([string]$Name)
  if ($Name -ne 'DreamSkin.ThemeManager') { throw 'Unexpected process query.' }
  return $script:fixtureProcesses
}
function Stop-Process { throw 'Forced process termination is forbidden.' }
function New-ManagerProcess([string]$Path, [bool]$CloseAccepted = $true, [bool]$Exits = $true) {
  $process = [pscustomobject]@{
    Path = $Path; HasExited = $false; CloseAccepted = $CloseAccepted; Exits = $Exits
    CloseRequested = $false; SavedPending = $false; Waited = $false; Disposed = $false
  }
  $process | Add-Member ScriptMethod CloseMainWindow {
    $this.CloseRequested = $true
    return $this.CloseAccepted
  }
  $process | Add-Member ScriptMethod WaitForExit {
    param($milliseconds)
    if ($milliseconds -ne 5000 -or -not $this.CloseRequested) { throw 'Invalid graceful close ordering.' }
    $this.Waited = $true
    if ($this.Exits) { $this.SavedPending = $true; $this.HasExited = $true }
    return $this.Exits
  }
  $process | Add-Member ScriptMethod Dispose { $this.Disposed = $true }
  return $process
}

try {
  Stop-DreamSkinThemeManagerProcess -StateRoot $fixture
  Check $true 'No running manager permits maintenance'
  $known = New-ManagerProcess $managerPath
  $script:fixtureProcesses = @($known)
  Stop-DreamSkinThemeManagerProcess -StateRoot $fixture
  Check ($known.CloseRequested -and $known.Waited -and $known.SavedPending -and $known.Disposed) 'Managed manager closes normally and finishes saving before return'

  $known = New-ManagerProcess $managerPath
  $unknown = New-ManagerProcess (Join-Path $fixture 'unknown\DreamSkin.ThemeManager.exe')
  $script:fixtureProcesses = @($known, $unknown)
  Refuses { Stop-DreamSkinThemeManagerProcess -StateRoot $fixture } 'Unknown executable prevents shutdown'
  Check (-not $known.CloseRequested -and -not $unknown.CloseRequested) 'All identities are validated before any window closes'

  $unreadable = New-ManagerProcess ''
  $script:fixtureProcesses = @($unreadable)
  Refuses { Stop-DreamSkinThemeManagerProcess -StateRoot $fixture } 'Unreadable executable identity fails closed'
  Check (-not $unreadable.CloseRequested) 'Unverified process is never signaled'

  $refusesClose = New-ManagerProcess $managerPath $false
  $script:fixtureProcesses = @($refusesClose)
  Refuses { Stop-DreamSkinThemeManagerProcess -StateRoot $fixture } 'Missing or unclosable window prevents replacement'
  Check (-not $refusesClose.Waited -and $refusesClose.Disposed) 'Unclosable process is not force terminated'

  $hung = New-ManagerProcess $managerPath $true $false
  $script:fixtureProcesses = @($hung)
  Refuses { Stop-DreamSkinThemeManagerProcess -StateRoot $fixture } 'Graceful close timeout prevents replacement'
  Check ($hung.Waited -and -not $hung.HasExited -and $hung.Disposed) 'Timed-out process remains alive'

  $exited = New-ManagerProcess $managerPath
  $exited.HasExited = $true
  $script:fixtureProcesses = @($exited)
  Stop-DreamSkinThemeManagerProcess -StateRoot $fixture
  Check (-not $exited.CloseRequested -and $exited.Disposed) 'Already-exited process is harmless'

  if (-not ('DreamSkinMaintenanceMutexProbe' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Threading;
public static class DreamSkinMaintenanceMutexProbe {
    public static bool CanAcquire(string name) {
        bool acquired = false;
        var thread = new Thread(() => {
            using (var mutex = new Mutex(false, name)) {
                try { acquired = mutex.WaitOne(0); }
                catch (AbandonedMutexException) { acquired = true; }
                if (acquired) mutex.ReleaseMutex();
            }
        });
        thread.Start(); thread.Join(); return acquired;
    }
}
'@
  }
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutexName = "Local\CodexDreamSkin.$sid.ThemeManager"
  $maintenance = Enter-DreamSkinThemeManagerMaintenance
  try {
    Check (-not [DreamSkinMaintenanceMutexProbe]::CanAcquire($mutexName)) 'Maintenance prevents a second thread from starting the manager'
  } finally { $maintenance.ReleaseMutex(); $maintenance.Dispose() }
  Check ([DreamSkinMaintenanceMutexProbe]::CanAcquire($mutexName)) 'Manager may reopen after maintenance releases the gate'

  $bootstrap = [System.IO.File]::ReadAllText((Join-Path $root 'installer\setup-bootstrap.ps1'))
  $installStart = $bootstrap.IndexOf('if ($needsInstall)')
  $closedGuard = $bootstrap.IndexOf('Wait-DreamSkinCodexClosedForSetup', $installStart)
  $closeManager = $bootstrap.IndexOf('Stop-DreamSkinThemeManagerProcess', $installStart)
  $install = $bootstrap.IndexOf("& (Join-Path `$payloadScripts 'install-dream-skin.ps1')", $installStart)
  Check ($closedGuard -gt $installStart -and $closeManager -gt $closedGuard -and $install -gt $closeManager) 'Setup closes manager after Codex guard and before installer acquires Operation lock'
  Write-Host "$script:passes manager maintenance checks passed."
} finally {
  $resolvedFixture = [System.IO.Path]::GetFullPath($fixture)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolvedFixture.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    [System.IO.Path]::GetFileName($resolvedFixture) -notlike 'dreamskin-manager-maintenance-*') { throw 'Unsafe test cleanup target.' }
  Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
