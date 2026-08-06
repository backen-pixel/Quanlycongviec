# Tạo icon launcher / splash / notification từ logo thiết kế (icon-source.png).
# Giống CRM: badge (lục giác) nhỏ hơn canvas trên nền tối — Android adaptive mask
# cắt góc nên nếu badge full-bleed sẽ mất khung đen và nhìn như ô cam đặc.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $root 'assets'
$source = Join-Path $assets 'icon-source.png'
if (-not (Test-Path $source)) {
  throw "Missing icon-source.png — đặt logo thiết kế vào sx-mobile/assets/icon-source.png"
}

# CRM-like proportions: badge fits inside adaptive safe zone (~66%)
$ICON_BADGE_RATIO = 0.56
$ADAPTIVE_BADGE_RATIO = 0.52
$BG = [System.Drawing.Color]::FromArgb(255, 0, 7, 31) # #00071F

function Test-SymbolPixel([System.Drawing.Color]$c) {
  $lum = ($c.R + $c.G + $c.B) / 3.0
  $sat = [Math]::Max($c.R, [Math]::Max($c.G, $c.B)) - [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
  return ($lum -gt 185 -and $sat -lt 80)
}

function Get-BadgeBounds([System.Drawing.Bitmap]$img) {
  $w = $img.Width; $h = $img.Height
  $minX = $w; $minY = $h; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $c = $img.GetPixel($x, $y)
      $lum = ($c.R + $c.G + $c.B) / 3.0
      if ($lum -gt 28 -or $c.R -gt 40 -or $c.G -gt 30) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -le $minX) { return @{ X = 0; Y = 0; W = $w; H = $h } }
  return @{ X = $minX; Y = $minY; W = ($maxX - $minX + 1); H = ($maxY - $minY + 1) }
}

function Extract-SymbolBitmap([System.Drawing.Bitmap]$src) {
  $w = $src.Width; $h = $src.Height
  $sym = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $minX = $w; $minY = $h; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $c = $src.GetPixel($x, $y)
      if (Test-SymbolPixel $c) {
        $sym.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      } else {
        $sym.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
      }
    }
  }
  if ($maxX -le $minX -or $maxY -le $minY) { throw 'Failed to extract white symbol from source image' }
  $pad = 2
  $minX = [Math]::Max(0, $minX - $pad)
  $minY = [Math]::Max(0, $minY - $pad)
  $maxX = [Math]::Min($w - 1, $maxX + $pad)
  $maxY = [Math]::Min($h - 1, $maxY + $pad)
  $cw = $maxX - $minX + 1
  $ch = $maxY - $minY + 1
  $crop = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.DrawImage($sym, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), (New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $sym.Dispose()
  return $crop
}

function New-SquareCanvas([int]$size, [System.Drawing.Color]$fill) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($fill)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Write-FramedBadge([System.Drawing.Bitmap]$badge, [int]$size, [double]$fillRatio, [string]$path) {
  $canvas = New-SquareCanvas $size $BG
  $target = [int]($size * $fillRatio)
  $scale = [Math]::Min($target / $badge.Width, $target / $badge.Height)
  $dw = [int]($badge.Width * $scale)
  $dh = [int]($badge.Height * $scale)
  $dx = [int](($size - $dw) / 2)
  $dy = [int](($size - $dh) / 2)
  $canvas.Graphics.DrawImage($badge, $dx, $dy, $dw, $dh)
  $canvas.Graphics.Dispose()
  Save-Png $canvas.Bitmap $path
  $canvas.Bitmap.Dispose()
}

$srcImg = [System.Drawing.Bitmap]::FromFile((Resolve-Path $source))
$bounds = Get-BadgeBounds $srcImg
$badge = New-Object System.Drawing.Bitmap $bounds.W, $bounds.H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gBadge = [System.Drawing.Graphics]::FromImage($badge)
$gBadge.DrawImage(
  $srcImg,
  (New-Object System.Drawing.Rectangle 0, 0, $bounds.W, $bounds.H),
  (New-Object System.Drawing.Rectangle $bounds.X, $bounds.Y, $bounds.W, $bounds.H),
  [System.Drawing.GraphicsUnit]::Pixel
)
$gBadge.Dispose()

Write-FramedBadge $badge 1024 $ICON_BADGE_RATIO (Join-Path $assets 'icon.png')
Write-FramedBadge $badge 1024 $ICON_BADGE_RATIO (Join-Path $assets 'splash-icon.png')
Write-FramedBadge $badge 1024 $ADAPTIVE_BADGE_RATIO (Join-Path $assets 'adaptive-icon-foreground.png')

$symbol = Extract-SymbolBitmap $srcImg
$notif = New-SquareCanvas 96 ([System.Drawing.Color]::Transparent)
$nt = [int](96 * 0.72)
$scale3 = [Math]::Min($nt / $symbol.Width, $nt / $symbol.Height)
$dw3 = [int]($symbol.Width * $scale3)
$dh3 = [int]($symbol.Height * $scale3)
$dx3 = [int]((96 - $dw3) / 2)
$dy3 = [int]((96 - $dh3) / 2)
$notif.Graphics.DrawImage($symbol, $dx3, $dy3, $dw3, $dh3)
$notif.Graphics.Dispose()
Save-Png $notif.Bitmap (Join-Path $assets 'notification-icon.png')
$notif.Bitmap.Dispose()

$symbol.Dispose()
$badge.Dispose()
$srcImg.Dispose()

Write-Host 'OK (CRM-like framed badge):'
Write-Host "  icon/splash badge=$ICON_BADGE_RATIO adaptive=$ADAPTIVE_BADGE_RATIO bg=#00071F"
Write-Host "  $(Join-Path $assets 'icon.png')"
Write-Host "  $(Join-Path $assets 'splash-icon.png')"
Write-Host "  $(Join-Path $assets 'adaptive-icon-foreground.png')"
Write-Host "  $(Join-Path $assets 'notification-icon.png')"
