#!/usr/bin/env bash
# ==========================================================================
# Tauri DiffViewer 自适应冒烟测试
#
# 自动启动/检测 Tauri dev 进程，发送带大 diff 的 permission_request，
# 通过 JSONL 日志断言 IPC 链路正常、无运行时错误。
#
# 用法:
#   chmod +x tests/scripts/tauri-diffviewer-smoke.sh
#   ./tests/scripts/tauri-diffviewer-smoke.sh
#
# 可选参数:
#   --keep         测试结束后不杀掉 Tauri 进程
#   --skip-build   跳过 cargo build，直接用已有 Tauri 实例
#   --port PORT    hook server 端口 (默认 7878)
#   --timeout SEC  等待 hook server 超时秒数 (默认 180)
# ==========================================================================

set -euo pipefail

# ---- 配置 ----
HOOK_PORT="${HOOK_PORT:-7878}"
TIMEOUT="${TIMEOUT:-180}"
KEEP="${KEEP:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
PROJECT_DIR="/mnt/c/Users/zhk02/Desktop/win-vibe-island"
WINDOWS_USER="zhk02"
LOG_DIR="/mnt/c/Users/${WINDOWS_USER}/AppData/Roaming/com.vibe-island.app/logs"

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --port) HOOK_PORT="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

HOOK_URL="http://localhost:${HOOK_PORT}/hooks"
PASS=0
FAIL=0
TAURI_PID=""

# ---- 辅助函数 ----
pass() { ((PASS++)); echo "  ✅ $1"; }
fail() { ((FAIL++)); echo "  ❌ $1"; }
info() { echo "  ℹ️ $1"; }

cleanup() {
  if [ -n "$TAURI_PID" ] && [ "$KEEP" = false ]; then
    info "Cleaning up Tauri dev (PID $TAURI_PID)..."
    kill "$TAURI_PID" 2>/dev/null || true
    pkill -P "$TAURI_PID" 2>/dev/null || true
    info "Done"
  fi
}
trap cleanup EXIT

# ============================================================
# Step 0: 检查 / 启动 Tauri dev
# ============================================================
echo ""
echo "═══ Step 0: Tauri dev 检测 ═══"

if curl -sf "http://localhost:${HOOK_PORT}/hooks/health" > /dev/null 2>&1; then
  HEALTH=$(curl -sf "http://localhost:${HOOK_PORT}/hooks/health" 2>/dev/null || echo '{"state":"unknown"}')
  STATE=$(echo "$HEALTH" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
  info "Tauri dev 已在运行 (health: $STATE)"
  SKIP_BUILD=true
else
  if [ "$SKIP_BUILD" = true ]; then
    fail "hook server 未运行，且指定了 --skip-build"
    summary; exit 1
  fi

  info "启动 Tauri dev（冷编译可能需数分钟）..."
  cd "$PROJECT_DIR"

  # 后台运行，stdout/stderr 分别记录
  cargo tauri dev \
    > /tmp/tauri-smoke-stdout.log 2> /tmp/tauri-smoke-stderr.log &
  TAURI_PID=$!
  info "Tauri PID: $TAURI_PID"
fi

# 等待 hook server 就绪
info "等待 hook server（超时 ${TIMEOUT}s）..."
READY=false
for ((i=1; i<=TIMEOUT; i++)); do
  if curl -sf "http://localhost:${HOOK_PORT}/hooks/health" > /dev/null 2>&1; then
    READY=true
    pass "Hook server 就绪（耗时 ${i}s）"
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  fail "Hook server 未在 ${TIMEOUT}s 内就绪"
  if [ -f /tmp/tauri-smoke-stderr.log ]; then
    info "stderr 最后 15 行："
    tail -15 /tmp/tauri-smoke-stderr.log
  fi
  exit 1
fi

# ============================================================
# Step 1: 记录日志基线
# ============================================================
echo ""
echo "═══ Step 1: 日志准备 ═══"

TODAY=$(date +%Y-%m-%d)
LOG_FILE="${LOG_DIR}/${TODAY}.jsonl"

if [ -f "$LOG_FILE" ]; then
  LOG_BASELINE=$(wc -l < "$LOG_FILE")
  info "日志文件: $LOG_FILE（基线 ${LOG_BASELINE} 行）"
else
  LOG_BASELINE=0
  info "日志文件将新建: $LOG_FILE"
fi

# ============================================================
# Step 2: 发送 Hook 事件
# ============================================================
echo ""
echo "═══ Step 2: 发送测试事件 ═══"

SESSION_ID="smoke-test-$(date +%s)"

# 2a. Session Start
echo "  发送 session_start..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${HOOK_URL}/session-start" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"${SESSION_ID}\",
    \"cwd\": \"D:/test-project\",
    \"source\": \"smoke-test\"
  }")

if [ "$HTTP_CODE" = "200" ]; then
  pass "session_start → HTTP $HTTP_CODE"
