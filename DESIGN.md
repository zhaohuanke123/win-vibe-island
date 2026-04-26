# Vibe Island 氛围岛 - Windows 架构设计

## 技术栈
- Tauri 2.0 (Rust + React)
- Rust 后端直接调用 Win32 API
- WebView2 渲染前端

## 实现状态

| 功能 | 状态 | 说明 |
|------|------|------|
| Overlay 浮窗 | ✅ 已完成 | 置顶、透明、点击穿透切换 |
| 系统托盘 | ✅ 已完成 | 右键菜单、显示/隐藏控制 |
| HTTP Hook Server | ✅ 已完成 | Claude Code 原生集成 (端口 7878) |
| Named Pipe Server | ✅ 已完成 | Agent SDK 通信通道 |
| 进程监控 | ✅ 已完成 | 检测 Claude Code / Codex 进程 |
| 窗口聚焦 | ✅ 已完成 | 点击 session 聚焦对应窗口 |
| Mock 模式 | ✅ 已完成 | 模拟 agent 事件用于测试 |
| Approval Panel | ✅ 已完成 | 审批面板 + Approve/Reject |
| Diff Viewer | ✅ 已完成 | 代码差异预览 |
| Agent SDK (Node) | ✅ 已完成 | Node.js SDK |
| Agent SDK (Python) | ✅ 已完成 | Python SDK |
| 文档 | ✅ 已完成 | Hooks 配置指南 |

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
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口，Tauri builder
│   │   ├── lib.rs                # Tauri 应用配置，插件注册
│   │   ├── overlay.rs            # Win32 Overlay 窗口管理
│   │   ├── commands.rs           # Tauri IPC commands
│   │   ├── events.rs             # Tauri 事件发射
│   │   ├── hook_server.rs        # HTTP Hook 服务器 (Claude Code)
│   │   ├── pipe_server.rs        # Named Pipe 服务端 (Agent SDK)
│   │   ├── process_watcher.rs    # 进程枚举 + 监控
│   │   ├── window_focus.rs       # 跨应用聚焦
│   │   └── mock.rs               # Mock 事件生成器
│   └── tauri.conf.json
├── frontend/                     # React 前端
│   └── src/
│       ├── components/
│       │   ├── Overlay.tsx       # 主浮窗容器
│       │   ├── StatusDot.tsx     # 状态指示器（闪烁/旋转动画）
│       │   ├── ApprovalPanel.tsx # 审批面板
│       │   └── DiffViewer.tsx    # 代码差异渲染
│       ├── hooks/
│       │   └── useAgentEvents.ts # 订阅 Tauri 事件
│       └── store/
│           └── sessions.ts       # Zustand 全局状态
├── agent-sdk/                    # Agent SDK (可选，用于非 Claude Code 工具)
│   ├── node/                     # Node.js SDK
│   │   ├── src/
│   │   │   ├── index.ts          # 入口
│   │   │   ├── client.ts         # Named Pipe 客户端
│   │   │   └── types.ts          # 类型定义
│   │   └── package.json
│   └── python/                   # Python SDK
│       └── src/vibe_island_sdk/
│           ├── __init__.py       # 入口
│           ├── client.py         # Named Pipe 客户端
│           └── types.py          # 类型定义
├── docs/
│   ├── hooks-setup.md            # Claude Code Hooks 配置指南
│   └── claude-settings.example.json  # 配置示例
├── architecture.md               # 架构文档
├── task.json                     # 任务定义
└── progress.txt                  # 进度记录
```

## 集成方式

### 方式 1: HTTP Hooks (推荐，Claude Code 原生)

Claude Code 原生支持 HTTP Hooks，无需安装 SDK。在 `.claude/settings.json` 中配置：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/pre-tool-use" }]
    }],
    "Notification": [{
      "matcher": "*",
      "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/notification" }]
    }],
    "Stop": [{
      "matcher": "*",
      "hooks": [{ "type": "http", "url": "http://localhost:7878/hooks/stop" }]
    }]
  }
}
```

### 方式 2: Agent SDK (Codex CLI / 自定义工具)

对于非 Claude Code 工具，使用 Agent SDK 通过 Named Pipe 通信：

```typescript
// Node.js
import { VibeIslandClient } from 'vibe-island-sdk';

const client = new VibeIslandClient();
await client.connect();
await client.sendEvent({ session_id: 'xxx', state: 'running', payload: {} });
```

```python
# Python
from vibe_island_sdk import VibeIslandClient

client = VibeIslandClient()
client.connect()
client.send_event(session_id='xxx', state='running', payload={})
```

## 开发阶段

### Phase 1 - MVP ✅ 已完成
- Tauri 2.0 工程骨架
- Win32 Overlay 窗口（置顶、透明、不抢焦点）
- 系统托盘图标 + 右键菜单
- Named Pipe Server
- 前端状态指示动画

### Phase 2 - 核心功能 ✅ 已完成
- HTTP Hook Server (Claude Code 集成)
- 进程监控
- 窗口聚焦
- Approval Panel
- Diff Viewer

### Phase 3 - SDK & 文档 ✅ 已完成
- Node.js Agent SDK
- Python Agent SDK
- Hooks 配置文档

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
