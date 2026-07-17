Add-Type -AssemblyName System.Drawing

function New-DreamSkinRoundedRectanglePath {
  param(
    [Parameter(Mandatory = $true)][single]$X,
    [Parameter(Mandatory = $true)][single]$Y,
    [Parameter(Mandatory = $true)][single]$Width,
    [Parameter(Mandatory = $true)][single]$Height,
    [Parameter(Mandatory = $true)][single]$Radius
  )
  $diameter = [single]($Radius * 2)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  [void]$path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  [void]$path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  [void]$path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  [void]$path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-DreamSkinIconFrame {
  param([Parameter(Mandatory = $true)][ValidateRange(16, 256)][int]$Size)
  $scale = [single]($Size / 64.0)
  $bitmap = [System.Drawing.Bitmap]::new(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = $null
  $background = $null
  $gradient = $null
  $border = $null
  $brushPen = $null
  $sparklePen = $null
  $paintDrop = $null
  $memory = $null
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $background = New-DreamSkinRoundedRectanglePath `
      -X (2 * $scale) -Y (2 * $scale) -Width (60 * $scale) -Height (60 * $scale) -Radius (14 * $scale)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.RectangleF]::new(0, 0, $Size, $Size),
      [System.Drawing.Color]::FromArgb(255, 92, 103, 232),
      [System.Drawing.Color]::FromArgb(255, 244, 82, 146),
      42.0
    )
    $graphics.FillPath($gradient, $background)

    $border = [System.Drawing.Pen]::new(
      [System.Drawing.Color]::FromArgb(115, 255, 255, 255),
      [single][Math]::Max(1.0, 1.5 * $scale)
    )
    $graphics.DrawPath($border, $background)

    $brushPen = [System.Drawing.Pen]::new(
      [System.Drawing.Color]::White,
      [single][Math]::Max(1.8, 6.0 * $scale)
    )
    $brushPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $brushPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($brushPen, 18 * $scale, 47 * $scale, 39 * $scale, 26 * $scale)

    $paintDrop = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 116, 236, 226))
    $graphics.FillEllipse($paintDrop, 13 * $scale, 42 * $scale, 10 * $scale, 10 * $scale)

    $sparklePen = [System.Drawing.Pen]::new(
      [System.Drawing.Color]::White,
      [single][Math]::Max(1.2, 2.5 * $scale)
    )
    $sparklePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $sparklePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($sparklePen, 47 * $scale, 11 * $scale, 47 * $scale, 22 * $scale)
    $graphics.DrawLine($sparklePen, 41.5 * $scale, 16.5 * $scale, 52.5 * $scale, 16.5 * $scale)
    $graphics.DrawLine($sparklePen, 50 * $scale, 31 * $scale, 50 * $scale, 37 * $scale)
    $graphics.DrawLine($sparklePen, 47 * $scale, 34 * $scale, 53 * $scale, 34 * $scale)

    $memory = [System.IO.MemoryStream]::new()
    $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,([byte[]]$memory.ToArray())
  } finally {
    if ($null -ne $memory) { $memory.Dispose() }
    if ($null -ne $paintDrop) { $paintDrop.Dispose() }
    if ($null -ne $sparklePen) { $sparklePen.Dispose() }
    if ($null -ne $brushPen) { $brushPen.Dispose() }
    if ($null -ne $border) { $border.Dispose() }
    if ($null -ne $gradient) { $gradient.Dispose() }
    if ($null -ne $background) { $background.Dispose() }
    if ($null -ne $graphics) { $graphics.Dispose() }
    $bitmap.Dispose()
  }
}

function Get-DreamSkinIcon {
  param([Parameter(Mandatory = $true)][string]$Path)
  try {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { return $null }
    if ((Get-Item -LiteralPath $fullPath -Force).Length -lt 22) { return $null }
    return [System.Drawing.Icon]::new($fullPath)
  } catch {
    return $null
  }
}

function New-DreamSkinIconFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $directory = [System.IO.Path]::GetDirectoryName($fullPath)
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    throw "Dream Skin icon directory does not exist: $directory"
  }
  $sizes = @(16, 24, 32, 48, 64, 128, 256)
  $frames = [System.Collections.Generic.List[byte[]]]::new()
  foreach ($size in $sizes) {
    $frames.Add([byte[]](New-DreamSkinIconFrame -Size $size))
  }

  $temporary = Join-Path $directory ('.dream-skin-icon-' + [guid]::NewGuid().ToString('N') + '.tmp')
  $stream = $null
  $writer = $null
  try {
    $stream = [System.IO.FileStream]::new(
      $temporary,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    $writer = [System.IO.BinaryWriter]::new($stream)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$frames.Count)
    $offset = [uint32](6 + (16 * $frames.Count))
    for ($index = 0; $index -lt $frames.Count; $index++) {
      $size = $sizes[$index]
      $frame = $frames[$index]
      $encodedSize = if ($size -eq 256) { [byte]0 } else { [byte]$size }
      $writer.Write($encodedSize)
      $writer.Write($encodedSize)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$frame.Length)
      $writer.Write($offset)
      $offset = [uint32]($offset + $frame.Length)
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
    $writer.Flush()
    $writer.Dispose()
    $writer = $null
    $stream.Dispose()
    $stream = $null

    $validationIcon = Get-DreamSkinIcon -Path $temporary
    if ($null -eq $validationIcon) { throw 'Generated Dream Skin icon failed validation.' }
    $validationIcon.Dispose()
    Move-Item -LiteralPath $temporary -Destination $fullPath -Force -ErrorAction Stop
    return $fullPath
  } finally {
    if ($null -ne $writer) { $writer.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
    if (Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
}
