$script:DreamSkinUtf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
$script:DreamSkinLegacyAppearanceTheme = 'appearanceTheme = "light"'
$script:DreamSkinManagedLightCodeTheme = 'appearanceLightCodeThemeId = "codex"'
$script:DreamSkinManagedLightChromeTheme = 'appearanceLightChromeTheme = { accent = "#B65CFF", contrast = 64, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "#4A235F", opaqueWindows = true, semanticColors = { diffAdded = "#BCE8CF", diffRemoved = "#F7B8CE", skill = "#C47BFF" }, surface = "#FFF4FA" }'
$script:DreamSkinManagedAppearanceKeys = @(
  'appearanceTheme',
  'appearanceLightCodeThemeId',
  'appearanceLightChromeTheme'
)
$script:DreamSkinMaxAppearanceTransactionBytes = 65536

function ConvertFrom-DreamSkinUtf8Bytes {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes,
    [Parameter(Mandatory = $true)][string]$Path
  )

  try {
    $offset = if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) { 3 } else { 0 }
    $content = $script:DreamSkinUtf8NoBom.GetString($Bytes, $offset, $Bytes.Length - $offset)
    if ($content.IndexOf([char]0) -ge 0) {
      throw "Refusing to rewrite a config file containing NUL characters (possibly BOM-less UTF-16): $Path"
    }
    return $content
  } catch [System.Text.DecoderFallbackException] {
    throw "Refusing to rewrite a config file that is not valid UTF-8: $Path"
  }
}

function Test-DreamSkinBytesEqual {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Left,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Right
  )
  if ($Left.Length -ne $Right.Length) { return $false }
  for ($index = 0; $index -lt $Left.Length; $index++) {
    if ($Left[$index] -ne $Right[$index]) { return $false }
  }
  return $true
}

function Assert-DreamSkinFileUnchanged {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [AllowNull()][byte[]]$ExpectedBytes
  )
  if ($null -eq $ExpectedBytes) {
    if (Test-Path -LiteralPath $Path) { throw "File changed during the operation; retry without other writers: $Path" }
    return
  }
  if (-not (Test-Path -LiteralPath $Path)) { throw "File disappeared during the operation; retry: $Path" }
  $currentBytes = [System.IO.File]::ReadAllBytes($Path)
  if (-not (Test-DreamSkinBytesEqual -Left $ExpectedBytes -Right $currentBytes)) {
    throw "File changed during the operation; retry without other writers: $Path"
  }
}

function Get-DreamSkinNewLine {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)
  if ($Content.Contains("`r`n")) { return "`r`n" }
  return "`n"
}

function Read-DreamSkinUtf8File {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  return (ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $Path)
}

function Write-DreamSkinUtf8FileAtomically {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Content,

    [AllowNull()]
    [byte[]]$ExpectedBytes
  )

  $bytes = $script:DreamSkinUtf8NoBom.GetBytes($Content)
  if ($PSBoundParameters.ContainsKey('ExpectedBytes')) {
    Write-DreamSkinBytesAtomically -Path $Path -Bytes $bytes -ExpectedBytes $ExpectedBytes
  } else {
    Write-DreamSkinBytesAtomically -Path $Path -Bytes $bytes
  }
}

function Remove-DreamSkinAtomicArtifact {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ([System.IO.File]::Exists($Path)) {
    [System.IO.File]::Delete($Path)
  }
}

function Read-DreamSkinAtomicArtifactBytes {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.File]::ReadAllBytes($Path)
}

function Restore-DreamSkinReplacedConflict {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][string]$ConflictBackupPath,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$AppliedBytes
  )

  # File.Replace gives us the exact destination bytes present at the instant of
  # replacement. If they differ from the precondition, put that newer value
  # back. A later writer always wins: if the destination changes while recovery
  # is running, leave its value in place instead of overwriting it again.
  $restoreSource = $ConflictBackupPath
  $expectedCurrent = $AppliedBytes
  for ($attempt = 0; $attempt -lt 8; $attempt++) {
    $sourceBytes = Read-DreamSkinAtomicArtifactBytes -Path $restoreSource
    $currentBytes = [System.IO.File]::ReadAllBytes($DestinationPath)
    if (-not (Test-DreamSkinBytesEqual -Left $expectedCurrent -Right $currentBytes)) {
      Remove-DreamSkinAtomicArtifact -Path $restoreSource
      return
    }

    $directory = [System.IO.Path]::GetDirectoryName($DestinationPath)
    $fileName = [System.IO.Path]::GetFileName($DestinationPath)
    $rollbackBackup = Join-Path $directory (
      ".$fileName.$PID.$([guid]::NewGuid().ToString('N')).conflict-backup"
    )
    try {
      [System.IO.File]::Replace($restoreSource, $DestinationPath, $rollbackBackup)
      $replacedBytes = Read-DreamSkinAtomicArtifactBytes -Path $rollbackBackup
      if (Test-DreamSkinBytesEqual -Left $expectedCurrent -Right $replacedBytes) {
        Remove-DreamSkinAtomicArtifact -Path $rollbackBackup
        return
      }

      # A writer landed between our read and replacement. The backup now holds
      # that still-newer value, so make it the next value to restore.
      $restoreSource = $rollbackBackup
      $expectedCurrent = $sourceBytes
    } catch {
      # Do not remove either backup here. One of them can be the only copy of a
      # writer that lost the replacement race; retaining a recovery artifact is
      # safer than silently discarding that data.
      throw "Conflicting file bytes were retained for manual recovery after replacement failed: $restoreSource; $rollbackBackup"
    }
  }

  throw "File kept changing; the newest captured bytes were retained for manual recovery: $restoreSource"
}

