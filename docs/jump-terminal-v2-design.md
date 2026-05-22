# Jump Terminal V2 设计文档

> 对齐 Open Island 的 TerminalJumpService + TerminalJumpTargetResolver 架构，为 win-vibe-island 设计 Windows 平台的精准终端跳转方案。

## 1. JumpTarget 字段对齐

### 1.1 当前 win-vibe-island JumpTarget（v1）

```rust
// src-tauri/src/agent_event.rs:253-264
pub struct JumpTarget {
    pub terminal_type: Option<String>,    // "windowsTerminal" | "vscode" | "cursor"
    pub pid: Option<u32>,                 // 终端进程 PID
    pub workspace_path: Option<String>,   // 工作区路径
    pub window_title: Option<String>,     // 窗口标题
    pub extra: Option<serde_json::Value>, // 类型特定扩展
}
```

### 1.2 Open Island JumpTarget

```swift
// OpenIslandCore/AgentSession.swift:138-176
public struct JumpTarget {
    public var terminalApp: String           // 终端应用名（必须）
    public var workspaceName: String         // 工作区文件夹名
    public var paneTitle: String             // pane/tab 标题
    public var workingDirectory: String?     // 完整 CWD 路径
    public var terminalSessionID: String?    // 终端 session ID
    public var terminalTTY: String?          // TTY 设备名
    public var tmuxTarget: String?           // tmux session:window.pane
    public var tmuxSocketPath: String?       // tmux socket 路径
    public var warpPaneUUID: String?         // Warp pane UUID
    public var codexThreadID: String?        // Codex.app 线程 ID
}
```

### 1.3 V2 JumpTarget 设计

合并两者优势：保留 Windows 特有的 `pid`/`extra`，补充 Open Island 的语义化字段。

```rust
pub struct JumpTarget {
    // ── 语义字段（对齐 Open Island）──
    /// 终端应用名，如 "WindowsTerminal", "VSCode", "Cursor"
    pub terminal_app: String,
    /// 工作区文件夹名（从 CWD 提取）
    pub workspace_name: String,
    /// pane/tab 标题（用于标题匹配）
    pub pane_title: String,
    /// 完整 CWD 路径
    pub working_directory: Option<String>,
    /// 终端 session/tab ID（Windows Terminal tab index 等）
    pub terminal_session_id: Option<String>,
    /// 进程 PID（Windows 特有，v1 保留）
    pub pid: Option<u32>,

    // ── Windows 平台扩展 ──
    /// Windows Terminal tab index（wt.exe focus-tab 用）
    pub terminal_tab_index: Option<u32>,
    /// Windows Terminal tab ID（wt.exe --target 用，更稳定）
    pub terminal_tab_id: Option<String>,

    // ── 扩展字段（向前兼容）──
    /// 类型特定元数据
    pub extra: Option<serde_json::Value>,
}
```

#### 与 Open Island 的映射关系

| Open Island 字段 | V2 字段 | 说明 |
|---|---|---|
| `terminalApp` | `terminal_app` | 直接映射 |
| `workspaceName` | `workspace_name` | 直接映射 |
| `paneTitle` | `pane_title` | 直接映射 |
| `workingDirectory` | `working_directory` | 直接映射 |
| `terminalSessionID` | `terminal_session_id` | 直接映射 |
| `terminalTTY` | *(移除)* | Windows 无 TTY 概念 |
| `tmuxTarget` | *(移除)* | macOS tmux 专用，Windows 无对应 |
| `tmuxSocketPath` | *(移除)* | macOS tmux 专用 |
| `warpPaneUUID` | *(移除)* | Warp 专用，Windows 无此应用 |
| `codexThreadID` | *(移除)* | Codex.app macOS 专用 |
| — | `pid` | Windows 新增，进程定位 |
| — | `terminal_tab_index` | Windows Terminal 新增 |
| — | `terminal_tab_id` | Windows Terminal 新增 |

#### v1 → v2 迁移

| v1 字段 | v2 字段 | 转换规则 |
|---|---|---|
| `terminal_type` | `terminal_app` | `"windowsTerminal"` → `"WindowsTerminal"` |
| `workspace_path` | `working_directory` + `workspace_name` | 直接复制 + 提取末尾文件夹名 |
| `window_title` | `pane_title` | 直接复制 |
| `pid` | `pid` | 直接保留 |
| `extra.tabId` | `terminal_tab_id` | 提升为一级字段 |
| `extra.terminalPid` | `pid` | 合并到 `pid` |

---

## 2. 终端注册表 Schema

### 2.1 Open Island 的 TerminalAppDescriptor

