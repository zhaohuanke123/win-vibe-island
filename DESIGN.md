# Vibe Island 氛围岛 - Windows 架构设计

## 技术栈
- Tauri 2.0 (Rust + React)
- Rust 后端直接调用 Win32 API
- WebView2 渲染前端

## 核心功能

### 1. Overlay 浮窗实现
Windows 实现"悬浮在所有窗口上方且不抢焦点"的核心是组合使用以下 Window Style 标志：

```rust
// Rust (windows-rs crate)
let hwnd = CreateWindowEx(
    WS_EX_LAYERED      // 支持透明度
    | WS_EX_TRANSPARENT // 点击穿透（鼠标事件穿透至下层）
    | WS_EX_TOPMOST     // 永远置顶
    | WS_EX_NOACTIVATE, // 不抢占焦点 ← 关键
    "VibeIslandOverlay", "",
    WS_POPUP, // 无标题栏边框
    x, y, width, height,
    ...
);

// 按需切换点击穿透：展开面板时恢复可交互
fn set_interactive(hwnd: HWND, interactive: bool) {
    let ex_style = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
    if interactive {
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, ex_style & !WS_EX_TRANSPARENT);
    } else {
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, ex_style | WS_EX_TRANSPARENT);
    }
}
```

### 2. 进程状态感知
三种互补的状态检测方案：
1. Named Pipe - Agent 主动推送（优先级 1）
2. PTY Hook - ConPTY 输出解析（优先级 2）
3. 进程轮询 - 兜底 fallback（优先级 3）

```rust
// Named Pipe Server（Rust）
async fn start_pipe_server() {
    let pipe = create_named_pipe(r"\\.\pipe\VibeIsland");
    loop {
        let msg: AgentEvent = read_json(&pipe).await;
        // AgentEvent: { session_id, state: "idle"|"running"|"approval", payload }
        event_tx.send(msg);
    }
}

// PTY 输出解析（兜底）
fn parse_pty_line(line: &str) -> Option<AgentState> {
    if line.contains("Do you want to proceed") {
        return Some(Approval)
    }
    if line.contains("✓ Task complete") {
        return Some(Done)
    }
    None
}
```

### 3. 跨应用窗口聚焦
```rust
fn focus_window(session: &Session) {
    // 1. 枚举所有顶层窗口，匹配进程 PID + 窗口标题
    let hwnd = find_window_by_pid(session.pid, &session.title_hint);
    
    // 2. 若最小化则先恢复
    if IsIconic(hwnd) {
        ShowWindow(hwnd, SW_RESTORE);
    }
    
    // 3. 置前（注意：直接 SetForegroundWindow 在 Win11 受限，需 AttachThreadInput）
    let fg_tid = GetWindowThreadProcessId(GetForegroundWindow(), null);
    let my_tid = GetCurrentThreadId();
    AttachThreadInput(my_tid, fg_tid, TRUE);
    SetForegroundWindow(hwnd);
    AttachThreadInput(my_tid, fg_tid, FALSE);
}
```

## 工程目录结构

```
vibe-island/
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── main.rs      # 入口，Tauri builder
│   │   ├── overlay.rs   # Win32 Overlay 窗口管理
│   │   ├── pipe_server.rs    # Named Pipe 服务端
│   │   ├── process_watcher.rs # 进程枚举 + PTY 监控
│   │   ├── window_focus.rs   # 跨应用聚焦
│   │   ├── commands.rs  # Tauri commands（前端调用入口）
│   │   └── state.rs     # 全局状态聚合
│   └── tauri.conf.json
├── src/                 # React 前端
│   ├── components/
│   │   ├── Overlay.tsx      # 主浮窗容器
│   │   ├── StatusDot.tsx    # 状态指示器（闪烁/旋转动画）
│   │   ├── ApprovalPanel.tsx # 审批面板 + Diff 渲染
│   │   ├── SessionList.tsx  # 多对话列表
│   │   └── TrayMenu.tsx     # 系统托盘菜单
│   ├── hooks/
│   │   └── useAgentEvents.ts # 订阅 Tauri 事件
│   └── store/
│       └── sessions.ts  # Zustand 全局状态
└── agent-sdk/           # 注入到 Claude Code / Codex 的轻量 SDK
    ├── node/index.ts    # Node.js 版本（Claude Code）
    └── python/vibe_island.py # Python 版本（Codex CLI）
```

## Phase 1 MVP 目标（第 1-3 周）

1. 搭建 Tauri 2.0 工程骨架
2. 配置 Win32 Overlay 窗口属性（置顶、透明、不抢焦点）
3. 实现系统托盘图标 + 右键菜单
4. Named Pipe Server 基础框架
5. 前端：状态指示动画（闲置/运行中/需审批）

## 关键 Win32 API

- `CreateWindowExW` - 创建窗口
- `SetLayeredWindowAttributes` - 设置透明度
- `SetWindowPos` - 设置窗口位置和层级
- `EnumWindows` - 枚举所有窗口
- `GetWindowTextW` - 获取窗口标题
- `CreateNamedPipeW` - 创建命名管道
- `SetForegroundWindow` - 设置前台窗口
- `AttachThreadInput` - 线程输入附加

## 注意事项

1. 使用 `windows-rs` crate 进行 Win32 API 调用
2. Overlay 窗口需要 `WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT`
3. 点击穿透时鼠标事件会穿透到下层窗口
4. 展开面板时需要动态关闭 `WS_EX_TRANSPARENT`