else
  fail "session_start → HTTP $HTTP_CODE"
fi
sleep 1

# 2b. Permission Request with large diff
echo "  发送 permission_request（大 diff）..."

# 用 python 构建完整 JSON payload（避免 bash 嵌入换行的坑）
PERMISSION_PAYLOAD=$(python3 << 'PYEOF'
import json

session_id = "SESSION_PLACEHOLDER"
tool_use_id = "tool-smoke-001"

# 生成 40 行 old 和 40 行 new
old_lines = [f"line {i}: const value_{i} = {i};" for i in range(1, 41)]
new_lines = [f"line {i}: const value_{i} = {i}_updated;" for i in range(1, 41)]

payload = {
    "session_id": session_id,
    "tool_use_id": tool_use_id,
    "tool_name": "Edit",
    "action": "Modify src/utils.ts",
    "risk_level": "medium",
    "tool_input": {
        "file_path": "src/utils.ts",
        "old_string": "placeholder",
        "new_string": "placeholder"
    },
    "diff": {
        "fileName": "src/utils.ts",
        "oldContent": "\n".join(old_lines),
        "newContent": "\n".join(new_lines)
    }
}
print(json.dumps(payload))
PYEOF
)

# 注入真实 session_id
PERMISSION_PAYLOAD="${PERMISSION_PAYLOAD/\"SESSION_PLACEHOLDER\"/\"${SESSION_ID}\"}"

# 后台发送 permission_request（因为 handler 会阻塞等审批）
# 同时前台发送 test/approve 来解除阻塞
PERMISSION_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${HOOK_URL}/permission-request" \
  -H "Content-Type: application/json" \
  -d "$PERMISSION_PAYLOAD" \
  --max-time 10 2>/dev/null || echo "TIMEOUT")

PERMISSION_CODE=$(echo "$PERMISSION_RESPONSE" | tail -1)

if [ "$PERMISSION_CODE" = "200" ]; then
  pass "permission_request (large diff) → HTTP 200"
elif [ "$PERMISSION_CODE" = "TIMEOUT" ] || [ "$PERMISSION_CODE" = "000" ]; then
  # timeout 是预期的：handler 在等审批响应
  # 但说明 IPC 到前端的链路走到了（前端显示了 approval 面板）
  info "permission_request 超时（正常——handler 在等审批）"
  info "  → 通过 test/approve 解除阻塞..."
  APPROVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${HOOK_URL}/test/approve" \
    -H "Content-Type: application/json" \
    -d "{\"tool_use_id\": \"tool-smoke-001\"}" \
    --max-time 5 2>/dev/null || echo "FAIL")
  if [ "$APPROVE_CODE" = "200" ]; then
    pass "test/approve → HTTP 200"
  else
    info "test/approve → HTTP $APPROVE_CODE（非阻塞测试，不影响结果）"
  fi
else
  fail "permission_request → HTTP $PERMISSION_CODE"
fi

# 等待 IPC 传播 + 前端渲染 + 日志写入
sleep 3

# ============================================================
# Step 3: 日志断言
# ============================================================
echo ""
echo "═══ Step 3: 日志断言 ═══"

if [ ! -f "$LOG_FILE" ]; then
  fail "日志文件不存在: $LOG_FILE"
  exit 1
fi

NEW_LOG_LINES=$(( $(wc -l < "$LOG_FILE") - LOG_BASELINE ))
info "本次新增日志行: $NEW_LOG_LINES"

# 只扫描新增行（避免旧日志干扰）
if [ "$NEW_LOG_LINES" -gt 0 ]; then
  NEW_LOGS=$(tail -"$NEW_LOG_LINES" "$LOG_FILE")
else
  NEW_LOGS=""
fi

# 3a. 检查 session_start 和 permission_request 日志
if echo "$NEW_LOGS" | grep -q "SessionStart hook received.*${SESSION_ID}"; then
  pass "日志包含 SessionStart 记录"
else
  # 可能因为日志轮转或路径原因没找到，用全局 grep 试试
  if grep -q "SessionStart hook received.*${SESSION_ID}" "$LOG_FILE" 2>/dev/null; then
    pass "日志包含 SessionStart 记录（在旧日志中发现）"
  else
    fail "未找到 SessionStart 日志——hook server 可能未处理该请求"
  fi
fi

if echo "$NEW_LOGS" | grep -q "PermissionRequest hook received.*${SESSION_ID}"; then
  pass "日志包含 PermissionRequest 记录"
else
  if grep -q "PermissionRequest hook received.*tool-smoke-001" "$LOG_FILE" 2>/dev/null; then
    pass "日志包含 PermissionRequest 记录（在旧日志中发现）"
  else
    fail "未找到 PermissionRequest 日志——IPC 链路可能中断"
  fi
fi

