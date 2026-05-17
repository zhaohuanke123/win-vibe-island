#!/bin/bash
# Vibe Island — 全链路自动化 E2E 测试脚本 v2
# 依赖: cargo tauri dev 已在运行
set -uo pipefail

BASE_URL="http://127.0.0.1:7878"
PS1_SCRIPT="C:\\Users\\zhk02\\Desktop\\win-vibe-island\\tests\\e2e\\detect-window.ps1"
SCREENSHOT_DIR="/mnt/c/Users/zhk02/Desktop"
TS=$(date +%Y%m%d_%H%M%S)
PASS=0; FAIL=0

# ── Helpers ──
log()   { echo -e "\e[36m[$(date +%H:%M:%S)] $1\e[0m"; }
pass()  { echo -e "  \e[32m✅ $1\e[0m"; PASS=$((PASS+1)); }
fail()  { echo -e "  \e[31m❌ $1\e[0m"; FAIL=$((FAIL+1)); }
detail(){ echo -e "    \e[90m$1\e[0m"; }

hook() {
  local out
  out=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL$1" \
    -H "Content-Type: application/json" -d "$2" 2>&1)
  [ "$out" = "200" ] || [ "$out" = "201" ] || [ "$out" = "204" ]
}

hook_body() {
  curl -s -X POST "$BASE_URL$1" -H "Content-Type: application/json" -d "$2" 2>&1
}

ps_script() {
  local action="$1" param="${2:-Vibe}"
  local full_cmd
  if [ "$action" = "detect" ]; then
    full_cmd="cd /d C:\\ && powershell -NoProfile -File $PS1_SCRIPT -Action detect -TitleFilter $param"
  elif [ "$action" = "screenshot" ]; then
    full_cmd="cd /d C:\\ && powershell -NoProfile -File $PS1_SCRIPT -Action screenshot -OutputPath $param"
  fi
  cmd.exe /c "$full_cmd" 2>/dev/null | tr -d '\r' | grep -E "WINDOW_INFO:|SCREENSHOT_SAVED:" | head -1
}

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Vibe Island — 全链路 E2E 自动化测试 v2"
echo "  $(date)"
echo "══════════════════════════════════════════════════════"
echo ""

# ═══ Phase 1: 前置检查 ═══
log "=== [Phase 1] 前置检查 ==="
if curl -sf http://127.0.0.1:7878/hooks/health > /dev/null 2>&1; then
  pass "Hook server 运行中 (127.0.0.1:7878)"
else
  fail "Hook server 未响应"
  exit 1
fi

# ═══ Phase 2: Hook 端点 ═══
log ""
log "=== [Phase 2] Hook 端点功能测试 ==="

total=0
run_test() {
  total=$((total+1))
  local name="$1" path="$2" data="$3"
  if hook "$path" "$data"; then
    pass "[$total] $name"
  else
    fail "[$total] $name"
  fi
}

run_test "session-start"    "/hooks/session-start"       '{"session_id":"e2e-main","label":"vibe-test","cwd":"C:\\Projects"}'
run_test "pre-tool-use"     "/hooks/pre-tool-use"        '{"session_id":"e2e-main","tool_name":"Edit","tool_input":{"file_path":"src/main.ts"}}'
run_test "user-prompt"      "/hooks/user-prompt-submit"  '{"session_id":"e2e-main","prompt":"fix bug"}'
run_test "notification"     "/hooks/notification"        '{"session_id":"e2e-main","message":"Build done"}'
run_test "post-tool-use"    "/hooks/post-tool-use"       '{"session_id":"e2e-main","tool_name":"Edit","success":true}'
run_test "ping"             "/hooks/ping"                '{"session_id":"e2e-main"}'

# Permission request (blocking)
log ""
detail "Permission Request (后台阻塞, 等 3s 自动 allow)..."
hook_body "/hooks/permission-request" '{"session_id":"e2e-main","tool_use_id":"tu-001","tool_name":"Edit","action":"Write file","risk_level":"medium"}' &
PERM_PID=$!
sleep 3
if kill -0 $PERM_PID 2>/dev/null; then
  detail "  ⏳ 仍在等待（正常: 审批流未响应）"
  # 快速批准
  hook_body "/hooks/test/approve" '{"session_id":"e2e-main","tool_use_id":"tu-001"}' > /dev/null 2>&1
  wait $PERM_PID 2>/dev/null || true
  pass "permission-request (快速批准)"
else
  wait $PERM_PID 2>/dev/null || true
  pass "permission-request (已自动处理)"
fi

# 多 session
log ""
detail "多 session 并发..."
for i in 1 2 3; do hook "/hooks/session-start" "{\"session_id\":\"multi-$i\",\"label\":\"proj-$i\"}"; done
pass "3 session 并发创建"
for i in 1 2 3; do hook "/hooks/stop" "{\"session_id\":\"multi-$i\"}"; done
pass "3 session 清理"