function Write-DreamSkinBytesAtomically {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes,
    [AllowNull()][byte[]]$ExpectedBytes
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $directory = [System.IO.Path]::GetDirectoryName($fullPath)
  if (-not [System.IO.Directory]::Exists($directory)) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }
  $fileName = [System.IO.Path]::GetFileName($fullPath)
  $operationId = "$PID.$([guid]::NewGuid().ToString('N'))"
  $temporary = Join-Path $directory ".$fileName.$operationId.tmp"
  $replacementBackup = Join-Path $directory ".$fileName.$operationId.replace-backup"
  $preserveReplacementBackup = $false

  try {
    [System.IO.File]::WriteAllBytes($temporary, $Bytes)
    if ($PSBoundParameters.ContainsKey('ExpectedBytes')) {
      Assert-DreamSkinFileUnchanged -Path $fullPath -ExpectedBytes $ExpectedBytes
    }
    if ($PSBoundParameters.ContainsKey('ExpectedBytes') -and $null -eq $ExpectedBytes) {
      # A move is the absent-file CAS: it fails atomically if another writer
      # creates the destination after the precondition check.
      [System.IO.File]::Move($temporary, $fullPath)
    } elseif ($PSBoundParameters.ContainsKey('ExpectedBytes')) {
      # Replace unconditionally on this branch: if the destination disappeared,
      # File.Replace must fail instead of recreating a concurrently deleted file.
      $preserveReplacementBackup = $true
      [System.IO.File]::Replace($temporary, $fullPath, $replacementBackup)
      $replacedBytes = Read-DreamSkinAtomicArtifactBytes -Path $replacementBackup
      if (-not (Test-DreamSkinBytesEqual -Left $ExpectedBytes -Right $replacedBytes)) {
        Restore-DreamSkinReplacedConflict -DestinationPath $fullPath `
          -ConflictBackupPath $replacementBackup -AppliedBytes $Bytes
        throw "File changed during the final atomic replacement; the newer value was restored: $fullPath"
      }
      $preserveReplacementBackup = $false
    } elseif ([System.IO.File]::Exists($fullPath)) {
      [System.IO.File]::Replace($temporary, $fullPath, $replacementBackup)
    } else {
      # Move fails rather than overwriting if a writer creates the destination
      # after the absent-file precondition check.
      [System.IO.File]::Move($temporary, $fullPath)
    }
  } finally {
    $artifacts = @($temporary)
    if (-not $preserveReplacementBackup) { $artifacts += $replacementBackup }
    foreach ($artifact in $artifacts) {
      try {
        Remove-DreamSkinAtomicArtifact -Path $artifact
      } catch {
        try {
          Write-Warning "Could not remove temporary atomic config artifact '$artifact': $($_.Exception.Message)"
        } catch {
          # Cleanup must never mask the result of the atomic write.
        }
      }
    }
  }
}

function Get-DreamSkinTomlKeyTokenPattern {
  param([Parameter(Mandatory = $true)][string]$Key)
  $bare = [regex]::Escape($Key)
  $doubleQuoted = [regex]::Escape('"' + $Key + '"')
  $singleQuoted = [regex]::Escape("'" + $Key + "'")
  return "(?:$bare|$doubleQuoted|$singleQuoted)"
}

function ConvertTo-DreamSkinTomlAsciiEscapeProbe {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

  $result = $Value
  $characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.ToCharArray()
  foreach ($character in $characters) {
    $code = ([int][char]$character).ToString('x2')
    $pattern = '(?i)\\(?:u00' + $code + '|U000000' + $code + ')'
    $result = [regex]::Replace($result, $pattern, [string]$character)
  }
  return $result
}

function Get-DreamSkinTomlArrayBracketBalance {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line)

  $quote = $null
  $escaped = $false
  $balance = 0
  for ($index = 0; $index -lt $Line.Length; $index++) {
    $character = $Line[$index]
    if ($null -eq $quote) {
      if ($character -eq '#') { break }
      if ($character -eq '"' -or $character -eq "'") { $quote = $character }
      elseif ($character -eq '[') { $balance++ }
      elseif ($character -eq ']') { $balance-- }
      continue
    }
    if ($quote -eq '"') {
      if ($escaped) { $escaped = $false; continue }
      if ($character -eq '\') { $escaped = $true; continue }
    }
    if ($character -eq $quote) { $quote = $null }
  }
  return $balance
}

function Get-DreamSkinTomlLineStructure {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line)

  $builder = [System.Text.StringBuilder]::new()
  $quote = $null
  $escaped = $false
  for ($index = 0; $index -lt $Line.Length; $index++) {
    $character = $Line[$index]
    if ($quote -eq '"') {
      if ($escaped) { $escaped = $false; continue }
      if ($character -eq '\') { $escaped = $true; continue }
      if ($character -eq $quote) { $quote = $null }
      continue
    }
    if ($quote -eq "'") {
      if ($character -eq $quote) { $quote = $null }
      continue
    }
    if ($character -eq '"' -or $character -eq "'") {
      $quote = $character
      continue
    }
    if ($character -eq '#') { break }
    [void]$builder.Append($character)
  }
  return $builder.ToString()
}

function Test-DreamSkinTomlTableHeaderStructure {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Structure)

  $value = $Structure.Trim()
  if ($value.StartsWith('[[')) {
    return $value.EndsWith(']]') -and
      -not $value.Substring(2, $value.Length - 4).Contains('[') -and
      -not $value.Substring(2, $value.Length - 4).Contains(']')
  }
  return $value.StartsWith('[') -and
    -not $value.StartsWith('[[') -and
    $value.EndsWith(']') -and
    -not $value.Substring(1, $value.Length - 2).Contains('[') -and
    -not $value.Substring(1, $value.Length - 2).Contains(']')
}

function Update-DreamSkinTomlArrayDepth {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Structure,
    [Parameter(Mandatory = $true)][int]$InitialDepth
  )

  $depth = $InitialDepth
  for ($index = 0; $index -lt $Structure.Length; $index++) {
    $character = $Structure[$index]
    if ($character -eq '[') { $depth++ }
    if ($character -eq ']') { $depth-- }
    if ($depth -lt 0) {
      throw 'Refusing to rewrite TOML containing an unmatched array bracket.'
    }
  }
  return $depth
}

function Get-DreamSkinTomlTableHeaders {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)

  $headers = @()
  $offset = 0
  $arrayDepth = 0
  $lines = [regex]::Matches($Content, '[^\n]*\n|[^\n]+$')
  $desktopToken = Get-DreamSkinTomlKeyTokenPattern -Key 'desktop'
  foreach ($lineMatch in $lines) {
    $line = $lineMatch.Value
    $structure = (Get-DreamSkinTomlLineStructure -Line $line).Trim()
    if ($arrayDepth -eq 0 -and (Test-DreamSkinTomlTableHeaderStructure -Structure $structure)) {
      $headers += [pscustomobject]@{
        Index = $offset
        BodyStart = $offset + $line.Length
        Line = $line
        IsDesktop = [regex]::IsMatch(
          $line,
          "^[\t ]*\[[\t ]*$desktopToken[\t ]*\][\t ]*(?:#[^\r\n]*)?(?:\r?\n)?$"
        )
        IsDesktopArray = [regex]::IsMatch(
          $line,
          "^[\t ]*\[\[[\t ]*$desktopToken[\t ]*(?:\]\]|\.)"
        )
      }
    } else {
      $assignment = $structure.IndexOf('=')
      if ($arrayDepth -eq 0 -and $assignment -lt 0) {
        if ($structure.Contains('[') -or $structure.Contains(']')) {
          throw 'Refusing to rewrite malformed TOML array syntax.'
        }
      } else {
        $expression = if ($arrayDepth -gt 0) { $structure } else { $structure.Substring($assignment + 1) }
        $arrayDepth = Update-DreamSkinTomlArrayDepth -Structure $expression -InitialDepth $arrayDepth
      }
    }
    $offset += $line.Length
  }
  if ($arrayDepth -ne 0) {
    throw 'Refusing to rewrite TOML containing an unterminated array.'
  }
  return @($headers)
}

function Assert-DreamSkinTomlLineEditingSafe {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)

  if ($Content.Contains('"""') -or $Content.Contains("'''")) {
    throw 'Refusing to rewrite TOML containing multiline strings; use single-line values before installing Dream Skin.'
  }
  $null = Get-DreamSkinTomlTableHeaders -Content $Content

  $probe = ConvertTo-DreamSkinTomlAsciiEscapeProbe -Value $Content
  if ($probe -cne $Content) {
    $desktopToken = Get-DreamSkinTomlKeyTokenPattern -Key 'desktop'
    $desktopShape = "(?m)^[\t ]*(?:\[\[?[\t ]*$desktopToken[\t ]*(?:\]|\.)|$desktopToken[\t ]*(?:\.|=))"
    $rawDesktopShapes = [regex]::Matches($Content, $desktopShape).Count
    $probedDesktopShapes = [regex]::Matches($probe, $desktopShape).Count
    if ($probedDesktopShapes -gt $rawDesktopShapes) {
      throw 'Refusing to rewrite an escaped TOML key equivalent to desktop; normalize the key spelling first.'
    }
  }
}

function Get-DreamSkinDesktopSectionPattern {
  $desktopToken = Get-DreamSkinTomlKeyTokenPattern -Key 'desktop'
  return "(?ms)^[\t ]*\[[\t ]*$desktopToken[\t ]*\][\t ]*(?:#[^\r\n]*)?(?:\r?\n|(?=\z))(?<body>.*?)(?=^[\t ]*\[\[?|\z)"
}

function Test-DreamSkinDesktopNestedTable {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
    [Parameter(Mandatory = $true)][string]$Key
  )

  $desktopToken = Get-DreamSkinTomlKeyTokenPattern -Key 'desktop'
  $keyToken = Get-DreamSkinTomlKeyTokenPattern -Key $Key
  foreach ($header in @(Get-DreamSkinTomlTableHeaders -Content $Content)) {
    if ([regex]::IsMatch(
        $header.Line,
        "^[\t ]*\[[\t ]*$desktopToken[\t ]*\.[\t ]*$keyToken[\t ]*(?:\]|\.)"
      )) {
      return $true
    }
  }
  return $false
}

function Assert-DreamSkinDesktopShapeSupported {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)

  Assert-DreamSkinTomlLineEditingSafe -Content $Content
  $headers = @(Get-DreamSkinTomlTableHeaders -Content $Content)
  if (@($headers | Where-Object { $_.IsDesktop }).Count -gt 1) {
    throw 'Refusing to rewrite multiple equivalent [desktop] tables.'
  }

  if (@($headers | Where-Object { $_.IsDesktopArray }).Count -gt 0) {
    throw 'Refusing to rewrite a config that represents desktop as an array of tables.'
  }
  foreach ($key in @('appearanceTheme', 'appearanceLightCodeThemeId')) {
    if (Test-DreamSkinDesktopNestedTable -Content $Content -Key $key) {
      throw "Refusing to replace '$key' because it is represented as a nested desktop table."
    }
  }

  $desktopToken = Get-DreamSkinTomlKeyTokenPattern -Key 'desktop'
  $firstTable = @($headers)[0]
  $rootContent = if ($null -ne $firstTable) { $Content.Substring(0, $firstTable.Index) } else { $Content }
  if ([regex]::IsMatch($rootContent, "(?m)^[\t ]*$desktopToken[\t ]*(?:\.|=)")) {
    throw 'Refusing to rewrite root dotted or inline desktop keys; normalize them to a [desktop] table first.'
  }

  $desktop = Get-DreamSkinDesktopSection -Content $Content
  if ($null -ne $desktop) {
    $bodyProbe = ConvertTo-DreamSkinTomlAsciiEscapeProbe -Value $desktop.Body
    foreach ($key in @('appearanceTheme', 'appearanceLightCodeThemeId', 'appearanceLightChromeTheme')) {
      $keyToken = Get-DreamSkinTomlKeyTokenPattern -Key $key
      $settingShape = "(?m)^[\t ]*$keyToken[\t ]*(?:\.|=)"
      if ($key -eq 'appearanceLightChromeTheme' -and
        (Test-DreamSkinDesktopNestedTable -Content $Content -Key $key) -and
        [regex]::IsMatch($desktop.Body, $settingShape)) {
        throw "Refusing to rewrite '$key' because both a scalar and nested table are present."
      }
      if ([regex]::Matches($bodyProbe, $settingShape).Count -gt
        [regex]::Matches($desktop.Body, $settingShape).Count) {
        throw "Refusing to rewrite an escaped TOML key equivalent to '$key'."
      }
      if ([regex]::IsMatch($desktop.Body, "(?m)^[\t ]*$keyToken[\t ]*\.")) {
        throw "Refusing to replace dotted '$key' keys in the [desktop] table."
      }
    }
  }
}

function Get-DreamSkinDesktopSection {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)

  $headers = @(Get-DreamSkinTomlTableHeaders -Content $Content)
  $desktopHeaders = @($headers | Where-Object { $_.IsDesktop })
  if ($desktopHeaders.Count -eq 0) { return $null }
  if ($desktopHeaders.Count -gt 1) { throw 'Refusing to rewrite multiple equivalent [desktop] tables.' }
  $desktopHeader = $desktopHeaders[0]
  $headerIndex = [array]::IndexOf($headers, $desktopHeader)
  $bodyEnd = if ($headerIndex -ge 0 -and $headerIndex + 1 -lt $headers.Count) {
    $headers[$headerIndex + 1].Index
  } else {
    $Content.Length
  }
  $bodyLength = $bodyEnd - $desktopHeader.BodyStart
  return [pscustomobject]@{
    Body = $Content.Substring($desktopHeader.BodyStart, $bodyLength)
    BodyStart = $desktopHeader.BodyStart
    BodyLength = $bodyLength
    SectionStart = $desktopHeader.Index
    SectionLength = $bodyEnd - $desktopHeader.Index
  }
}

function Add-DreamSkinDesktopSection {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
    [Parameter(Mandatory = $true)][string]$NewLine
  )

  if ($Content.Length -eq 0) { return "[desktop]$NewLine" }
  $separator = if ($Content.EndsWith("`n")) { $NewLine } else { $NewLine + $NewLine }
  return $Content + $separator + "[desktop]$NewLine"
}

function Set-DreamSkinSectionSetting {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Body,
    [Parameter(Mandatory = $true)][string]$Key,
    [AllowNull()][object]$Line,
    [Parameter(Mandatory = $true)][string]$NewLine
  )

  $keyToken = Get-DreamSkinTomlKeyTokenPattern -Key $Key
  $lineMatches = [regex]::Matches($Body, "(?m)^[\t ]*$keyToken[\t ]*=.*$")
  if ($lineMatches.Count -gt 1) {
    throw "Refusing to rewrite duplicate '$Key' entries in the [desktop] section."
  }
  foreach ($lineMatch in $lineMatches) {
    if ((Get-DreamSkinTomlArrayBracketBalance -Line $lineMatch.Value) -ne 0) {
      throw "Refusing to rewrite multiline '$Key' settings in the [desktop] section."
    }
  }
  $pattern = "(?m)^[\t ]*$keyToken[\t ]*=[^\r\n]*(?:\r?\n|(?=\z))"
  $matcher = [regex]::new($pattern)
  if ($null -eq $Line) { return $matcher.Replace($Body, '', 1) }
  $normalizedLine = $Line.TrimEnd("`r", "`n") + $NewLine
  if ($matcher.IsMatch($Body)) {
    $literalReplacement = $normalizedLine.Replace('$', '$$')
    return $matcher.Replace($Body, $literalReplacement, 1)
  }
  $separator = if ($Body.Length -eq 0 -or $Body.EndsWith("`n")) { '' } else { $NewLine }
  return $Body + $separator + $normalizedLine
}

function Get-DreamSkinSectionSettingLine {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Body,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $keyToken = Get-DreamSkinTomlKeyTokenPattern -Key $Key
  $matches = [regex]::Matches($Body, "(?m)^[\t ]*$keyToken[\t ]*=.*$")
  if ($matches.Count -gt 1) { throw "Refusing to inspect duplicate '$Key' entries in the [desktop] section." }
  if ($matches.Count -eq 0) { return $null }
  if ((Get-DreamSkinTomlArrayBracketBalance -Line $matches[0].Value) -ne 0) {
    throw "Refusing to inspect multiline '$Key' settings in the [desktop] section."
  }
  return $matches[0].Value.Trim()
}

function Test-DreamSkinLegacyManagedLightTrio {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)
  $desktop = Get-DreamSkinDesktopSection -Content $Content
  if ($null -eq $desktop) { return $false }
  return (
    (Get-DreamSkinSectionSettingLine -Body $desktop.Body -Key 'appearanceTheme') -ceq
      $script:DreamSkinLegacyAppearanceTheme -and
    (Get-DreamSkinSectionSettingLine -Body $desktop.Body -Key 'appearanceLightCodeThemeId') -ceq
      $script:DreamSkinManagedLightCodeTheme -and
    (Get-DreamSkinSectionSettingLine -Body $desktop.Body -Key 'appearanceLightChromeTheme') -ceq
      $script:DreamSkinManagedLightChromeTheme
  )
}

