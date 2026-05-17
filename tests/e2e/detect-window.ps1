# Vibe Island — Window Detection & Screenshot Helpers
# Usage: powershell -NoProfile -File detect-window.ps1 -Action detect [-TitleFilter Vibe]
#        powershell -NoProfile -File detect-window.ps1 -Action screenshot -OutputPath C:\path\to\output.png

param(
  [string]$Action = "detect",
  [string]$OutputPath = "",
  [string]$TitleFilter = "Vibe"
)

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Helper {
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static string FindAllWindows(string titlePart) {
    StringBuilder result = new StringBuilder();
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      StringBuilder sb = new StringBuilder(256);
      GetWindowText(hWnd, sb, 256);
      string title = sb.ToString();
      if (title.Contains(titlePart)) {
        RECT r;
        if (GetWindowRect(hWnd, out r)) {
          result.AppendLine(
            "HWND:" + hWnd.ToString() +
            " TITLE:'" + title +
            "' X:" + r.Left +
            " Y:" + r.Top +
            " W:" + (r.Right - r.Left) +
            " H:" + (r.Bottom - r.Top)
          );
        }
      }
      return true;
    }, IntPtr.Zero);
    return result.Length > 0 ? result.ToString() : "NOT_FOUND";
  }
}
'@

if ($Action -eq "detect") {
  $result = [Win32Helper]::FindAllWindows($TitleFilter)
  Write-Output "WINDOW_INFO:$result"
}
elseif ($Action -eq "screenshot") {
  Add-Type -AssemblyName System.Windows.Forms,System.Drawing
  $screen = [Windows.Forms.Screen]::PrimaryScreen
  $bounds = $screen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Output "SCREENSHOT_SAVED:$OutputPath"
}
