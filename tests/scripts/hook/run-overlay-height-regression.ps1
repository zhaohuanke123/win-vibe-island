# Vibe Island Overlay Height Regression Test
# Usage: ./tests/scripts/hook/run-overlay-height-regression.ps1

param(
    [string]$HookPort = "7878",
    [int]$Timeout = 30
)

$baseUrl = "http://127.0.0.1:$HookPort"
$pass = 0
$fail = 0

function Write-Result($name, $ok, $detail) {
    $status = if ($ok) { "PASS" } else { "FAIL" }
    Write-Host ("[{0}] {1}: {2}" -f $status, $name, $detail)
    if ($ok) { $script:pass++ } else { $script:fail++ }
}

# Load Win32 types once
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }
public static class NativeWin {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hWnd);
}
"@

function Get-WindowCssRect($hwnd) {
    $rect = New-Object RECT
    [void][NativeWin]::GetWindowRect($hwnd, [ref]$rect)
    $dpi = [NativeWin]::GetDpiForWindow($hwnd)
    if ($dpi -eq 0) { $dpi = 96 }
    $scale = $dpi / 96.0
    $physicalW = $rect.Right - $rect.Left
    $physicalH = $rect.Bottom - $rect.Top
    return @{
        PhysicalWidth = $physicalW
        PhysicalHeight = $physicalH
        CssWidth = [math]::Round($physicalW / $scale)
        CssHeight = [math]::Round($physicalH / $scale)
        Dpi = $dpi
        Scale = $scale
        Rect = $rect
    }
}

# Step 0: Wait for hook server
Write-Host "Waiting for hook server on port $HookPort..."
$ready = $false
for ($i = 0; $i -lt $Timeout; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/hooks/health" -TimeoutSec 2 -ErrorAction Stop
        if ($r.state -eq "connected") { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $ready) { Write-Host "FAIL: Hook server not ready"; exit 1 }
Write-Host "Hook server ready (uptime: $($r.uptimeSecs)s)"
Write-Host ""

# Step 1: Find Tauri window
$proc = Get-Process -Name "app" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) {
    Write-Host "FAIL: app.exe process not found"
    exit 1
}
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Host "FAIL: No main window handle"
    exit 1
}

$compact = Get-WindowCssRect $hwnd
$compactH = $compact.CssHeight
$compactW = $compact.CssWidth
Write-Host "Window found: $($compact.PhysicalWidth)x$($compact.PhysicalHeight) physical, ${compactW}x${compactH} CSS @ scale $($compact.Scale)"
Write-Result "Compact height reasonable" ($compactH -gt 20 -and $compactH -lt 150) "height=${compactH} CSS px (expected ~52)"
Write-Host ""

# Step 2: Send session_start — overlay stays compact (does not auto-expand for sessions)
Write-Host "Step 2: Sending session_start..."
$body = @{ session_id = "reg-1"; cwd = "D:\test"; source = "test" } | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/hooks/session-start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
Start-Sleep -Milliseconds 800

$current = Get-WindowCssRect $hwnd
$h = $current.CssHeight
Write-Result "Compact after session start" ($h -le $compactH + 50) "height=${h} CSS px (overlay stays compact for sessions)"
Write-Host ""

# Step 3: Send 5 more sessions
for ($i = 2; $i -le 6; $i++) {
    $body = @{ session_id = "reg-$i"; cwd = "D:\project-$i"; source = "test" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/hooks/session-start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
}
Start-Sleep -Milliseconds 800

$current = Get-WindowCssRect $hwnd
$h = $current.CssHeight
Write-Result "6 sessions still compact" ($h -le $compactH + 50) "height=${h} CSS px (sessions do not auto-expand)"
Write-Host ""

# Step 4: Send permission_request WITHOUT permission_suggestions (stays pending for measurement)
Write-Host "Step 4: Sending permission_request..."
$toolUseId = "tool-reg-001"
$body = @{
    session_id = "reg-1"
    tool_use_id = $toolUseId
    tool_name = "Bash"
    tool_input = @{ command = "npm test" }
} | ConvertTo-Json

$job = Start-Job -ScriptBlock {
    param($url, $b)
    Invoke-RestMethod -Uri $url -Method Post -Body $b -ContentType "application/json" -TimeoutSec 10
} -ArgumentList "$baseUrl/hooks/permission-request", $body

# Wait for approval panel to render and animation to settle
Start-Sleep -Milliseconds 2500

$approval = Get-WindowCssRect $hwnd
$h = $approval.CssHeight
$w = $approval.CssWidth
Write-Result "Approval focus mode CSS size" ($h -ge 720 -and $w -ge 600) "css=${w}x${h}, physical=$($approval.PhysicalWidth)x$($approval.PhysicalHeight), dpi=$($approval.Dpi)"
Write-Host "  Approval visible: ${w}x${h} CSS px"
Write-Host ""

# Step 5: Approve via test endpoint and check collapse
Write-Host "Step 5: Approving via test endpoint..."
$approveBody = @{ tool_use_id = $toolUseId } | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/hooks/test/approve" -Method Post -Body $approveBody -ContentType "application/json" -TimeoutSec 5 | Out-Null

Start-Sleep -Milliseconds 1500

$current = Get-WindowCssRect $hwnd
$h = $current.CssHeight
Write-Result "Collapsed after approve" ($h -le $compactH + 50) "height=${h} CSS px (should return near compact=${compactH})"
Write-Host "  After collapse: $($current.CssWidth)x${h} CSS px"

# Clean up background job
$null = Receive-Job $job -Wait -AutoRemoveJob -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=============================="
Write-Host "Results: $pass passed, $fail failed"
Write-Host "=============================="
if ($fail -gt 0) { exit 1 }