function Get-DreamSkinAppearanceMarkerPath {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  return "$BackupPath.appearance.json"
}

function ConvertFrom-DreamSkinAppearanceMarkerContent {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
    [Parameter(Mandatory = $true)][string]$Path
  )
  try {
    $marker = $Content | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Dream Skin appearance marker is unreadable; config was preserved: $Path"
  }
  if ($null -eq $marker -or $marker -is [string] -or $marker -is [array]) {
    throw "Dream Skin appearance marker is invalid; config was preserved: $Path"
  }
  $schemaVersion = 0
  try { $schemaVersion = [int]$marker.schemaVersion } catch { $schemaVersion = 0 }
  # v1 markers are always unmanaged; v2 markers may pin appearanceTheme. A v3
  # absent marker is a compare-and-replace tombstone used when an operation
  # cannot safely recreate a physically absent file without a delete race.
  $validUnmanagedV1 = $schemaVersion -eq 1 -and $marker.appearanceThemeManaged -is [bool] -and
    -not [bool]$marker.appearanceThemeManaged
  $validV2 = $schemaVersion -eq 2 -and $marker.appearanceThemeManaged -is [bool]
  $validAbsentV3 = $schemaVersion -eq 3 -and $marker.appearanceThemeManaged -is [bool] -and
    -not [bool]$marker.appearanceThemeManaged -and $marker.logicalState -is [string] -and
    "$($marker.logicalState)" -ceq 'absent'
  if (-not ($validUnmanagedV1 -or $validV2 -or $validAbsentV3)) {
    throw "Dream Skin appearance marker is invalid; config was preserved: $Path"
  }
  return $marker
}

function Read-DreamSkinAppearanceMarker {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  if (-not (Test-Path -LiteralPath $markerPath)) { return $null }
  $bytes = [System.IO.File]::ReadAllBytes($markerPath)
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $markerPath
  return ConvertFrom-DreamSkinAppearanceMarkerContent -Content $content -Path $markerPath
}

function Test-DreamSkinAppearanceMarkerLogicalAbsent {
  param([AllowNull()][object]$Marker)
  if ($null -eq $Marker) { return $true }
  $schemaVersion = 0
  try { $schemaVersion = [int]$Marker.schemaVersion } catch { return $false }
  return $schemaVersion -eq 3 -and "$($Marker.logicalState)" -ceq 'absent'
}