```swift
private struct TerminalAppDescriptor {
    let displayName: String
    let bundleIdentifier: String
    let aliases: [String]
    let alternateBundleIdentifiers: [String]
    let preferredBundleIdentifiersByAlias: [String: String]
}
// 22 个终端注册，涵盖 iTerm/Ghostty/Warp/WezTerm/VSCode/Cursor/Windsurf/JetBrains 全家桶/Trae 等
```

### 2.2 V2 Windows 终端注册表

```rust
pub struct TerminalDescriptor {
    /// 显示名
    pub display_name: &'static str,
    /// 规范化标识符（内部匹配用）
    pub id: &'static str,
    /// 别名列表（用户可能使用的各种名称）
    pub aliases: &'static [&'static str],
    /// 进程名匹配（exe 文件名，小写）
    pub exe_names: &'static [&'static str],
    /// CLI 命令名（用于 workspace 跳转）
    pub cli_command: Option<&'static str>,
    /// 聚焦策略类型
    pub focus_strategy: FocusStrategyType,
}

pub enum FocusStrategyType {
    /// wt.exe CLI 命令
    WindowsTerminal,
    /// workspace 标题匹配窗口
    WorkspaceMatch,
    /// CLI 命令打开 workspace
    CliOpenWorkspace,
    /// PID → EnumWindows → SetForegroundWindow
    PidFallback,
}
```

### 2.3 注册表内容

```rust
pub static KNOWN_TERMINALS: &[TerminalDescriptor] = &[
    TerminalDescriptor {
        display_name: "Windows Terminal",
        id: "windows-terminal",
        aliases: &["wt", "windows-terminal", "windowsterminal", "terminal"],
        exe_names: &["windowsterminal.exe", "wt.exe"],
        cli_command: Some("wt"),
        focus_strategy: FocusStrategyType::WindowsTerminal,
    },
    TerminalDescriptor {
        display_name: "VS Code",
        id: "vscode",
        aliases: &["vscode", "code", "visual-studio-code"],
        exe_names: &["code.exe"],
        cli_command: Some("code"),
        focus_strategy: FocusStrategyType::WorkspaceMatch,
    },
    TerminalDescriptor {
        display_name: "Cursor",
        id: "cursor",
        aliases: &["cursor"],
        exe_names: &["cursor.exe"],
        cli_command: Some("cursor"),
        focus_strategy: FocusStrategyType::WorkspaceMatch,
    },
    TerminalDescriptor {
        display_name: "Windsurf",
        id: "windsurf",
        aliases: &["windsurf"],
        exe_names: &["windsurf.exe"],
        cli_command: Some("windsurf"),
        focus_strategy: FocusStrategyType::WorkspaceMatch,
    },
    TerminalDescriptor {
        display_name: "WezTerm",
        id: "wezterm",
        aliases: &["wezterm"],
        exe_names: &["wezterm.exe", "wezterm-gui.exe"],
        cli_command: Some("wezterm"),
        focus_strategy: FocusStrategyType::PidFallback,
    },
    TerminalDescriptor {
        display_name: "Alacritty",
        id: "alacritty",
        aliases: &["alacritty"],
        exe_names: &["alacritty.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::PidFallback,
    },
    TerminalDescriptor {
        display_name: "Tabby",
        id: "tabby",
        aliases: &["tabby", "tabby-terminal"],
        exe_names: &["tabby.exe"],
        cli_command: None,
        focus_strategy: FocusStrategyType::PidFallback,
    },
];
```

### 2.4 扩展性

新增终端只需在 `KNOWN_TERMINALS` 数组中追加一项：

```rust
// 示例：新增 Hyper 终端
TerminalDescriptor {
    display_name: "Hyper",
    id: "hyper",
    aliases: &["hyper"],
    exe_names: &["hyper.exe"],
    cli_command: None,
    focus_strategy: FocusStrategyType::PidFallback,
},
```

无需修改 Resolver 或 Service 代码——它们遍历注册表动态分发。

---

## 3. Resolver / Executor 分离架构

### 3.1 Open Island 架构（参考）

```
TerminalJumpTargetResolver           TerminalJumpService
  ├─ 周期探测（AppleScript/tmux CLI）    ├─ jump(to:) 入口
  ├─ 快照采集（Ghostty/Terminal/Warp）    ├─ 按 bundleID 分发
  ├─ 多轮匹配（sessionID→CWD→title）     ├─ 各终端专用 jump 方法
  └─ 产出 corrected JumpTarget           └─ fallback 链
```

**关键设计**：Resolver 只负责"发现"（生产 JumpTarget），Service 只负责"执行"（消费 JumpTarget），两者完全解耦。

### 3.2 当前 window_focus.rs 架构（v1）

