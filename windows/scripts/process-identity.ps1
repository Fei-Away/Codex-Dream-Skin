function Enter-MikuRuntimeTransition {
  param(
    [ValidateRange(1000, 120000)]
    [int]$TimeoutMilliseconds = 90000
  )

  $mutex = [System.Threading.Mutex]::new(
    $false,
    'Local\CodexMikuSkinRuntimeTransition'
  )
  $acquired = $false
  try {
    try {
      $acquired = $mutex.WaitOne($TimeoutMilliseconds)
    } catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
    }
    if (-not $acquired) {
      throw "Timed out waiting for the Codex Miku Stage runtime transition lock after $TimeoutMilliseconds ms."
    }
    return $mutex
  } catch {
    if (-not $acquired) { $mutex.Dispose() }
    throw
  }
}

function Exit-MikuRuntimeTransition {
  param(
    [Parameter(Mandatory)]
    [System.Threading.Mutex]$Mutex
  )

  try { $Mutex.ReleaseMutex() } finally { $Mutex.Dispose() }
}

function Get-MikuProcessRecord {
  param(
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId
  )

  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop |
      Select-Object -First 1
  } catch {
    return $null
  }
}

function Test-MikuCommandLineArgument {
  param(
    [string]$CommandLine,
    [string]$ExpectedValue
  )

  if ([string]::IsNullOrWhiteSpace($CommandLine) -or
      [string]::IsNullOrWhiteSpace($ExpectedValue)) {
    return $false
  }
  $argumentPattern = '(?i)(?:^|\s)"?' +
    [regex]::Escape([System.IO.Path]::GetFullPath($ExpectedValue)) +
    '"?(?:\s|$)'
  return [regex]::IsMatch($CommandLine, $argumentPattern)
}

function Test-MikuProcessStartTime {
  param(
    [object]$ProcessRecord,
    [string]$ExpectedStartedAt
  )

  if ([string]::IsNullOrWhiteSpace($ExpectedStartedAt)) { return $false }
  if (-not $ProcessRecord -or -not $ProcessRecord.CreationDate) { return $false }
  try {
    $expected = [DateTimeOffset]::Parse($ExpectedStartedAt).UtcDateTime
    $actual = ([DateTime]$ProcessRecord.CreationDate).ToUniversalTime()
    return [Math]::Abs(($actual - $expected).TotalSeconds) -le 2
  } catch {
    return $false
  }
}

