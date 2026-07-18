$script:DreamSkinUtf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
$script:DreamSkinLegacyAppearanceTheme = 'appearanceTheme = "light"'
$script:DreamSkinManagedLightCodeTheme = 'appearanceLightCodeThemeId = "codex"'
$script:DreamSkinManagedLightChromeTheme = 'appearanceLightChromeTheme = { accent = "#B65CFF", contrast = 64, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "#4A235F", opaqueWindows = true, semanticColors = { diffAdded = "#BCE8CF", diffRemoved = "#F7B8CE", skill = "#C47BFF" }, surface = "#FFF4FA" }'

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

  try {
    [System.IO.File]::WriteAllBytes($temporary, $Bytes)
    if ($PSBoundParameters.ContainsKey('ExpectedBytes')) {
      Assert-DreamSkinFileUnchanged -Path $fullPath -ExpectedBytes $ExpectedBytes
    }
    if ([System.IO.File]::Exists($fullPath)) {
      [System.IO.File]::Replace($temporary, $fullPath, $replacementBackup)
    } else {
      [System.IO.File]::Move($temporary, $fullPath)
    }
  } finally {
    foreach ($artifact in @($temporary, $replacementBackup)) {
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

function Assert-DreamSkinTomlLineEditingSafe {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)

  if ($Content.Contains('"""') -or $Content.Contains("'''")) {
    throw 'Refusing to rewrite TOML containing multiline strings; use single-line values before installing Dream Skin.'
  }
  foreach ($match in [regex]::Matches($Content, '(?m)^[^\r\n]*=[\t ]*\[[^\r\n]*\r?$')) {
    if ((Get-DreamSkinTomlArrayBracketBalance -Line $match.Value) -ne 0) {
      throw 'Refusing to rewrite TOML containing multiline arrays; use single-line arrays before installing Dream Skin.'
    }
  }

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
  return [regex]::IsMatch(
    $Content,
    "(?m)^[\t ]*\[[\t ]*$desktopToken[\t ]*\.[\t ]*$keyToken[\t ]*(?:\]|\.)"
  )
}

function Assert-DreamSkinDesktopShapeSupported {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)

  Assert-DreamSkinTomlLineEditingSafe -Content $Content
  $sectionPattern = Get-DreamSkinDesktopSectionPattern
  if ([regex]::Matches($Content, $sectionPattern).Count -gt 1) {
    throw 'Refusing to rewrite multiple equivalent [desktop] tables.'
  }

  $desktopToken = Get-DreamSkinTomlKeyTokenPattern -Key 'desktop'
  if ([regex]::IsMatch($Content, "(?m)^[\t ]*\[\[[\t ]*$desktopToken[\t ]*(?:\]\]|\.)")) {
    throw 'Refusing to rewrite a config that represents desktop as an array of tables.'
  }
  foreach ($key in @('appearanceTheme', 'appearanceLightCodeThemeId')) {
    if (Test-DreamSkinDesktopNestedTable -Content $Content -Key $key) {
      throw "Refusing to replace '$key' because it is represented as a nested desktop table."
    }
  }

  $firstTable = [regex]::Match($Content, '(?m)^[\t ]*\[\[?')
  $rootContent = if ($firstTable.Success) { $Content.Substring(0, $firstTable.Index) } else { $Content }
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

  $match = [regex]::Match($Content, (Get-DreamSkinDesktopSectionPattern))
  if (-not $match.Success) { return $null }
  return [pscustomobject]@{
    Body = $match.Groups['body'].Value
    BodyStart = $match.Groups['body'].Index
    BodyLength = $match.Groups['body'].Length
    SectionStart = $match.Index
    SectionLength = $match.Length
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
  $pattern = "(?m)^[\t ]*$keyToken[\t ]*=[^\r\n]*(?:\r?\n|(?=\z))"
  $matcher = [regex]::new($pattern)
  if ($matcher.Matches($Body).Count -gt 1) {
    throw "Refusing to rewrite duplicate '$Key' entries in the [desktop] section."
  }
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

function Read-DreamSkinAppearanceMarker {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  if (-not (Test-Path -LiteralPath $markerPath)) { return $null }
  try {
    $marker = (Read-DreamSkinUtf8File -Path $markerPath) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Dream Skin appearance marker is unreadable; config was preserved: $markerPath"
  }
  if ($null -eq $marker -or $marker -is [string] -or $marker -is [array] -or
    [int]$marker.schemaVersion -ne 1 -or $marker.appearanceThemeManaged -isnot [bool] -or
    [bool]$marker.appearanceThemeManaged) {
    throw "Dream Skin appearance marker is invalid; config was preserved: $markerPath"
  }
  return $marker
}

function Write-DreamSkinAppearanceMarker {
  param([Parameter(Mandatory = $true)][string]$BackupPath)
  $markerPath = Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $markerPath
  }
  $marker = [ordered]@{
    schemaVersion = 1
    appearanceThemeManaged = $false
  } | ConvertTo-Json
  Write-DreamSkinUtf8FileAtomically -Path $markerPath -Content ($marker + "`r`n")
}

function Install-DreamSkinBaseTheme {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,

    [Parameter(Mandatory = $true)]
    [string]$BackupPath
  )

  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
  if (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue) {
    Assert-DreamSkinNoReparseComponents -Path $BackupPath
    Assert-DreamSkinNoReparseComponents -Path (Get-DreamSkinAppearanceMarkerPath -BackupPath $BackupPath)
  }
  $originalBytes = [System.IO.File]::ReadAllBytes($ConfigPath)
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $originalBytes -Path $ConfigPath
  $appearanceMarker = Read-DreamSkinAppearanceMarker -BackupPath $BackupPath
  $backupCreated = $false
  if (-not (Test-Path -LiteralPath $BackupPath)) {
    Write-DreamSkinBytesAtomically -Path $BackupPath -Bytes $originalBytes -ExpectedBytes $null
    $backupCreated = $true
  }

  $writeCompleted = $false
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
    $legacyMigration = $null -eq $appearanceMarker -and (Test-Path -LiteralPath $BackupPath) -and
      (Test-DreamSkinLegacyManagedLightTrio -Content $content)
    if ($legacyMigration) {
      $backupContent = ConvertFrom-DreamSkinUtf8Bytes -Bytes ([System.IO.File]::ReadAllBytes($BackupPath)) -Path $BackupPath
      Assert-DreamSkinDesktopShapeSupported -Content $backupContent
      $backupDesktop = Get-DreamSkinDesktopSection -Content $backupContent
      $savedAppearance = if ($null -ne $backupDesktop) {
        Get-DreamSkinSectionSettingLine -Body $backupDesktop.Body -Key 'appearanceTheme'
      } else { $null }
      $body = Set-DreamSkinSectionSetting -Body $body -Key 'appearanceTheme' -Line $savedAppearance -NewLine $newLine
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
    Write-DreamSkinUtf8FileAtomically -Path $ConfigPath -Content $content -ExpectedBytes $originalBytes
    Write-DreamSkinAppearanceMarker -BackupPath $BackupPath
    $writeCompleted = $true
  } catch {
    if ($backupCreated -and -not $writeCompleted) {
      Remove-Item -LiteralPath $BackupPath -Force -ErrorAction SilentlyContinue
    }
    throw
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
  }
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
  $restoreLegacyAppearance = $null -eq $appearanceMarker -and
    (Test-DreamSkinLegacyManagedLightTrio -Content $currentContent)
  $restoreKeys = @('appearanceLightCodeThemeId', 'appearanceLightChromeTheme')
  if ($restoreLegacyAppearance) { $restoreKeys = @('appearanceTheme') + $restoreKeys }
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
}