```
window_focus.rs（单体）
  ├─ detect_terminal_type()     ← 进程树探测
  ├─ FocusStrategy trait        ← 4 个策略硬编码
  ├─ focus_with_jump_target()   ← 遍历策略链
  └─ Win32 helpers              ← EnumWindows / SetForegroundWindow
```

**问题**：
- 没有 Resolver 层，JumpTarget 完全依赖进程树探测产出，字段稀疏
- `detect_terminal_type()` 与 focus 逻辑混在同一文件
- 策略通过 `terminal_type` 字符串硬编码分发，新增终端需改策略代码

### 3.3 V2 架构设计

```
src-tauri/src/
├─ terminal_jump/
│   ├─ mod.rs                     // 公开 API 入口
│   ├─ registry.rs                // KNOWN_TERMINALS 注册表
│   ├─ resolver.rs                // TerminalJumpTargetResolver
│   ├─ service.rs                 // TerminalJumpService
│   ├─ snapshot.rs                // 终端快照结构体
│   └─ strategies/
│       ├─ mod.rs                 // FocusStrategy trait
│       ├─ windows_terminal.rs    // wt.exe 策略
│       ├─ workspace_match.rs     // VS Code/Cursor/Windsurf 策略
│       ├─ cli_workspace.rs       // CLI 命令策略
│       └─ pid_fallback.rs        // PID → EnumWindows 策略
```

### 3.4 模块职责

#### TerminalJumpTargetResolver（`resolver.rs`）

**职责**：周期探测活跃终端 session，产出精确 JumpTarget。

```rust
pub struct TerminalJumpTargetResolver;

impl TerminalJumpTargetResolver {
    /// 探测当前活跃终端 session，产出 JumpTarget 列表
    pub fn resolve(sessions: &[AgentSession]) -> Vec<(String, JumpTarget)> {
        // 1. 遍历 sessions，按 terminal_app 分组
        // 2. 对每组调用对应快照采集方法
        // 3. 多轮匹配：sessionID → CWD → paneTitle
        // 4. 返回 (session_id, corrected_jump_target) 列表
    }

    /// Windows Terminal: 读取 wt.exe list-tabs
    fn snapshot_windows_terminal() -> Option<Vec<WtTabSnapshot>>;

    /// VS Code/Cursor/Windsurf: 用 CLI list workspaces
    fn snapshot_workspace_client(cli: &str) -> Option<Vec<WorkspaceSnapshot>>;

    /// 通用: 枚举进程树获取终端 PID
    fn snapshot_by_pid(pid: u32) -> Option<TerminalSnapshot>;
}
```

**快照结构体**（对齐 Open Island 的 `GhosttyTerminalSnapshot` / `WeztermFamilySnapshot` 等）：

```rust
pub struct WtTabSnapshot {
    pub tab_id: String,        // Windows Terminal 内部 tab ID
    pub tab_index: u32,        // tab 索引
    pub title: String,         // tab 标题
    pub working_directory: Option<String>,  // pane CWD
}

pub struct WorkspaceSnapshot {
    pub workspace_path: String,
    pub window_title: String,
}

pub struct TerminalSnapshot {
    pub pid: u32,
    pub exe_name: String,
    pub window_title: String,
    pub working_directory: Option<String>,
}
```

**多轮匹配算法**（复用 Open Island 的优先级策略）：

```
Pass 1: terminal_session_id 精确匹配
Pass 2: working_directory 匹配
Pass 3: pane_title 子串匹配
```

#### TerminalJumpService（`service.rs`）

**职责**：接收 JumpTarget，按策略执行聚焦。

```rust
pub struct TerminalJumpService {
    strategies: Vec<Box<dyn FocusStrategy>>,
}

impl TerminalJumpService {
    pub fn new() -> Self {
        Self {
            strategies: vec![
                Box::new(WindowsTerminalStrategy),
                Box::new(WorkspaceMatchStrategy),
                Box::new(CliWorkspaceStrategy),
                Box::new(PidFallbackStrategy),
            ],
        }
    }

    /// 跳转到指定目标，返回结果描述
    pub fn jump(&self, target: &JumpTarget) -> JumpResult {
        // 1. 从注册表解析终端描述符
        // 2. 遍历策略链尝试聚焦
        // 3. 逐级 fallback
    }
}

pub enum JumpResult {
    Success(String),              // 精准定位成功 + 描述
    AppActivated(String),         // 仅激活应用，未精准定位
    NotFound(String),             // 找不到
    Failed(String),               // 策略执行失败
}
```

#### 与 v1 window_focus.rs 的差异对比