function Get-DreamSkinAppearanceMarkerContent {
  param([bool]$Managed = $false)
  $schemaVersion = 1
  if ($Managed) { $schemaVersion = 2 }
  $marker = [ordered]@{
    schemaVersion = $schemaVersion
    appearanceThemeManaged = $Managed
  } | ConvertTo-Json
  return ($marker + "`r`n")
}

function Get-DreamSkinLogicalAbsentAppearanceMarkerContent {
  $marker = [ordered]@{
    schemaVersion = 3
    appearanceThemeManaged = $false
    logicalState = 'absent'
  } | ConvertTo-Json
  return ($marker + "`r`n")
}

function Write-DreamSkinAppearanceMarker {
  param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [bool]$Managed = $false,
    [AllowNull()][byte[]]$ExpectedBytes
  )
  $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $markerPath
  }
  $content = Get-DreamSkinAppearanceMarkerContent -Managed $Managed
  if ($PSBoundParameters.ContainsKey('ExpectedBytes')) {
    Write-DreamSkinUtf8FileAtomically -Path $markerPath -Content $content -ExpectedBytes $ExpectedBytes
  } else {
    Write-DreamSkinUtf8FileAtomically -Path $markerPath -Content $content
  }
}

function Get-DreamSkinAppearanceMarkerSnapshot {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    return [pscustomobject]@{ Exists = $false; Bytes = $null; Marker = $null }
  }
  $bytes = [System.IO.File]::ReadAllBytes($markerPath)
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $markerPath
  $marker = ConvertFrom-DreamSkinAppearanceMarkerContent -Content $content -Path $markerPath
  return [pscustomobject]@{ Exists = $true; Bytes = $bytes; Marker = $marker }
}

function Get-DreamSkinExactSectionSettingEntry {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Body,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $keyToken = Get-DreamSkinTomlKeyTokenPattern -Key $Key
  $matches = [regex]::Matches($Body, "(?m)^[\t ]*$keyToken[\t ]*=.*$")
  if ($matches.Count -gt 1) { throw "Refusing to inspect duplicate '$Key' entries in the [desktop] section." }
  if ($matches.Count -eq 0) {
    return [pscustomobject]@{ Key = $Key; Exists = $false; Line = $null }
  }
  if ((Get-DreamSkinTomlArrayBracketBalance -Line $matches[0].Value) -ne 0) {
    throw "Refusing to inspect multiline '$Key' settings in the [desktop] section."
  }
  return [pscustomobject]@{
    Key = $Key
    Exists = $true
    Line = $matches[0].Value.TrimEnd("`r", "`n")
  }
}

function New-DreamSkinManagedAppearanceSnapshot {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
    [Parameter(Mandatory = $true)][object]$MarkerSnapshot
  )
  Assert-DreamSkinDesktopShapeSupported -Content $Content
  $desktop = Get-DreamSkinDesktopSection -Content $Content
  $body = if ($null -ne $desktop) { $desktop.Body } else { '' }
  $desktopInsertionSeparator = ''
  if ($null -eq $desktop -and $Content.Length -gt 0) {
    $newLine = Get-DreamSkinNewLine -Content $Content
    $desktopInsertionSeparator = if ($Content.EndsWith("`n")) {
      $newLine
    } else {
      $newLine + $newLine
    }
  }
  $keys = @()
  foreach ($key in $script:DreamSkinManagedAppearanceKeys) {
    $keys += Get-DreamSkinExactSectionSettingEntry -Body $body -Key $key
  }
  return [pscustomobject]@{
    SchemaVersion = 1
    DesktopExists = $null -ne $desktop
    DesktopInsertionSeparator = $desktopInsertionSeparator
    Keys = @($keys)
    Marker = $MarkerSnapshot
  }
}

function Get-DreamSkinManagedAppearanceSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$BackupPath
  )
  $bytes = [System.IO.File]::ReadAllBytes($ConfigPath)
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $ConfigPath
  $marker = Get-DreamSkinAppearanceMarkerSnapshot -BackupPath $BackupPath
  $snapshot = New-DreamSkinManagedAppearanceSnapshot -Content $content -MarkerSnapshot $marker
  $snapshot | Add-Member -NotePropertyName ConfigBytes -NotePropertyValue $bytes
  $snapshot | Add-Member -NotePropertyName ConfigContent -NotePropertyValue $content
  return $snapshot
}

