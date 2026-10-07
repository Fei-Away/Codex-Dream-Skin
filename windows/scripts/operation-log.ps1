# Best-effort diagnostics: never change the outcome of the operation being logged.
function Assert-DreamSkinLogPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $current = [IO.Path]::GetFullPath($Path)
  while ($current) {
    try {
      $attributes = [IO.File]::GetAttributes($current)
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Unsafe diagnostic path.'
      }
    } catch [IO.FileNotFoundException] { } catch [IO.DirectoryNotFoundException] { }
    $current = [IO.Path]::GetDirectoryName($current)
  }
}

function ConvertTo-DreamSkinLogText {
  param([AllowNull()][object]$Value, [int]$Limit = 512)
  $text = [string]$Value
  if ($text.Length -gt 2048) { $text = $text.Substring(0, 2048) }
  $text = [regex]::Replace($text, '(?i)(bearer\s+)[^\s,;]+', '$1[redacted]')
  $text = [regex]::Replace($text, '(?i)((?:token|password|secret|authorization|api[-_]?key)\s*[:=]\s*)[^\s,;]+', '$1[redacted]')
  $text = [regex]::Replace($text, '(?i)\bsk-[a-z0-9_-]+', '[redacted]')
  $text = [regex]::Replace($text, '(?i)https?://[^\s"<>]+', '[remote-url]')
  $text = [regex]::Replace($text, '(?i)[a-z]:[\\/][^\r\n"<>|]*', '[local-path]')
  $text = [regex]::Replace($text, '\\\\[^\s"<>|]+', '[network-path]')
  $text = [regex]::Replace($text, '[\x00-\x1f\x7f]', ' ')
  if ($text.Length -gt $Limit) { $text = $text.Substring(0, $Limit) }
  return $text
}

function Write-DreamSkinOperationEvent {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][string]$OperationId,
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Action,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][string]$Outcome,
    [string]$Category = 'none',
    [string]$Message = '',
    [hashtable]$Details
  )
  $mutex = $null; $acquired = $false
  try {
    if ($OperationId -cnotmatch '^[a-f0-9]{32}$') { return $false }
    foreach ($item in @($Source, $Action, $Stage, $Outcome, $Category)) {
      if ($item -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$') { return $false }
    }
    $root = [IO.Path]::GetFullPath($StateRoot)
    $logs = Join-Path $root 'logs'
    Assert-DreamSkinLogPath -Path $logs
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-', '') } finally { $hash.Dispose() }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutex = [Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Log.$key")
    try { $acquired = $mutex.WaitOne(250) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { return $false }
    Assert-DreamSkinLogPath -Path $logs
    [IO.Directory]::CreateDirectory($logs) | Out-Null
    $event = [ordered]@{schemaVersion = 1; timestamp = [DateTimeOffset]::UtcNow.ToString('o'); operationId = $OperationId; source = $Source; action = $Action; stage = $Stage; outcome = $Outcome; category = $Category; message = ConvertTo-DreamSkinLogText $Message}
    if ($Details) {
      $safe = [ordered]@{}
      foreach ($name in @($Details.Keys | Sort-Object | Select-Object -First 8)) {
        if ([string]$name -cmatch '^[a-zA-Z][a-zA-Z0-9]{0,39}$' -and [string]$name -notmatch '(?i)token|secret|password|authorization|key|path') {
          $safe[$name] = ConvertTo-DreamSkinLogText $Details[$name] -Limit 128
        }
      }
      $event['details'] = $safe
    }
    $line = ($event | ConvertTo-Json -Depth 4 -Compress) + "`r`n"
    $encoding = [Text.UTF8Encoding]::new($false)
    $size = $encoding.GetByteCount($line)
    if ($size -gt 8192) { return $false }
    $path = Join-Path $logs 'operations.jsonl'
    foreach ($file in @($path) + @(1..4 | ForEach-Object { Join-Path $logs "operations.$_.jsonl" })) { Assert-DreamSkinLogPath -Path $file }
    # Discard externally inflated diagnostic files rather than archive an
    # unbounded file; ordinary managed rotations preserve all recent events.
    foreach ($file in @($path) + @(1..4 | ForEach-Object { Join-Path $logs "operations.$_.jsonl" })) {
      if ([IO.File]::Exists($file) -and ([IO.FileInfo]$file).Length -gt 5MB) { [IO.File]::Delete($file) }
    }
    if ([IO.File]::Exists($path) -and ([IO.FileInfo]$path).Length + $size -gt 5MB) {
      $last = Join-Path $logs 'operations.4.jsonl'
      if ([IO.File]::Exists($last)) { [IO.File]::Delete($last) }
      for ($index = 3; $index -ge 1; $index--) {
        $old = Join-Path $logs "operations.$index.jsonl"
        if ([IO.File]::Exists($old)) { [IO.File]::Move($old, (Join-Path $logs "operations.$($index + 1).jsonl")) }
      }
      [IO.File]::Move($path, (Join-Path $logs 'operations.1.jsonl'))
    }
    Assert-DreamSkinLogPath -Path $path
    [IO.File]::AppendAllText($path, $line, $encoding)
    return $true
  } catch { return $false } finally {
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    if ($mutex) { $mutex.Dispose() }
  }
}