| 维度 | v1 (window_focus.rs) | V2 (terminal_jump/) |
|---|---|---|
| 探测方式 | 仅进程树 | 进程树 + CLI 探测 + 注册表匹配 |
| JumpTarget 精度 | `terminal_type` + `pid` | 完整语义字段（app/cwd/tab/title） |
| 架构 | 单文件，职责混合 | Resolver/Service 分离 |
| 策略分发 | `terminal_type` 字符串硬编码 | 注册表驱动 + trait 对象 |
| 新增终端 | 改 3 处（strategy/enum/detect） | 注册表加 1 行 |
| Open Island 对齐 | 无 | 字段/算法/分层完全对齐 |

---

## 4. 精确 Pane 定位策略

### 4.1 Windows Terminal

**探测**（Resolver）：
```powershell
# wt.exe 读取当前所有 tab
wt.exe list-tabs --format json
# 输出: [{ "id": "{guid}", "title": "...", "workingDirectory": "...", "index": 0 }, ...]
```

**聚焦**（Service）：
```
优先级:
1. wt.exe -w 0 focus-tab --target {tab_id}
   → 用内部 GUID 精确跳转，最稳定

2. wt.exe -w 0 focus-tab --target {tab_index}
   → 无 GUID 时用 index，tab 顺序变化时不稳定

3. PID → find_window_by_pid → SetForegroundWindow
   → 无法获取 tab 信息时的最后手段
```

### 4.2 VS Code / Cursor / Windsurf

**探测**（Resolver）：
```powershell
# VS Code
code --list-workspaces 2>$null  # 部分 fork 支持此命令
# 或枚举窗口标题，匹配 "foldername — Visual Studio Code" 模式
```

**聚焦**（Service）：
```
优先级:
1. 如果有 working_directory:
   cursor -r <workspace_path>   # -r = reuse window
   code -r <workspace_path>

2. 如果有 workspace_name:
   EnumWindows → 匹配窗口标题含 workspace_name + exe_name
   → SetForegroundWindow

3. PID fallback
```

### 4.3 WezTerm

**探测**（Resolver）：
```
wezterm cli list --format json
# 输出: [{ "pane_id": N, "title": "...", "cwd": "...", "tty": "..." }, ...]
```

**聚焦**（Service）：
```
1. wezterm cli activate-pane --pane-id <id>
2. PID fallback
```

### 4.4 Alacritty / Tabby（通用终端）

**探测**：仅进程树探测（pid + exe_name）。

**聚焦**：
```
1. PID → find_window_by_pid → SetForegroundWindow
2. 标题匹配（pane_title 子串匹配窗口标题）
```

### 4.5 通用 Fallback 链

所有策略失败的最终路径：

```
PID 有效 → EnumWindows 查找可见窗口 → SetForegroundWindow
├─ 窗口最小化 → ShowWindow(SW_RESTORE) + SetForegroundWindow
├─ SetForegroundWindow 失败 → AttachThreadInput 技巧重试
└─ 全部失败 → FlashWindowEx 闪烁提醒用户
```

---

## 5. 数据流

```
Agent 进程启动
  │
  ├─ v1 路径（现有）: detect_terminal_type(pid) → 粗粒度 JumpTarget
  │
  └─ v2 路径:
       │
       ├─ 1. 进程树探测 → 确定 terminal_app + pid
       ├─ 2. 注册表匹配 → 获取 TerminalDescriptor
       ├─ 3. Resolver 周期探测:
       │     ├─ Windows Terminal: wt.exe list-tabs
       │     ├─ VS Code/Cursor: 窗口标题枚举
       │     └─ WezTerm: wezterm cli list
       ├─ 4. 多轮匹配 → 产出精确 JumpTarget
       │
       └─ 5. 用户点击跳转:
             ├─ Service 接收 JumpTarget
             ├─ 查注册表 → 选择策略
             └─ 执行聚焦 → 返回结果
```

---

## 6. 迁移计划

### Phase 1: JumpTarget 结构体升级
- 修改 `agent_event.rs` 中的 `JumpTarget`
- v1 字段保留为 `#[serde(alias)]` 兼容旧 JSON
- 前端 TypeScript 类型同步更新

### Phase 2: 注册表 + Resolver
- 新增 `terminal_jump/registry.rs`
- 新增 `terminal_jump/resolver.rs`
- Resolver 初始实现 Windows Terminal + VS Code/Cursor

### Phase 3: Service + 策略拆分
- 重构 `window_focus.rs` → `terminal_jump/service.rs` + strategies
- 策略 trait 化
- 保留 v1 `focus_with_jump_target()` 作为兼容入口

### Phase 4: 剩余终端 + 优化
- WezTerm 探测 + CLI 聚焦
- Windsurf/Tabby/Alacritty 支持
- Resolver 探测频率优化（事件驱动 vs 轮询）