function Get-DreamSkinManagedAppearanceEntry {
  param(
    [Parameter(Mandatory = $true)][object]$Snapshot,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $matches = @($Snapshot.Keys | Where-Object { "$($_.Key)" -ceq $Key })
  if ($matches.Count -ne 1) { throw "Appearance snapshot does not contain exactly one '$Key' entry." }
  return $matches[0]
}

function Compare-DreamSkinManagedAppearanceEntry {
  param(
    [Parameter(Mandatory = $true)][object]$Left,
    [Parameter(Mandatory = $true)][object]$Right
  )
  if ([bool]$Left.Exists -ne [bool]$Right.Exists) { return $false }
  if (-not [bool]$Left.Exists) { return $true }
  return "$($Left.Line)" -ceq "$($Right.Line)"
}

function Compare-DreamSkinAppearanceMarkerSnapshot {
  param(
    [Parameter(Mandatory = $true)][object]$Left,
    [Parameter(Mandatory = $true)][object]$Right
  )
  if ([bool]$Left.Exists -ne [bool]$Right.Exists) { return $false }
  if (-not [bool]$Left.Exists) { return $true }
  return Test-DreamSkinBytesEqual -Left $Left.Bytes -Right $Right.Bytes
}

function Assert-DreamSkinJsonObjectShape {
  param(
    [Parameter(Mandatory = $true)][object]$Value,
    [Parameter(Mandatory = $true)][string[]]$Properties,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if ($null -eq $Value -or $Value -is [string] -or $Value -is [array]) {
    throw "$Label is not an object."
  }
  $actual = @($Value.PSObject.Properties | ForEach-Object { $_.Name })
  if ($actual.Count -ne $Properties.Count) { throw "$Label has an unexpected shape." }
  foreach ($name in $actual) {
    if ($Properties -cnotcontains $name) { throw "$Label contains an unexpected field." }
  }
}

function Get-DreamSkinAppearanceTransactionPath {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  return "$BackupPath.startup-appearance.json"
}

function ConvertTo-DreamSkinAppearanceMarkerRecord {
  param([Parameter(Mandatory = $true)][object]$Snapshot)
  return [ordered]@{
    exists = [bool]$Snapshot.Exists
    bytesBase64 = if ([bool]$Snapshot.Exists) { [Convert]::ToBase64String($Snapshot.Bytes) } else { '' }
  }
}

function ConvertFrom-DreamSkinAppearanceMarkerRecord {
  param(
    [Parameter(Mandatory = $true)][object]$Record,
    [Parameter(Mandatory = $true)][string]$MarkerPath
  )
  Assert-DreamSkinJsonObjectShape -Value $Record `
    -Properties @('exists', 'bytesBase64') -Label 'Startup appearance marker snapshot'
  if ($Record.exists -isnot [bool] -or $Record.bytesBase64 -isnot [string]) {
    throw 'Startup appearance marker snapshot has invalid values.'
  }
  if (-not [bool]$Record.exists) {
    if ("$($Record.bytesBase64)" -cne '') {
      throw 'An absent startup appearance marker snapshot contains bytes.'
    }
    return [pscustomobject]@{ Exists = $false; Bytes = $null; Marker = $null }
  }
  try { $bytes = [Convert]::FromBase64String("$($Record.bytesBase64)") } catch {
    throw 'Startup appearance marker snapshot is not valid base64.'
  }
  if ($bytes.Length -le 0 -or $bytes.Length -gt 16384) {
    throw 'Startup appearance marker snapshot exceeds its size limit.'
  }
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $MarkerPath
  $marker = ConvertFrom-DreamSkinAppearanceMarkerContent -Content $content -Path $MarkerPath
  return [pscustomobject]@{ Exists = $true; Bytes = $bytes; Marker = $marker }
}

function ConvertTo-DreamSkinManagedAppearanceSnapshotRecord {
  param([Parameter(Mandatory = $true)][object]$Snapshot)
  $keys = @()
  foreach ($key in $script:DreamSkinManagedAppearanceKeys) {
    $entry = Get-DreamSkinManagedAppearanceEntry -Snapshot $Snapshot -Key $key
    $keys += [ordered]@{
      key = $key
      exists = [bool]$entry.Exists
      line = if ([bool]$entry.Exists) { "$($entry.Line)" } else { $null }
    }
  }
  return [ordered]@{
    desktopExists = [bool]$Snapshot.DesktopExists
    desktopInsertionSeparator = "$($Snapshot.DesktopInsertionSeparator)"
    keys = @($keys)
    marker = ConvertTo-DreamSkinAppearanceMarkerRecord -Snapshot $Snapshot.Marker
  }
}

function ConvertFrom-DreamSkinManagedAppearanceSnapshotRecord {
  param(
    [Parameter(Mandatory = $true)][object]$Record,
    [Parameter(Mandatory = $true)][string]$MarkerPath
  )
  Assert-DreamSkinJsonObjectShape -Value $Record `
    -Properties @('desktopExists', 'desktopInsertionSeparator', 'keys', 'marker') `
    -Label 'Startup appearance config snapshot'
  if ($Record.desktopExists -isnot [bool] -or
    $Record.desktopInsertionSeparator -isnot [string] -or
    @('', "`n", "`n`n", "`r`n", "`r`n`r`n") -cnotcontains
      "$($Record.desktopInsertionSeparator)") {
    throw 'Startup appearance config snapshot has invalid desktop metadata.'
  }
  $records = @($Record.keys)
  if ($records.Count -ne $script:DreamSkinManagedAppearanceKeys.Count) {
    throw 'Startup appearance config snapshot has an invalid key count.'
  }
  $keys = @()
  foreach ($entry in $records) {
    Assert-DreamSkinJsonObjectShape -Value $entry -Properties @('key', 'exists', 'line') `
      -Label 'Startup appearance config entry'
    if ($entry.key -isnot [string] -or
      $script:DreamSkinManagedAppearanceKeys -cnotcontains "$($entry.key)" -or
      $entry.exists -isnot [bool] -or
      ([bool]$entry.exists -and $entry.line -isnot [string]) -or
      (-not [bool]$entry.exists -and $null -ne $entry.line) -or
      ([bool]$entry.exists -and "$($entry.line)".Length -gt 32768) -or
      ([bool]$entry.exists -and
        ("$($entry.line)".Contains("`r") -or "$($entry.line)".Contains("`n")))) {
      throw 'Startup appearance config entry has invalid values.'
    }
    if ([bool]$entry.exists) {
      $parsedEntry = Get-DreamSkinExactSectionSettingEntry `
        -Body ("$($entry.line)" + "`n") -Key "$($entry.key)"
      if (-not [bool]$parsedEntry.Exists -or "$($parsedEntry.Line)" -cne "$($entry.line)") {
        throw 'Startup appearance config entry does not match its managed key.'
      }
    }
    $keys += [pscustomobject]@{
      Key = "$($entry.key)"
      Exists = [bool]$entry.exists
      Line = if ([bool]$entry.exists) { "$($entry.line)" } else { $null }
    }
  }
  if (@($keys.Key | Select-Object -Unique).Count -ne
    $script:DreamSkinManagedAppearanceKeys.Count) {
    throw 'Startup appearance config snapshot contains duplicate keys.'
  }
  return [pscustomobject]@{
    SchemaVersion = 1
    DesktopExists = [bool]$Record.desktopExists
    DesktopInsertionSeparator = "$($Record.desktopInsertionSeparator)"
    Keys = @($keys)
    Marker = ConvertFrom-DreamSkinAppearanceMarkerRecord `
      -Record $Record.marker -MarkerPath $MarkerPath
  }
}

function Get-DreamSkinAppearanceTransactionContent {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('preparing', 'committed')][string]$Stage,
    [Parameter(Mandatory = $true)][string]$TransactionId,
    [AllowNull()][object]$Transaction
  )
  if ($TransactionId -cnotmatch '\A[a-f0-9]{32}\z') {
    throw 'Startup appearance transaction ID is invalid.'
  }
  $record = [ordered]@{
    schemaVersion = 1
    stage = $Stage
    transactionId = $TransactionId
  }
  if ($Stage -ceq 'preparing') {
    if ($null -eq $Transaction) { throw 'Preparing startup appearance transaction is missing.' }
    $record.before = ConvertTo-DreamSkinManagedAppearanceSnapshotRecord `
      -Snapshot $Transaction.Before
    $record.applied = ConvertTo-DreamSkinManagedAppearanceSnapshotRecord `
      -Snapshot $Transaction.Applied
    $record.touchedKeys = @($Transaction.TouchedKeys | ForEach-Object { "$_" })
    $record.markerTouched = [bool]$Transaction.MarkerTouched
  }
  $content = (($record | ConvertTo-Json -Depth 8 -Compress) + "`r`n")
  if ($script:DreamSkinUtf8NoBom.GetByteCount($content) -gt
    $script:DreamSkinMaxAppearanceTransactionBytes) {
    throw 'Startup appearance transaction exceeds its fixed size limit.'
  }
  return $content
}

function Read-DreamSkinAppearanceTransactionState {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  $path = Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $path
  }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  $stream = $null
  try {
    $stream = [System.IO.FileStream]::new(
      $path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::Read
    )
    if ($stream.Length -le 0 -or
      $stream.Length -gt $script:DreamSkinMaxAppearanceTransactionBytes) {
      throw 'Startup appearance transaction has an invalid size.'
    }
    $bytes = [byte[]]::new([int]$stream.Length)
    $offset = 0
    while ($offset -lt $bytes.Length) {
      $read = $stream.Read($bytes, $offset, $bytes.Length - $offset)
      if ($read -le 0) { throw 'Startup appearance transaction is truncated.' }
      $offset += $read
    }
  } finally {
    if ($null -ne $stream) { $stream.Dispose() }
  }
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $path
  try { $record = $content | ConvertFrom-Json -ErrorAction Stop } catch {
    throw 'Startup appearance transaction is not valid JSON; config was preserved.'
  }
  if ($null -eq $record -or $record -is [string] -or $record -is [array] -or
    ($record.schemaVersion -isnot [int] -and $record.schemaVersion -isnot [long]) -or
    [int64]$record.schemaVersion -ne 1 -or $record.stage -isnot [string] -or
    @('preparing', 'committed') -cnotcontains "$($record.stage)" -or
    $record.transactionId -isnot [string] -or
    "$($record.transactionId)" -cnotmatch '\A[a-f0-9]{32}\z') {
    throw 'Startup appearance transaction has invalid metadata; config was preserved.'
  }
  if ("$($record.stage)" -ceq 'committed') {
    Assert-DreamSkinJsonObjectShape -Value $record `
      -Properties @('schemaVersion', 'stage', 'transactionId') `
      -Label 'Committed startup appearance transaction'
    return [pscustomobject]@{
      Stage = 'committed'
      TransactionId = "$($record.transactionId)"
      Transaction = $null
      Bytes = $bytes
    }
  }
  Assert-DreamSkinJsonObjectShape -Value $record `
    -Properties @(
      'schemaVersion', 'stage', 'transactionId', 'before', 'applied',
      'touchedKeys', 'markerTouched'
    ) -Label 'Preparing startup appearance transaction'
  if ($record.markerTouched -isnot [bool]) {
    throw 'Startup appearance transaction marker state is invalid.'
  }
  $touchedKeys = @($record.touchedKeys)
  if (@($touchedKeys | Select-Object -Unique).Count -ne $touchedKeys.Count) {
    throw 'Startup appearance transaction contains duplicate keys.'
  }
  foreach ($key in $touchedKeys) {
    if ($key -isnot [string] -or $script:DreamSkinManagedAppearanceKeys -cnotcontains "$key") {
      throw 'Startup appearance transaction contains an unmanaged key.'
    }
  }
  $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  $beforeSnapshot = ConvertFrom-DreamSkinManagedAppearanceSnapshotRecord `
    -Record $record.before -MarkerPath $markerPath
  $appliedSnapshot = ConvertFrom-DreamSkinManagedAppearanceSnapshotRecord `
    -Record $record.applied -MarkerPath $markerPath
  $expectedTouchedKeys = @()
  foreach ($key in $script:DreamSkinManagedAppearanceKeys) {
    $beforeEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $beforeSnapshot -Key $key
    $appliedEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $appliedSnapshot -Key $key
    if (-not (Compare-DreamSkinManagedAppearanceEntry -Left $beforeEntry -Right $appliedEntry)) {
      $expectedTouchedKeys += $key
    }
  }
  $expectedMarkerTouched = -not (Compare-DreamSkinAppearanceMarkerSnapshot `
    -Left $beforeSnapshot.Marker -Right $appliedSnapshot.Marker)
  if (($expectedTouchedKeys -join ',') -cne ($touchedKeys -join ',') -or
    $expectedMarkerTouched -ne [bool]$record.markerTouched) {
    throw 'Startup appearance transaction changes do not match its snapshots.'
  }
  $transaction = [pscustomobject]@{
    SchemaVersion = 2
    TransactionId = "$($record.transactionId)"
    Before = $beforeSnapshot
    Applied = $appliedSnapshot
    TouchedKeys = @($touchedKeys | ForEach-Object { "$_" })
    MarkerTouched = [bool]$record.markerTouched
    JournalBytes = $bytes
  }
  return [pscustomobject]@{
    Stage = 'preparing'
    TransactionId = $transaction.TransactionId
    Transaction = $transaction
    Bytes = $bytes
  }
}

function Test-DreamSkinPendingAppearanceTransaction {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  $state = Read-DreamSkinAppearanceTransactionState -BackupPath $BackupPath
  return $null -ne $state -and "$($state.Stage)" -ceq 'preparing'
}

function Start-DreamSkinAppearanceTransaction {
  param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][object]$Transaction,
    [AllowNull()][byte[]]$ExpectedBytes
  )
  $path = Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath
  $content = Get-DreamSkinAppearanceTransactionContent -Stage 'preparing' `
    -TransactionId $Transaction.TransactionId -Transaction $Transaction
  Write-DreamSkinUtf8FileAtomically -Path $path -Content $content -ExpectedBytes $ExpectedBytes
  return $script:DreamSkinUtf8NoBom.GetBytes($content)
}

function Complete-DreamSkinAppearanceTransaction {
  param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][object]$Transaction
  )
  if ([int]$Transaction.SchemaVersion -ne 2 -or
    "$($Transaction.TransactionId)" -cnotmatch '\A[a-f0-9]{32}\z') {
    throw 'Startup appearance transaction cannot be completed safely.'
  }
  $state = Read-DreamSkinAppearanceTransactionState -BackupPath $BackupPath
  if ($null -eq $state -or "$($state.TransactionId)" -cne "$($Transaction.TransactionId)") {
    throw 'Startup appearance transaction changed before completion.'
  }
  if ("$($state.Stage)" -ceq 'committed') { return }
  $content = Get-DreamSkinAppearanceTransactionContent -Stage 'committed' `
    -TransactionId $Transaction.TransactionId -Transaction $null
  Write-DreamSkinUtf8FileAtomically `
    -Path (Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath) `
    -Content $content -ExpectedBytes $state.Bytes
}

function Resolve-DreamSkinPendingAppearanceTransaction {
  param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$BackupPath
  )
  $state = Read-DreamSkinAppearanceTransactionState -BackupPath $BackupPath
  if ($null -eq $state -or "$($state.Stage)" -ceq 'committed') { return $null }
  return Restore-DreamSkinManagedAppearanceSnapshot -ConfigPath $ConfigPath `
    -BackupPath $BackupPath -Transaction $state.Transaction
}