function Test-MikuInjectorProcess {
  param(
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId,
    [string]$InjectorPath,
    [string]$ExecutablePath,
    [ValidateRange(1024, 65535)]
    [int]$Port,
    [string]$InstanceToken,
    [string]$StartedAt
  )

  if ([string]::IsNullOrWhiteSpace($InjectorPath) -or
      [string]::IsNullOrWhiteSpace($ExecutablePath) -or
      [string]::IsNullOrWhiteSpace($InstanceToken) -or
      $InstanceToken -notmatch '^[a-fA-F0-9]{32}$' -or
      [string]::IsNullOrWhiteSpace($StartedAt)) {
    return $false
  }
  $process = Get-MikuProcessRecord -ProcessId $ProcessId
  if (-not $process -or $process.Name -ine 'node.exe') { return $false }
  if ([string]::IsNullOrWhiteSpace([string]$process.ExecutablePath)) {
    return $false
  }

  $expectedInjector = [System.IO.Path]::GetFullPath($InjectorPath)
  $expectedExecutable = [System.IO.Path]::GetFullPath($ExecutablePath)
  $actualExecutable = [System.IO.Path]::GetFullPath([string]$process.ExecutablePath)
  if (-not [string]::Equals(
      $actualExecutable,
      $expectedExecutable,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    return $false
  }
  $commandLine = [string]$process.CommandLine
  $portPattern = '(?i)(?:^|\s)--port(?:=|\s+)"?' +
    [regex]::Escape([string]$Port) + '"?(?:\s|$)'
  $tokenPattern = '(?i)(?:^|\s)--instance-token(?:=|\s+)"?' +
    [regex]::Escape($InstanceToken) + '"?(?:\s|$)'
  return (
    (Test-MikuCommandLineArgument -CommandLine $commandLine -ExpectedValue $expectedInjector) -and
    [regex]::IsMatch($commandLine, '(?i)(?:^|\s)--watch(?:\s|$)') -and
    [regex]::IsMatch($commandLine, $portPattern) -and
    [regex]::IsMatch($commandLine, $tokenPattern) -and
    (Test-MikuProcessStartTime -ProcessRecord $process -ExpectedStartedAt $StartedAt)
  )
}

function Stop-MikuInjectorProcess {
  param(
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId,
    [string]$InjectorPath,
    [string]$ExecutablePath,
    [ValidateRange(1024, 65535)]
    [int]$Port,
    [string]$InstanceToken,
    [string]$StartedAt
  )

  if (-not (Test-MikuInjectorProcess `
      -ProcessId $ProcessId `
      -InjectorPath $InjectorPath `
      -ExecutablePath $ExecutablePath `
      -Port $Port `
      -InstanceToken $InstanceToken `
      -StartedAt $StartedAt)) {
    return $false
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  return $true
}

function Test-MikuHookProcess {
  param(
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId,
    [string]$HookScriptPath,
    [string]$ExecutablePath,
    [ValidateRange(1024, 65535)]
    [int]$Port,
    [string]$InstanceToken,
    [string]$StartedAt
  )

  if ([string]::IsNullOrWhiteSpace($HookScriptPath) -or
      [string]::IsNullOrWhiteSpace($ExecutablePath) -or
      [string]::IsNullOrWhiteSpace($InstanceToken) -or
      $InstanceToken -notmatch '^[a-fA-F0-9]{32}$' -or
      [string]::IsNullOrWhiteSpace($StartedAt)) {
    return $false
  }
  $process = Get-MikuProcessRecord -ProcessId $ProcessId
  if (-not $process -or $process.Name -notin @('powershell.exe', 'pwsh.exe')) { return $false }
  if ([string]::IsNullOrWhiteSpace([string]$process.ExecutablePath)) { return $false }

  $expectedHook = [System.IO.Path]::GetFullPath($HookScriptPath)
  $expectedExecutable = [System.IO.Path]::GetFullPath($ExecutablePath)
  $actualExecutable = [System.IO.Path]::GetFullPath([string]$process.ExecutablePath)
  if (-not [string]::Equals(
      $actualExecutable,
      $expectedExecutable,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    return $false
  }
  $commandLine = [string]$process.CommandLine
  $portPattern = '(?i)(?:^|\s)-Port\s+"?' +
    [regex]::Escape([string]$Port) + '"?(?:\s|$)'
  $tokenPattern = '(?i)(?:^|\s)-InstanceToken\s+"?' +
    [regex]::Escape($InstanceToken) + '"?(?:\s|$)'
  return (
    (Test-MikuCommandLineArgument -CommandLine $commandLine -ExpectedValue $expectedHook) -and
    [regex]::IsMatch($commandLine, $portPattern) -and
    [regex]::IsMatch($commandLine, $tokenPattern) -and
    (Test-MikuProcessStartTime -ProcessRecord $process -ExpectedStartedAt $StartedAt)
  )
}

function Stop-MikuHookProcess {
  param(
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId,
    [string]$HookScriptPath,
    [string]$ExecutablePath,
    [ValidateRange(1024, 65535)]
    [int]$Port,
    [string]$InstanceToken,
    [string]$StartedAt
  )

  if (-not (Test-MikuHookProcess `
      -ProcessId $ProcessId `
      -HookScriptPath $HookScriptPath `
      -ExecutablePath $ExecutablePath `
      -Port $Port `
      -InstanceToken $InstanceToken `
      -StartedAt $StartedAt)) {
    return $false
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  return $true
}