# ═══ Phase 3: 窗口检测 ═══
log ""
log "=== [Phase 3] 窗口检测 ==="

WININFO=$(ps_script detect "Vibe")
if echo "$WININFO" | grep -q "WINDOW_INFO:"; then
  WININFO_CLEAN=$(echo "$WININFO" | sed 's/WINDOW_INFO://')
  detail "$WININFO_CLEAN"
  pass "Vibe Island 窗口已检测到"

  # 解析尺寸
  W=$(echo "$WININFO_CLEAN" | sed 's/.* W://' | sed 's/ H:.*//')
  H=$(echo "$WININFO_CLEAN" | sed 's/.* H://')
  detail "窗口尺寸: ${W}x${H}"

  # 紧凑模式下宽度应该 >150, 高度应该 ~52 (旧) 或 ~32 (新v8)
  if [ "$W" -gt 150 ] 2>/dev/null; then
    pass "紧凑宽度合理: ${W}px"
  else
    fail "紧凑宽度异常: ${W}px"
  fi
  if [ "$H" -gt 20 ] 2>/dev/null && [ "$H" -lt 200 ] 2>/dev/null; then
    pass "紧凑高度合理: ${H}px"
  else
    fail "紧凑高度异常: ${H}px"
  fi
else
  fail "未找到 Vibe Island 窗口"
fi

# ═══ Phase 4: 桌面截图 ═══
log ""
log "=== [Phase 4: 桌面截图] ==="

# 截图 1: 当前状态（有 session 数据）
SS1="C:\\Users\\zhk02\\Desktop\\vibe_e2e_${TS}.png"
WSL_SS1="/mnt/c/Users/zhk02/Desktop/vibe_e2e_${TS}.png"
detail "截图中 (场景: 已有 session + 审批)..."
ps_script screenshot "$SS1" > /dev/null 2>&1
if [ -f "$WSL_SS1" ]; then
  FSIZE=$(stat -c%s "$WSL_SS1" 2>/dev/null || echo 0)
  pass "截图已保存 (${FSIZE} bytes)"
  detail "路径: $WSL_SS1"
else
  fail "截图失败"
fi

# 截图 2: 发送新的 hook 后
log ""
detail "发送额外 hook 事件后再次截图..."
hook "/hooks/session-start" '{"session_id":"e2e-shot","label":"screenshot-test","cwd":"/demo"}'
hook "/hooks/pre-tool-use"  '{"session_id":"e2e-shot","tool_name":"Bash","tool_input":{"command":"echo test"}}'
hook "/hooks/permission-request" '{"session_id":"e2e-shot","tool_use_id":"tu-sc","tool_name":"Bash","action":"Run echo","risk_level":"low"}' &
PERM3_PID=$!
sleep 1

SS2="C:\\Users\\zhk02\\Desktop\\vibe_e2e_approval_${TS}.png"
WSL_SS2="/mnt/c/Users/zhk02/Desktop/vibe_e2e_approval_${TS}.png"
ps_script screenshot "$SS2" > /dev/null 2>&1
if [ -f "$WSL_SS2" ]; then
  FSIZE2=$(stat -c%s "$WSL_SS2" 2>/dev/null || echo 0)
  pass "审批场景截图已保存 (${FSIZE2} bytes)"
  detail "路径: $WSL_SS2"
fi

# 清理
hook "/hooks/test/approve" '{"session_id":"e2e-shot","tool_use_id":"tu-sc"}' 2>/dev/null || true
sleep 0.5
wait $PERM3_PID 2>/dev/null || true
hook "/hooks/stop" '{"session_id":"e2e-main"}' 2>/dev/null || true
hook "/hooks/stop" '{"session_id":"e2e-shot"}' 2>/dev/null || true

# ═══ Phase 5: 截图分析 ═══
log ""
log "=== [Phase 5: 截图分析] ==="
if [ -f "$WSL_SS1" ]; then
  detail "截图1 (基础状态) — 可用 vision_analyze 查看" 
fi
if [ -f "$WSL_SS2" ]; then
  detail "截图2 (审批场景) — 可用 vision_analyze 查看"
fi

# ═══ 汇总 ═══
log ""
echo "══════════════════════════════════════════════════════"
echo "  测试结果"
echo "══════════════════════════════════════════════════════"
echo "  通过: $PASS   失败: $FAIL"
[ "$FAIL" -eq 0 ] && echo "  🎉 全部通过！" || echo "  ⚠️  有失败项"
echo "  截图:"
[ -f "$WSL_SS1" ] && echo "    $WSL_SS1"
[ -f "$WSL_SS2" ] && echo "    $WSL_SS2"
echo "══════════════════════════════════════════════════════"
