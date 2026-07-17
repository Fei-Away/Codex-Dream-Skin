[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [string]$ContactSheetPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-DreamSkinRoundedRectangle {
  param(
    [Parameter(Mandatory = $true)][System.Drawing.RectangleF]$Rectangle,
    [Parameter(Mandatory = $true)][single]$Radius
  )
  $diameter = [single]($Radius * 2)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rectangle.X, $Rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-DreamSkinIconFrame {
  param(
    [Parameter(Mandatory = $true)][int]$Size,
    [switch]$Restore
  )
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $inset = [single][Math]::Max(1, [Math]::Round($Size * 0.04))
    $backgroundRect = [System.Drawing.RectangleF]::new($inset, $inset, $Size - (2 * $inset), $Size - (2 * $inset))
    $backgroundPath = New-DreamSkinRoundedRectangle -Rectangle $backgroundRect -Radius ([single][Math]::Max(2, $Size * 0.19))
    try {
      $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $backgroundRect,
        [System.Drawing.Color]::FromArgb(255, 247, 72, 176),
        [System.Drawing.Color]::FromArgb(255, 45, 218, 246),
        38
      )
      try {
        $blend = [System.Drawing.Drawing2D.ColorBlend]::new(3)
        $blend.Colors = @(
          [System.Drawing.Color]::FromArgb(255, 247, 72, 176),
          [System.Drawing.Color]::FromArgb(255, 127, 76, 241),
          [System.Drawing.Color]::FromArgb(255, 45, 218, 246)
        )
        $blend.Positions = [single[]]@(0, 0.56, 1)
        $gradient.InterpolationColors = $blend
        $graphics.FillPath($gradient, $backgroundPath)
      } finally {
        $gradient.Dispose()
      }
    } finally {
      $backgroundPath.Dispose()
    }

    $stroke = [single][Math]::Max(1.5, $Size * 0.072)
    $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, $stroke)
    try {
      $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
      $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
      $whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
      $windowRect = [System.Drawing.RectangleF]::new($Size * 0.17, $Size * 0.27, $Size * 0.62, $Size * 0.51)
      $windowPath = New-DreamSkinRoundedRectangle -Rectangle $windowRect -Radius ([single][Math]::Max(1.2, $Size * 0.07))
      try { $graphics.DrawPath($whitePen, $windowPath) } finally { $windowPath.Dispose() }
      $graphics.DrawLine($whitePen, $windowRect.Left, $Size * 0.40, $windowRect.Right, $Size * 0.40)

      if ($Restore) {
        $arcRect = [System.Drawing.RectangleF]::new($Size * 0.52, $Size * 0.10, $Size * 0.34, $Size * 0.34)
        $graphics.DrawArc($whitePen, $arcRect, 315, 245)
        $tipX = [single]($Size * 0.535)
        $tipY = [single]($Size * 0.205)
        $graphics.DrawLine($whitePen, $tipX, $tipY, $Size * 0.535, $Size * 0.095)
        $graphics.DrawLine($whitePen, $tipX, $tipY, $Size * 0.64, $Size * 0.20)
      } else {
        $sparkX = [single]($Size * 0.80)
        $sparkY = [single]($Size * 0.19)
        $sparkLong = [single]($Size * 0.105)
        $sparkShort = [single]($Size * 0.070)
        $graphics.DrawLine($whitePen, $sparkX, $sparkY - $sparkLong, $sparkX, $sparkY + $sparkLong)
        $graphics.DrawLine($whitePen, $sparkX - $sparkLong, $sparkY, $sparkX + $sparkLong, $sparkY)
        $graphics.DrawLine($whitePen, $sparkX - $sparkShort, $sparkY - $sparkShort, $sparkX + $sparkShort, $sparkY + $sparkShort)
        $graphics.DrawLine($whitePen, $sparkX + $sparkShort, $sparkY - $sparkShort, $sparkX - $sparkShort, $sparkY + $sparkShort)
      }
    } finally {
      $whitePen.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }
  return $bitmap
}

function ConvertTo-DreamSkinPngBytes {
  param([Parameter(Mandatory = $true)][System.Drawing.Bitmap]$Bitmap)
  $stream = [System.IO.MemoryStream]::new()
  try {
    $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return $stream.ToArray()
  } finally {
    $stream.Dispose()
  }
}

function Write-DreamSkinIco {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object[]]$Frames
  )
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$Frames.Count)
    $offset = 6 + (16 * $Frames.Count)
    foreach ($frame in $Frames) {
      $dimensionByte = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
      $writer.Write([byte]$dimensionByte)
      $writer.Write([byte]$dimensionByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$frame.Bytes.Length)
      $writer.Write([uint32]$offset)
      $offset += $frame.Bytes.Length
    }
    foreach ($frame in $Frames) { $writer.Write([byte[]]$frame.Bytes) }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

function New-DreamSkinFrames {
  param([switch]$Restore)
  $result = @()
  foreach ($size in @(16, 24, 32, 48, 256)) {
    $bitmap = New-DreamSkinIconFrame -Size $size -Restore:$Restore
    try {
      $result += [pscustomobject]@{ Size = $size; Bytes = ConvertTo-DreamSkinPngBytes -Bitmap $bitmap }
    } finally {
      $bitmap.Dispose()
    }
  }
  return $result
}

$fullOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($fullOutputDirectory) | Out-Null
$mainFrames = @(New-DreamSkinFrames)
$restoreFrames = @(New-DreamSkinFrames -Restore)
Write-DreamSkinIco -Path (Join-Path $fullOutputDirectory 'dream-skin.ico') -Frames $mainFrames
Write-DreamSkinIco -Path (Join-Path $fullOutputDirectory 'dream-skin-restore.ico') -Frames $restoreFrames

if ($ContactSheetPath) {
  $sheet = [System.Drawing.Bitmap]::new(760, 360, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(255, 245, 246, 250))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $font = [System.Drawing.Font]::new('Segoe UI', 11)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 34, 38, 52))
    try {
      $graphics.DrawString('Dream Skin', $font, $brush, 18, 12)
      $graphics.DrawString('Restore', $font, $brush, 18, 184)
      $x = 18
      foreach ($size in @(16, 24, 32, 48, 256)) {
        $displaySize = if ($size -le 48) { $size * 3 } else { 144 }
        $mainBitmap = New-DreamSkinIconFrame -Size $size
        $restoreBitmap = New-DreamSkinIconFrame -Size $size -Restore
        try {
          $graphics.DrawImage($mainBitmap, $x, 42, $displaySize, $displaySize)
          $graphics.DrawImage($restoreBitmap, $x, 214, $displaySize, $displaySize)
          $graphics.DrawString("${size}px", $font, $brush, $x, 150)
        } finally {
          $mainBitmap.Dispose()
          $restoreBitmap.Dispose()
        }
        $x += $displaySize + 24
      }
    } finally {
      $brush.Dispose()
      $font.Dispose()
    }
    $fullContactSheetPath = [System.IO.Path]::GetFullPath($ContactSheetPath)
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $fullContactSheetPath)) | Out-Null
    $sheet.Save($fullContactSheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $sheet.Dispose()
  }
}