function Install-DreamSkinBaseTheme {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [Parameter(Mandatory = $true)]
    [string]$BackupPath,

    [ValidateSet('auto', 'light', 'dark')]
    [string]$AppearanceTheme = 'auto',

    [switch]$PassThruTransaction
  )

  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $BackupPath
    Assert-DreamSkinNoReparseComponents -Path (Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath)
    Assert-DreamSkinNoReparseComponents -Path (Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath)
  }
  $null = Resolve-DreamSkinPendingAppearanceTransaction `
    -ConfigPath $ConfigPath -BackupPath $BackupPath
  $previousJournal = Read-DreamSkinAppearanceTransactionState -BackupPath $BackupPath
  $previousJournalBytes = if ($null -ne $previousJournal) { $previousJournal.Bytes } else { $null }
  $originalBytes = [System.IO.File]::ReadAllBytes($ConfigPath)
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $originalBytes -Path $ConfigPath
  $appearanceMarkerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  $beforeMarkerSnapshot = Get-DreamSkinAppearanceMarkerSnapshot -BackupPath $BackupPath
  $appearanceMarker = $beforeMarkerSnapshot.Marker
  if (Test-DreamSkinAppearanceMarkerLogicalAbsent -Marker $appearanceMarker) {
    $appearanceMarker = $null
  }
  $beforeSnapshot = New-DreamSkinManagedAppearanceSnapshot `
    -Content $content -MarkerSnapshot $beforeMarkerSnapshot
  $appearanceMarkerExisted = [bool]$beforeMarkerSnapshot.Exists
  $backupCreated = $false
  if (-not (Test-Path -LiteralPath $BackupPath)) {
    Write-DreamSkinBytesAtomically -Path $BackupPath -Bytes $originalBytes -ExpectedBytes $null
    $backupCreated = $true
  }

  $writeCompleted = $false
  $appliedMarkerSnapshot = $null
  $appearanceTransaction = $null
  $journalPrepared = $false
  try {
    Assert-DreamSkinDesktopShapeSupported -Content $content
    $newLine = Get-DreamSkinNewLine -Content $content
    $desktop = Get-DreamSkinDesktopSection -Content $content
    if ($null -eq $desktop) {
      $content = Add-DreamSkinDesktopSection -Content $content -NewLine $newLine
      $desktop = Get-DreamSkinDesktopSection -Content $content
    }

    $body = $desktop.Body
    $backupContent = $null
    $pinnedAppearance = $AppearanceTheme -ne 'auto'
    $managedByMarker = $null -ne $appearanceMarker -and [bool]$appearanceMarker.appearanceThemeManaged
    $legacyMigration = $null -eq $appearanceMarker -and (Test-Path -LiteralPath $BackupPath) -and
      (Test-DreamSkinLegacyManagedLightTrio -Content $content)
    # Put the pre-install appearanceTheme back whenever we stop managing it:
    # either migrating away from the legacy forced-light trio, or un-pinning
    # after a fixed-appearance theme is replaced by an auto one.
    if (-not $pinnedAppearance -and ($legacyMigration -or $managedByMarker)) {
      $backupContent = ConvertFrom-DreamSkinUtf8Bytes -Bytes ([System.IO.File]::ReadAllBytes($BackupPath)) -Path $BackupPath
      Assert-DreamSkinDesktopShapeSupported -Content $backupContent
      $backupDesktop = Get-DreamSkinDesktopSection -Content $backupContent
      $savedAppearance = if ($null -ne $backupDesktop) {
        Get-DreamSkinSectionSettingLine -Body $backupDesktop.Body -Key 'appearanceTheme'
      } else { $null }
      $body = Set-DreamSkinSectionSetting -Body $body -Key 'appearanceTheme' -Line $savedAppearance -NewLine $newLine
    }
    if ($pinnedAppearance) {
      # Native token surfaces (dropdowns/popovers) follow appearanceTheme, so a
      # fixed-appearance theme pins it to match; Restore puts the original back.
      $body = Set-DreamSkinSectionSetting -Body $body -Key 'appearanceTheme' `
        -Line ('appearanceTheme = "{0}"' -f $AppearanceTheme) -NewLine $newLine
    }
    $settings = [ordered]@{
      appearanceLightCodeThemeId = $script:DreamSkinManagedLightCodeTheme
      appearanceLightChromeTheme = $script:DreamSkinManagedLightChromeTheme
    }
    $hasNestedLightChromeTheme = Test-DreamSkinDesktopNestedTable `
      -Content $content -Key 'appearanceLightChromeTheme'
    foreach ($key in $settings.Keys) {
      if ($key -eq 'appearanceLightChromeTheme' -and $hasNestedLightChromeTheme) { continue }
      $body = Set-DreamSkinSectionSetting -Body $body -Key $key -Line $settings[$key] -NewLine $newLine
    }

    $content = $content.Substring(0, $desktop.BodyStart) + $body +
      $content.Substring($desktop.BodyStart + $desktop.BodyLength)
    $markerContent = Get-DreamSkinAppearanceMarkerContent -Managed $pinnedAppearance
    $appliedMarkerSnapshot = [pscustomobject]@{
      Exists = $true
      Bytes = $script:DreamSkinUtf8NoBom.GetBytes($markerContent)
      Marker = ConvertFrom-DreamSkinAppearanceMarkerContent `
        -Content $markerContent -Path $appearanceMarkerPath
    }
    $appliedSnapshot = New-DreamSkinManagedAppearanceSnapshot `
      -Content $content -MarkerSnapshot $appliedMarkerSnapshot
    $touchedKeys = @()
    foreach ($key in $script:DreamSkinManagedAppearanceKeys) {
      $beforeEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $beforeSnapshot -Key $key
      $appliedEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $appliedSnapshot -Key $key
      if (-not (Compare-DreamSkinManagedAppearanceEntry -Left $beforeEntry -Right $appliedEntry)) {
        $touchedKeys += $key
      }
    }
    $appearanceTransaction = [pscustomobject]@{
      SchemaVersion = 2
      TransactionId = [guid]::NewGuid().ToString('N')
      Before = $beforeSnapshot
      Applied = $appliedSnapshot
      TouchedKeys = @($touchedKeys)
      MarkerTouched = -not (Compare-DreamSkinAppearanceMarkerSnapshot `
        -Left $beforeMarkerSnapshot -Right $appliedMarkerSnapshot)
      JournalBytes = $null
    }
    $appearanceTransaction.JournalBytes = Start-DreamSkinAppearanceTransaction `
      -BackupPath $BackupPath -Transaction $appearanceTransaction `
      -ExpectedBytes $previousJournalBytes
    $journalPrepared = $true

    # The durable preparing record precedes both files. A hard stop at either
    # commit boundary can therefore recover only values still owned by this
    # attempt instead of treating the marker as completed ownership.
    if ($appearanceMarkerExisted) {
      Write-DreamSkinAppearanceMarker -BackupPath $BackupPath -Managed $pinnedAppearance `
        -ExpectedBytes $beforeMarkerSnapshot.Bytes
    } else {
      Write-DreamSkinAppearanceMarker -BackupPath $BackupPath -Managed $pinnedAppearance `
        -ExpectedBytes $null
    }
    Write-DreamSkinUtf8FileAtomically -Path $ConfigPath -Content $content -ExpectedBytes $originalBytes
    $writeCompleted = $true
    if ($PassThruTransaction) { return $appearanceTransaction }
    Complete-DreamSkinAppearanceTransaction `
      -BackupPath $BackupPath -Transaction $appearanceTransaction
  } catch {
    if (-not $writeCompleted) {
      # Marker and config are separate files. Compensate the marker whenever it
      # still equals the value written by this attempt, even when the config
      # failure itself was caused by a concurrent config edit.
      $markerCleanupSucceeded = $true
      $markerCleanupUsedLogicalAbsent = $false
      if ($null -eq $appliedMarkerSnapshot) {
        # The operation failed before it had a marker value to commit.
      } elseif ($appearanceMarkerExisted -and (Test-Path -LiteralPath $appearanceMarkerPath)) {
        try {
          $currentMarkerSnapshot = Get-DreamSkinAppearanceMarkerSnapshot -BackupPath $BackupPath
          if (Compare-DreamSkinAppearanceMarkerSnapshot `
              -Left $currentMarkerSnapshot -Right $appliedMarkerSnapshot) {
            Write-DreamSkinBytesAtomically -Path $appearanceMarkerPath `
              -Bytes $beforeMarkerSnapshot.Bytes -ExpectedBytes $currentMarkerSnapshot.Bytes
          } elseif (-not (Compare-DreamSkinAppearanceMarkerSnapshot `
              -Left $currentMarkerSnapshot -Right $beforeMarkerSnapshot)) {
            $markerCleanupSucceeded = $false
          }
        } catch {
          $markerCleanupSucceeded = $false
        }
      } elseif (-not $appearanceMarkerExisted -and (Test-Path -LiteralPath $appearanceMarkerPath)) {
        try {
          $currentMarkerSnapshot = Get-DreamSkinAppearanceMarkerSnapshot -BackupPath $BackupPath
          if (Compare-DreamSkinAppearanceMarkerSnapshot `
              -Left $currentMarkerSnapshot -Right $appliedMarkerSnapshot) {
            Write-DreamSkinUtf8FileAtomically -Path $appearanceMarkerPath `
              -Content (Get-DreamSkinLogicalAbsentAppearanceMarkerContent) `
              -ExpectedBytes $currentMarkerSnapshot.Bytes
            $markerCleanupUsedLogicalAbsent = $true
          } elseif (-not (Test-DreamSkinAppearanceMarkerLogicalAbsent `
              -Marker $currentMarkerSnapshot.Marker)) {
            $markerCleanupSucceeded = $false
          }
        } catch {
          $markerCleanupSucceeded = $false
        }
      }

      $configUnchanged = $false
      try {
        $configUnchanged = (Test-Path -LiteralPath $ConfigPath -PathType Leaf) -and
          (Test-DreamSkinBytesEqual -Left $originalBytes -Right ([System.IO.File]::ReadAllBytes($ConfigPath)))
      } catch {
        $configUnchanged = $false
      }
      if ($configUnchanged -and $markerCleanupSucceeded -and $journalPrepared) {
        try {
          Complete-DreamSkinAppearanceTransaction `
            -BackupPath $BackupPath -Transaction $appearanceTransaction
        } catch {
          # Leave the preparing record for the next locked recovery attempt.
        }
      }
      if ($configUnchanged -and $markerCleanupSucceeded -and $backupCreated -and
        -not $markerCleanupUsedLogicalAbsent) {
        Remove-Item -LiteralPath $BackupPath -Force -ErrorAction SilentlyContinue
      }
    }
    throw
  }
}

function Restore-DreamSkinManagedAppearanceSnapshot {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][object]$Transaction
  )

  if ([int]$Transaction.SchemaVersion -ne 2 -or
    "$($Transaction.TransactionId)" -cnotmatch '\A[a-f0-9]{32}\z' -or
    $null -eq $Transaction.Before -or $null -eq $Transaction.Applied) {
    throw 'The startup appearance transaction is invalid; config was preserved.'
  }
  $touchedKeys = @($Transaction.TouchedKeys)
  if (@($touchedKeys | Select-Object -Unique).Count -ne $touchedKeys.Count) {
    throw 'The startup appearance transaction contains duplicate keys; config was preserved.'
  }
  foreach ($key in $touchedKeys) {
    if ($script:DreamSkinManagedAppearanceKeys -cnotcontains "$key") {
      throw 'The startup appearance transaction contains an unmanaged key; config was preserved.'
    }
  }
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $ConfigPath
    Assert-DreamSkinNoReparseComponents `
      -Path (Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath)
    Assert-DreamSkinNoReparseComponents `
      -Path (Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath)
  }

  $current = Get-DreamSkinManagedAppearanceSnapshot `
    -ConfigPath $ConfigPath -BackupPath $BackupPath
  $restoredKeys = @()
  $conflictedKeys = @()
  $restoreEntries = @()
  foreach ($key in $touchedKeys) {
    $beforeEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $Transaction.Before -Key $key
    $appliedEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $Transaction.Applied -Key $key
    $currentEntry = Get-DreamSkinManagedAppearanceEntry -Snapshot $current -Key $key
    if (Compare-DreamSkinManagedAppearanceEntry -Left $currentEntry -Right $appliedEntry) {
      $restoreEntries += [pscustomobject]@{ Key = "$key"; Before = $beforeEntry }
    } elseif (Compare-DreamSkinManagedAppearanceEntry -Left $currentEntry -Right $beforeEntry) {
      # A hard stop may have happened before this key's config commit.
    } else {
      $conflictedKeys += "$key"
    }
  }

  $content = $current.ConfigContent
  if ($restoreEntries.Count -gt 0) {
    $newLine = Get-DreamSkinNewLine -Content $content
    $desktop = Get-DreamSkinDesktopSection -Content $content
    if ($null -eq $desktop) {
      $content = Add-DreamSkinDesktopSection -Content $content -NewLine $newLine
      $desktop = Get-DreamSkinDesktopSection -Content $content
    }
    $body = $desktop.Body
    foreach ($restoreEntry in $restoreEntries) {
      $line = if ([bool]$restoreEntry.Before.Exists) { $restoreEntry.Before.Line } else { $null }
      $body = Set-DreamSkinSectionSetting -Body $body -Key $restoreEntry.Key `
        -Line $line -NewLine $newLine
      $restoredKeys += $restoreEntry.Key
    }
    if (-not [bool]$Transaction.Before.DesktopExists -and [string]::IsNullOrWhiteSpace($body)) {
      $prefix = $content.Substring(0, $desktop.SectionStart)
      $suffix = $content.Substring($desktop.SectionStart + $desktop.SectionLength)
      $insertionSeparator = "$($Transaction.Before.DesktopInsertionSeparator)"
      if ($insertionSeparator -and $prefix.EndsWith($insertionSeparator)) {
        $prefix = $prefix.Substring(0, $prefix.Length - $insertionSeparator.Length)
      }
      $content = $prefix + $suffix
    } else {
      $content = $content.Substring(0, $desktop.BodyStart) + $body +
        $content.Substring($desktop.BodyStart + $desktop.BodyLength)
    }
    if ($content -cne $current.ConfigContent) {
      Write-DreamSkinUtf8FileAtomically -Path $ConfigPath -Content $content `
        -ExpectedBytes $current.ConfigBytes
    }
  }

  # Restore ownership metadata only after the config recovery committed. If the
  # marker originally did not exist, atomically replace our applied marker with
  # a logical-absence tombstone instead of using a racy compare-then-delete.
  $markerStatus = 'not-touched'
  if ([bool]$Transaction.MarkerTouched) {
    $beforeMarker = $Transaction.Before.Marker
    $appliedMarker = $Transaction.Applied.Marker
    $currentMarker = Get-DreamSkinAppearanceMarkerSnapshot -BackupPath $BackupPath
    if (Compare-DreamSkinAppearanceMarkerSnapshot -Left $currentMarker -Right $appliedMarker) {
      $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
      if ([bool]$beforeMarker.Exists) {
        Write-DreamSkinBytesAtomically -Path $markerPath -Bytes $beforeMarker.Bytes `
          -ExpectedBytes $currentMarker.Bytes
      } else {
        $logicalAbsent = Get-DreamSkinLogicalAbsentAppearanceMarkerContent
        Write-DreamSkinUtf8FileAtomically -Path $markerPath -Content $logicalAbsent `
          -ExpectedBytes $currentMarker.Bytes
      }
      $markerStatus = 'restored'
    } elseif (Compare-DreamSkinAppearanceMarkerSnapshot `
        -Left $currentMarker -Right $beforeMarker) {
      $markerStatus = 'already-restored'
    } elseif (-not [bool]$beforeMarker.Exists -and
      (Test-DreamSkinAppearanceMarkerLogicalAbsent -Marker $currentMarker.Marker)) {
      $markerStatus = 'already-restored'
    } else {
      $markerStatus = 'conflict-preserved'
    }
  }

  Complete-DreamSkinAppearanceTransaction `
    -BackupPath $BackupPath -Transaction $Transaction
  return [pscustomobject]@{
    RestoredKeys = @($restoredKeys)
    ConflictedKeys = @($conflictedKeys)
    MarkerStatus = $markerStatus
  }
}

function Restore-DreamSkinBaseTheme {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [Parameter(Mandatory = $true)]
    [string]$BackupPath
  )

  if (-not (Test-Path -LiteralPath $BackupPath)) { throw 'No pre-install config backup is available.' }
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $BackupPath
    Assert-DreamSkinNoReparseComponents -Path (Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath)
    Assert-DreamSkinNoReparseComponents -Path (Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath)
  }
  $null = Resolve-DreamSkinPendingAppearanceTransaction `
    -ConfigPath $ConfigPath -BackupPath $BackupPath
  $backupBytes = [System.IO.File]::ReadAllBytes($BackupPath)
  $backupContent = ConvertFrom-DreamSkinUtf8Bytes -Bytes $backupBytes -Path $BackupPath
  $currentBytes = [System.IO.File]::ReadAllBytes($ConfigPath)
  $currentContent = ConvertFrom-DreamSkinUtf8Bytes -Bytes $currentBytes -Path $ConfigPath
  Assert-DreamSkinDesktopShapeSupported -Content $backupContent
  Assert-DreamSkinDesktopShapeSupported -Content $currentContent
  $newLine = Get-DreamSkinNewLine -Content $currentContent
  $backupDesktop = Get-DreamSkinDesktopSection -Content $backupContent
  $currentDesktop = Get-DreamSkinDesktopSection -Content $currentContent
  if ($null -eq $currentDesktop) {
    $currentContent = Add-DreamSkinDesktopSection -Content $currentContent -NewLine $newLine
    $currentDesktop = Get-DreamSkinDesktopSection -Content $currentContent
  }

  $body = $currentDesktop.Body
  $appearanceMarker = Read-DreamSkinAppearanceMarker -BackupPath $BackupPath
  if (Test-DreamSkinAppearanceMarkerLogicalAbsent -Marker $appearanceMarker) {
    $appearanceMarker = $null
  }
  $restoreLegacyAppearance = $null -eq $appearanceMarker -and
    (Test-DreamSkinLegacyManagedLightTrio -Content $currentContent)
  $restoreManagedAppearance = $null -ne $appearanceMarker -and
    [bool]$appearanceMarker.appearanceThemeManaged
  $restoreKeys = @('appearanceLightCodeThemeId', 'appearanceLightChromeTheme')
  if ($restoreLegacyAppearance -or $restoreManagedAppearance) {
    $restoreKeys = @('appearanceTheme') + $restoreKeys
  }
  $hasNestedLightChromeTheme = Test-DreamSkinDesktopNestedTable `
    -Content $currentContent -Key 'appearanceLightChromeTheme'
  foreach ($key in $restoreKeys) {
    if ($key -eq 'appearanceLightChromeTheme' -and $hasNestedLightChromeTheme) { continue }
    $keyToken = Get-DreamSkinTomlKeyTokenPattern -Key $key
    $pattern = "(?m)^[\t ]*$keyToken[\t ]*=[^\r\n]*(?:\r?\n|(?=\z))"
    $saved = if ($null -ne $backupDesktop) { [regex]::Match($backupDesktop.Body, $pattern) } else { $null }
    $line = if ($null -ne $saved -and $saved.Success) { $saved.Value } else { $null }
    $body = Set-DreamSkinSectionSetting -Body $body -Key $key -Line $line -NewLine $newLine
  }
  if ($null -eq $backupDesktop -and [string]::IsNullOrWhiteSpace($body)) {
    $currentContent = $currentContent.Remove($currentDesktop.SectionStart, $currentDesktop.SectionLength)
  } else {
    $currentContent = $currentContent.Substring(0, $currentDesktop.BodyStart) + $body +
      $currentContent.Substring($currentDesktop.BodyStart + $currentDesktop.BodyLength)
  }
  Write-DreamSkinUtf8FileAtomically -Path $ConfigPath -Content $currentContent -ExpectedBytes $currentBytes
}

function Restore-DreamSkinConfigBackup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][string]$RecoveryBackupPath
  )

  if (-not (Test-Path -LiteralPath $BackupPath)) { throw 'No pre-install config backup is available.' }
  $null = Resolve-DreamSkinPendingAppearanceTransaction `
    -ConfigPath $ConfigPath -BackupPath $BackupPath
  $backupBytes = [System.IO.File]::ReadAllBytes($BackupPath)
  $null = ConvertFrom-DreamSkinUtf8Bytes -Bytes $backupBytes -Path $BackupPath
  $currentBytes = $null
  if (Test-Path -LiteralPath $ConfigPath) {
    $currentBytes = [System.IO.File]::ReadAllBytes($ConfigPath)
    Write-DreamSkinBytesAtomically -Path $RecoveryBackupPath -Bytes $currentBytes -ExpectedBytes $null
  }

  Write-DreamSkinBytesAtomically -Path $ConfigPath -Bytes $backupBytes -ExpectedBytes $currentBytes
}

function Archive-DreamSkinConfigBackup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][string]$ArchivePath
  )

  if (-not (Test-Path -LiteralPath $BackupPath)) { return }
  if (Test-Path -LiteralPath $ArchivePath) { throw "Config backup archive already exists: $ArchivePath" }
  Move-Item -LiteralPath $BackupPath -Destination $ArchivePath -ErrorAction Stop
  Remove-Item -LiteralPath (Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath) -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Get-DreamSkinAppearanceTransactionPath -BackupPath $BackupPath) `
    -Force -ErrorAction SilentlyContinue
}
