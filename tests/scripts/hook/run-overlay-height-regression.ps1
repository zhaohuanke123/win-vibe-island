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

function Get-AppWindowRect {
    $proc = Get-Process -Name "app" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $proc) { return $null }
    $hwnd = $proc.MainWindowHandle
    if ($hwnd -eq [IntPtr]::Zero) { return $null }

    $rect = New-Object RECT
    [void][Win32]::GetWindowRect($hwnd, [ref]$rect)
    return @{
        Width  = $rect.Right - $rect.Left
        Height = $rect.Bottom - $rect.Top
        X      = $rect.Left
        Y      = $rect.Top
    }
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
}
"@

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

$rect = New-Object RECT
[void][NativeWin]::GetWindowRect($hwnd, [ref]$rect)
$compactH = $rect.Bottom - $rect.Top
$compactW = $rect.Right - $rect.Left
Write-Host "Window found: ${compactW}x${compactH} at ($($rect.Left), $($rect.Top))"
Write-Result "Compact height reasonable" ($compactH -gt 20 -and $compactH -lt 150) "height=${compactH}px (expected ~52)"
Write-Host ""

# Step 2: Send session_start
Write-Host "Step 2: Sending session_start..."
$body = @{ session_id = "reg-1"; cwd = "D:\test"; source = "test" } | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/hooks/session-start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
Start-Sleep -Milliseconds 800

[void][NativeWin]::GetWindowRect($hwnd, [ref]$rect)
$h = $rect.Bottom - $rect.Top
Write-Host "  After 1 session: $($rect.Right - $rect.Left)x${h} px"
Write-Host ""

# Step 3: Send 5 more sessions
for ($i = 2; $i -le 6; $i++) {
    $body = @{ session_id = "reg-$i"; cwd = "D:\project-$i"; source = "test" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/hooks/session-start" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5 | Out-Null
}
Start-Sleep -Milliseconds 800

[void][NativeWin]::GetWindowRect($hwnd, [ref]$rect)
$h = $rect.Bottom - $rect.Top
Write-Result "6 sessions adaptive height" ($h -gt $compactH -and $h -le 600) "height=${h}px (compact=${compactH}, should grow but <= 600)"
Write-Host "  6 sessions: $($rect.Right - $rect.Left)x${h} px"
Write-Host ""

# Step 4: Send permission_request
Write-Host "Step 4: Sending permission_request..."
$body = @{
    session_id = "reg-1"
    tool_use_id = "tool-reg-001"
    tool_name = "Bash"
    tool_input = @{ command = "npm test" }
    permission_suggestions = @(@{ behavior = "allow" })
} | ConvertTo-Json

$job = Start-Job -ScriptBlock {
    param($url, $b)
    Invoke-RestMethod -Uri $url -Method Post -Body $b -ContentType "application/json" -TimeoutSec 10
} -ArgumentList "$baseUrl/hooks/permission-request", $body

Start-Sleep -Milliseconds 1500

[void][NativeWin]::GetWindowRect($hwnd, [ref]$rect)
$h = $rect.Bottom - $rect.Top
Write-Result "Approval expanded" ($h -gt 200) "height=${h}px (should be > 200)"
Write-Host "  Approval visible: $($rect.Right - $rect.Left)x${h} px"

$result = Receive-Job $job -Wait -AutoRemoveJob -ErrorAction SilentlyContinue
Write-Host "  Approval result: $($result.hookSpecificOutput.decision.behavior)"
Write-Host ""

# Step 5: Check collapse
Start-Sleep -Milliseconds 1000
[void][NativeWin]::GetWindowRect($hwnd, [ref]$rect)
$h = $rect.Bottom - $rect.Top
Write-Result "Collapsed after approval" ($h -le $compactH + 50) "height=${h}px (should return near compact=${compactH})"
Write-Host "  After collapse: $($rect.Right - $rect.Left)x${h} px"

Write-Host ""
Write-Host "=============================="
Write-Host "Results: $pass passed, $fail failed"
Write-Host "=============================="
if ($fail -gt 0) { exit 1 }
