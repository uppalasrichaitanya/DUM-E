# Capture the DUM-E Electron window to docs/screenshots/dum-e-floor.png.
# Finds the window by PROCESS (electron.exe, MainWindowTitle 'DUM-E') — more
# reliable than FindWindow class-name guessing. PowerShell + System.Drawing.
param([string]$OutDir = "docs/screenshots")

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$proc = Get-Process -Name electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -eq 'DUM-E' } |
  Select-Object -First 1
if (-not $proc) { throw "no DUM-E electron window found" }

# Move the window to a known origin so CopyFromScreen coords are predictable,
# then capture its client rect.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Cap {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
# SW_RESTORE (9): if the window is minimized, bring it back to its normal
# placement — minimized windows park at (-25600,-25600) with a stub rect.
if ([Win32Cap]::IsIconic($proc.MainWindowHandle)) {
  "window is minimized - restoring"
  [void][Win32Cap]::ShowWindow($proc.MainWindowHandle, 9)
  Start-Sleep -Milliseconds 900
}
[void][Win32Cap]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Milliseconds 800   # foreground + finish frame

$rect = New-Object Win32Cap+RECT
[void][Win32Cap]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)
$w = $rect.Right - $rect.Left; $h = $rect.Bottom - $rect.Top
"window: ${w}x${h} at ($($rect.Left),$($rect.Top)), pid $($proc.Id)"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$g.Dispose()

$out = Join-Path (Get-Location) "$OutDir\dum-e-floor.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved: $out"