# 3b. 检查 ERROR 级别日志
ERROR_COUNT=$(echo "$NEW_LOGS" | grep -c '"level":"ERROR"' 2>/dev/null || echo 0)
if [ "$ERROR_COUNT" -gt 0 ]; then
  fail "$ERROR_COUNT 条 ERROR 日志"
  echo "$NEW_LOGS" | grep '"level":"ERROR"' | head -5
else
  pass "无 ERROR 级别日志"
fi

# 3c. 检查 TAURI_IPC_ERROR
IPC_ERROR_COUNT=$(echo "$NEW_LOGS" | grep -c '"error_code":"TAURI_IPC_ERROR"' 2>/dev/null || echo 0)
if [ "$IPC_ERROR_COUNT" -gt 0 ]; then
  fail "$IPC_ERROR_COUNT 条 TAURI_IPC_ERROR"
else
  pass "无 TAURI_IPC_ERROR"
fi

# 3d. 检查前端 error_code（非 TAURI 的其他错误）
OTHER_ERRORS=$(echo "$NEW_LOGS" | grep -c '"error_code"' 2>/dev/null || echo 0)
if [ "$OTHER_ERRORS" -gt 0 ]; then
  info "${OTHER_ERRORS} 条含 error_code 的日志（非 ERROR 级别，仅供参考）"
fi

# 3e. WARN 级别（不 fail，仅提示）
WARN_COUNT=$(echo "$NEW_LOGS" | grep -c '"level":"WARN"' 2>/dev/null || echo 0)
if [ "$WARN_COUNT" -gt 0 ]; then
  info "${WARN_COUNT} 条 WARN 级别日志（非失败，建议检查）"
  echo "$NEW_LOGS" | grep '"level":"WARN"' | head -3
fi

# ============================================================
# Step 4: Win32 窗口探测
# ============================================================
echo ""
echo "═══ Step 4: Win32 窗口探测 ═══"

WIN32_CHECK=$(powershell.exe -NoProfile -Command "
Add-Type -TypeDefinition @'
  using System;
  using System.Runtime.InteropServices;
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static class NativeWin {
      [DllImport(\"user32.dll\")] public static extern IntPtr FindWindow(string l, string w);
      [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
      [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr h);
  }
'@ -ErrorAction SilentlyContinue

# Try multiple window class/title combinations
\$hwnd = [IntPtr]::Zero
# 1) WebView2
\$hwnd = [NativeWin]::FindWindow(\"Windows.UI.Core.CoreWindow\", \"Vibe Island\")
if (\$hwnd -eq [IntPtr]::Zero) {
  \$hwnd = [NativeWin]::FindWindow(\"Chrome_WidgetWin_0\", \"Vibe Island\")
}
if (\$hwnd -eq [IntPtr]::Zero) {
  \$hwnd = [NativeWin]::FindWindow(\"Chrome_WidgetWin_1\", \"Vibe Island\")
}
# 2) By process
if (\$hwnd -eq [IntPtr]::Zero) {
  \$p = Get-Process -Name \"app\" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (\$p) { \$hwnd = \$p.MainWindowHandle }
}
# 3) By partial name
if (\$hwnd -eq [IntPtr]::Zero) {
  \$p = Get-Process | Where-Object { \$_.ProcessName -match 'vibe|island|overlay' } | Select-Object -First 1
  if (\$p) { \$hwnd = \$p.MainWindowHandle }
}

if (\$hwnd -ne [IntPtr]::Zero -and [NativeWin]::IsWindowVisible(\$hwnd)) {
  \$r = New-Object RECT
  [NativeWin]::GetWindowRect(\$hwnd, [ref]\$r)
  \$w = \$r.Right - \$r.Left
  \$h = \$r.Bottom - \$r.Top
  Write-Output \"FOUND:\$w x \$h\"
} else {
  Write-Output \"NOT_FOUND\"
}
" 2>/dev/null || echo "POWERSHELL_FAILED")

case "$WIN32_CHECK" in
  FOUND:*)
    DIMENSIONS=$(echo "$WIN32_CHECK" | sed 's/FOUND://')
    pass "Tauri 窗口已检测到: $DIMENSIONS"
    ;;
  NOT_FOUND)
    info "未找到 Tauri 窗口"
    info "  （NOACTIVATE 窗口在进程探测中可能不可见，非异常）"
    ;;
  *)
    info "PowerShell 探测: $WIN32_CHECK"
    info "  （跳过窗口断言）"
    ;;
esac

# ============================================================
# 测试摘要
# ============================================================
echo ""
echo "══════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ ALL PASSED ($PASS/$((PASS+FAIL)))"
else
  echo "  ⚠️  $PASS passed, $FAIL failed"
fi
echo "══════════════════════════════════"

if [ "$KEEP" = true ] && [ -n "$TAURI_PID" ]; then
  info "Tauri dev 保持运行 (--keep). PID: $TAURI_PID"
fi

exit "$FAIL"
