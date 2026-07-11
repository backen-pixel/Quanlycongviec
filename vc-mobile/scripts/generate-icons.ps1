# Tạo icon launcher chuẩn Android adaptive (foreground trong suốt + nền riêng).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $root 'assets'
$source = Join-Path $assets 'icon-source.png'
if (-not (Test-Path $source)) {
  $fallback = 'C:\Users\acer\.cursor\projects\d-CongViec-Quanlycongviec\assets\c__Users_acer_AppData_Roaming_Cursor_User_workspaceStorage_2ce1c907fc3a6558b26975ef2608a519_images_image-947f1d0e-db6b-46b1-b55b-5e32eca1e6ea.png'
  if (Test-Path $fallback) { Copy-Item $fallback $source -Force }
  else { throw "Missing icon-source.png" }
}

function Test-SymbolPixel([System.Drawing.Color]$c) {
  $lum = ($c.R + $c.G + $c.B) / 3.0
  $sat = [Math]::Max($c.R, [Math]::Max($c.G, $c.B)) - [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
  return ($lum -gt 175 -and $sat -lt 95)
}

function Extract-SymbolBitmap([System.Drawing.Bitmap]$src) {
  $w = $src.Width; $h = $src.Height
  $sym = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $minX = $w; $minY = $h; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $c = $src.GetPixel($x, $y)
      if (Test-SymbolPixel $c) {
        $alpha = [Math]::Min(255, [int](($c.R + $c.G + $c.B) / 3.0 + 40))
        $sym.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
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

function New-SquareCanvas([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$srcImg = [System.Drawing.Bitmap]::FromFile((Resolve-Path $source))
$symbol = Extract-SymbolBitmap $srcImg
$srcImg.Dispose()

# Adaptive foreground — biểu tượng ~58% canvas (nằm trong safe zone 66%)
$fgSize = 1024
$fg = New-SquareCanvas $fgSize
$target = [int]($fgSize * 0.58)
$scale = [Math]::Min($target / $symbol.Width, $target / $symbol.Height)
$dw = [int]($symbol.Width * $scale)
$dh = [int]($symbol.Height * $scale)
$dx = [int](($fgSize - $dw) / 2)
$dy = [int](($fgSize - $dh) / 2)
$fg.Graphics.DrawImage($symbol, $dx, $dy, $dw, $dh)
$fg.Graphics.Dispose()
Save-Png $fg.Bitmap (Join-Path $assets 'adaptive-icon-foreground.png')
$fg.Bitmap.Dispose()

# Icon vuông đầy đủ — nền gradient xanh + biểu tượng
$iconSize = 1024
$icon = New-SquareCanvas $iconSize
$rect = New-Object System.Drawing.Rectangle 0, 0, $iconSize, $iconSize
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, `
  ([System.Drawing.Color]::FromArgb(255, 74, 158, 232)), `
  ([System.Drawing.Color]::FromArgb(255, 35, 96, 185)), `
  90
$icon.Graphics.FillRectangle($brush, $rect)
$brush.Dispose()
$iconTarget = [int]($iconSize * 0.62)
$scale2 = [Math]::Min($iconTarget / $symbol.Width, $iconTarget / $symbol.Height)
$dw2 = [int]($symbol.Width * $scale2)
$dh2 = [int]($symbol.Height * $scale2)
$dx2 = [int](($iconSize - $dw2) / 2)
$dy2 = [int](($iconSize - $dh2) / 2)
$icon.Graphics.DrawImage($symbol, $dx2, $dy2, $dw2, $dh2)
$icon.Graphics.Dispose()
Save-Png $icon.Bitmap (Join-Path $assets 'icon.png')
$icon.Bitmap.Dispose()

# Notification icon — trắng trên trong suốt
$notifSize = 96
$notif = New-SquareCanvas $notifSize
$nt = [int]($notifSize * 0.72)
$scale3 = [Math]::Min($nt / $symbol.Width, $nt / $symbol.Height)
$dw3 = [int]($symbol.Width * $scale3)
$dh3 = [int]($symbol.Height * $scale3)
$dx3 = [int](($notifSize - $dw3) / 2)
$dy3 = [int](($notifSize - $dh3) / 2)
$notif.Graphics.DrawImage($symbol, $dx3, $dy3, $dw3, $dh3)
$notif.Graphics.Dispose()
Save-Png $notif.Bitmap (Join-Path $assets 'notification-icon.png')
$notif.Bitmap.Dispose()

$symbol.Dispose()

Write-Host 'OK:'
Write-Host "  $(Join-Path $assets 'adaptive-icon-foreground.png')"
Write-Host "  $(Join-Path $assets 'icon.png')"
Write-Host "  $(Join-Path $assets 'notification-icon.png')"
