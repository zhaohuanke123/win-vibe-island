# Project Architecture

> 本文档描述当前代码实现和必须遵守的架构约束。若文档与代码冲突，本次同步以当前代码实现为准。

---

## Overview

Vibe Island (氛围岛) 是一个 Windows 桌面悬浮 Overlay 应用，用于监控 AI 编程助手会话（Claude Code、Codex、自定义 agent）并显示状态、工具调用和审批请求。项目基于 Tauri 2.0（Rust backend + React frontend）构建。

当前主集成路径是 Claude Code HTTP Hooks；Named Pipe SDK 保留为 Codex CLI 和自定义 agent 的可选 fallback。Overlay 由透明、无边框、置顶的 Tauri WebView 窗口承载，Rust 侧提供 Win32 窗口样式、DPI、聚焦和进程监控能力。

---

## Tech Stack

| Layer | Technology | Current Use |
|-------|------------|-------------|
| Frontend | React 19 + TypeScript + Zustand + Vite | Overlay UI、事件订阅、状态管理、测试 |
| Animation | Framer Motion | StatusDot 状态动画、BarsGlyph、Overlay 动画 |
| Backend | Rust + Tauri 2.0 | 桌面应用、IPC commands、系统托盘 |
| Native Windows | `windows` crate | Win32 窗口样式、DPI、进程枚举、窗口聚焦 |
| HTTP Server | axum + tower-http | Claude Code Hooks，监听 `127.0.0.1:7878` |
| Async Runtime | tokio | Hook server、Named Pipe server、后台轮询 |
| State | parking_lot + Tauri events | 后端运行状态和前后端异步事件 |
| Testing | Vitest + Playwright + Rust tests | 前端单元测试、E2E、后端 hook 集成测试 |

---

## Directory Structure

```text
/
├── AGENTS.md              # 项目配置和导航入口（AI Agent 入口）
├── WORKFLOW.md            # 工作流程和 Documentation Gate
├── architecture.md        # 本文件 - 架构约束 + 模块详情
├── task.json              # 任务定义和文档引用
├── progress.txt           # 开发历史、文档更新、测试证据
├── CLAUDE.md              # Claude Code 专用 AI Agent 入口
├── LOGGING_CONTRACT.md    # AI-Native 错误处理规范
├── agents/                # 【已删除】Agent 子角色目录（V8 后移除）
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs                # Tauri 入口
│       ├── lib.rs                 # Tauri builder、tray、server startup、commands 注册
│       ├── commands.rs            # IPC commands
│       ├── events.rs              # 基础 Tauri event helper
│       ├── hook_server.rs         # Claude Code HTTP Hook server
│       ├── hook_config.rs         # Claude Code settings.json 自动配置/清理
│       ├── hook_manifest.rs       # Hook 清单管理
│       ├── pipe_server.rs         # Named Pipe server (`\\.\\pipe\\VibeIsland`)
│       ├── process_watcher.rs     # Agent 进程枚举和生命周期事件
│       ├── overlay.rs             # Win32 Overlay、DPI、点击穿透
│       ├── window_focus.rs        # 按 PID 聚焦终端/编辑器窗口
│       ├── audio.rs               # 通知提示音播放
│       ├── command_analyzer.rs    # Bash 命令解析（声明式 CommandSpec 注册表）
│       ├── command_specs/         # TOML 命令参数规格（编译时 include_str! 嵌入）
│       ├── agent_event.rs         # 统一事件模型
│       ├── agent_session.rs       # Session 模型
│       ├── session_state.rs       # Session 状态 reducer
│       ├── session_store.rs       # Session 持久化
│       ├── claude_usage.rs        # Claude Code usage 统计
│       ├── transcript_discovery.rs# Transcript 发现
│       ├── approval_types.rs      # 审批响应类型定义
│       ├── logger.rs              # 日志模块
│       ├── config/                # 应用配置加载与版本迁移
│       ├── adapters/              # Agent 事件适配器（Claude Code、Codex 等）
│       └── bin/
│           └── vibe-island-hooks.rs  # Hooks 二进制入口（发送自身 PID）
│   └── tests/
│       └── hook_server_integration.rs
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx                # 主入口，默认渲染 `Overlay`
│       ├── main.tsx               # React DOM 挂载点
│       ├── index.css              # 全局样式
│       ├── test-bridge.ts         # 测试桥接（E2E 测试用）
│       ├── components/
│       │   ├── AnimatedOverlay.tsx # Framer Motion 动画外壳（v8 Pill 外壳）
│       │   ├── Pill.tsx/css       # Pill 形状容器（flat-top + semicircle-bottom）
│       │   ├── NotchRow.tsx/css   # 紧凑 Notch 列（BarsGlyph + agent dot + label）
│       │   ├── BarsGlyph.tsx/css  # 三线动画 glyph（idle/wave/cross-pulse/done）
│       │   ├── StateIndicator.tsx/css # 4 种状态指示器（dot/bar/glyph/tint）
│       │   ├── AgentDot.css       # Agent 品牌色点
│       │   ├── Overlay.tsx/css    # 主布局容器
│       │   ├── PanelHead.tsx/css  # 面板头部（session 计数 + chips + gear）
│       │   ├── GroupedRows.tsx/css# 正交分组 rows（groupBy + sort 控制）
│       │   ├── SessionRow.tsx/css # 空间分割 session 行（body=jump, detail-btn=详情, chevron=expand, 右键=context-menu）
│       │   ├── SessionList.tsx/css# Session 列表（搜索/分组/筛选）
│       │   ├── SessionDetail.tsx/css# Session 详情面板（展开视图）
│       │   ├── NotifBody.tsx/css  # 4 种通知卡（two/three/jump/done）
│       │   ├── ApprovalPanel.tsx/css# 审批面板
│       │   ├── ApprovalQueue.css  # 审批队列样式
│       │   ├── DiffViewer.tsx/css # 代码 diff 预览
│       │   ├── JumpToast.tsx      # 终端跳转 toast
│       │   ├── CommandAnalysis.tsx/css# Bash 命令解析显示
│       │   ├── HookStatus.tsx/css # Hook 连接状态
│       │   ├── ActivityTimeline.tsx/css# 活动时间线
│       │   ├── SessionContextMenu.tsx/css# 右键菜单
│       │   ├── SettingsPanel.tsx/css# 设置面板
│       │   ├── ControlCenter.tsx/css# 控制中心
│       │   ├── ToolExecutionDetail.tsx/css# 工具执行详情
│       │   ├── StatusDot.tsx/css  # 遗留组件：旧状态指示点（v8 后由 StateIndicator 替代）
│       │   └── GeometrySandbox.tsx/css# 几何沙盒验证页
│       ├── hooks/
│       │   ├── useAgentEvents.ts  # Tauri 事件订阅
│       │   ├── useApprovalTimeout.ts # 审批超时
│       │   ├── useSessionPersistence.ts # Session 持久化
│       │   ├── useThrottledCallback.ts # 节流工具
│       │   └── useElapsedTime.ts  # 耗时计时
│       ├── store/
│       │   ├── sessions.ts        # 主 Zustand store
│       │   ├── timeline.ts        # 活动时间线 store
│       │   └── config.ts          # 应用配置 store
│       ├── shared/
│       │   ├── agents.ts          # Agent 定义与品牌色
│       │   ├── phase-colors.ts    # 阶段色定义
│       │   ├── session-reducer.ts # Session reducer
│       │   ├── state-machine.ts   # 状态机
│       │   ├── tool-category.ts   # 工具分类
│       │   ├── tool-description.ts# 工具描述
│       │   ├── app-error.ts       # 应用错误类型
│       │   └── error-dictionary.ts# 错误字典
│       ├── client/
│       │   ├── index.ts           # Client 入口
│       │   ├── logger.ts          # 客户端日志
│       │   ├── error-boundary.tsx # 错误边界
│       │   └── use-logger.ts      # 日志 hook
│       ├── config/animation.ts    # 动画参数常量
│       ├── utils/command.ts       # Bash 命令解析工具
│       └── __tests__/             # 前端 Vitest 测试
├── agent-sdk/
│   ├── node/                     # Node.js SDK
│   └── python/                   # Python SDK
├── docs/
│   ├── README.md                 # 文档索引
│   ├── architecture/             # 架构与设计文档
│   │   ├── state-machine.md
│   │   ├── states-and-flows.md
│   │   ├── animation-design.md
│   │   └── diffviewer-spec.md
│   ├── hooks/                    # Hook 配置
│   │   ├── hooks-setup.md
│   │   └── claude-settings.example.json
│   ├── testing/                  # 测试文档
│   │   ├── testing.md
│   │   └── comprehensive-test-and-state-audit.md
│   ├── design/                   # 设计 PRD & 迁移计划
│   │   ├── ux-optimization-prd.md
│   │   ├── open-island-alignment-prd.md
│   │   └── v8-migration-plan.md
│   ├── operations/               # 发布 & 运维
│   │   └── release-process.md
│   └── archive/                  # 历史文档归档
└── tests/
    ├── browser-v8-test.js        # 浏览器 v8 测试
    ├── e2e/                      # Playwright E2E 测试
    │   ├── specs/                # E2E spec 文件（7 个）
    │   ├── setup/                # 测试辅助
    │   └── playwright.config.ts
    └── scripts/                  # Shell/PowerShell 测试脚本
```

### 遗留组件说明
`HookConfigStatus.tsx` 和 `ErrorLog.tsx` 已随 v8 迁移删除。`StatusDot.tsx/css` 保留但已不在主组件树中使用（由 `StateIndicator` + `BarsGlyph` + `NotchRow` 替代）。

---

## Runtime Architecture

### 启动流程

1. `src-tauri/src/main.rs` 调用 `app_lib::run()`。
2. `lib.rs` 在 Windows 下调用 `overlay::enable_dpi_awareness()` 启用 Per-Monitor DPI Awareness V2，并调用 `timeBeginPeriod(1)` 将 Windows 定时器精度从 ~15.6ms 提升至 ~1ms（更流畅的动画）。
3. Tauri setup 阶段：
   - debug 模式启用 `tauri-plugin-log`；
   - 将主 WebView 窗口 zoom 重置为 `1.0`，并修正 WebView2 RasterizationScale 到实际显示器 DPI（避免 DPR 失真）；
   - 定位主窗口到屏幕顶部居中；
   - Windows 下启动 Named Pipe server 监听 `\\.\pipe\VibeIsland`；
   - 启动 HTTP Hook server（axum，监听 `127.0.0.1:7878`）；
   - 执行 `hook_config::auto_configure_hooks()` 根据配置模式自动写入 Claude Code hooks；
   - 创建系统托盘菜单（Show/Hide、Hook 模式选择、Install/Remove Hooks、Quit）。
4. 前端 `App.tsx` 默认渲染 `Overlay`，并调用 `useAgentEvents()` 注册 Tauri event listeners。
5. `Overlay.tsx` 初始化窗口为紧凑胶囊（60px 高），普通展开时自适应内容高度（配置归一化后最低 400px、最高至少 720px），审批/问答/计划请求时进入固定 600x720 专注模式。

### 运行时事件流

1. 后端收到 HTTP Hook / Named Pipe / 进程监控事件后，通过 Tauri events 推送到前端。
2. `frontend/src/hooks/useAgentEvents.ts` 订阅事件并更新 Zustand store。
3. `Overlay.tsx` 渲染当前 active session、session 列表、hook health 状态和审批面板。
4. 用户在审批面板 Approve/Reject 后调用 `submit_approval_response`，后端将结果返回给正在等待的 `PermissionRequest` hook。

### 已知实现边界

1. `HookConfigStatusPanel` 和 `ErrorLog` 组件已随 v8 迁移删除。
2. 自动 hook 配置未写入 `PostToolUseFailure`，但后端 route 和前端 `tool_error` 处理已实现。
3. `update_overlay_size` 有 16ms 节流；普通展开依赖前端测量同步窗口，approval/question/plan 专注模式固定同步到配置化 focus 尺寸且归一化后不小于 `600x720`。主 WebView 启动时将 zoom 重置为 `1.0`，前端 resize IPC 同时传入 `window.devicePixelRatio`，后端用它和 native DPI 的较大值换算物理像素，避免 WebView2 实际 CSS viewport 小于目标尺寸。
4. UI 使用 4-phase 模型（`running/waitingForApproval/waitingForAnswer/completed` + UI-only `idle`），HTTP Hooks 路径仍使用旧 7-state 命名（参见 HTTP Hook Endpoints 映射表）。
5. 进程命令行读取当前是简化实现，主要依赖进程名匹配。
6. 审批后端等待时间常量 120 秒。Claude Code hook timeout 默认 60 秒，手动配置时建议设为 ≥60 秒。

### Claude Code 集成

用户通常不需要手写配置：默认 `auto` 模式会在启动时尝试自动配置。完整手动配置见 `docs/hooks/hooks-setup.md` 和 `docs/hooks/claude-settings.example.json`。

当前核心数据来源是 Claude Code hook payload 的 `session_id`。如果缺失，后端回退到 `transcript_path`，最后才生成临时 ID。Session label 优先从 `cwd` 最后一段提取；没有 `cwd` 时显示 `Claude Code`。

---

## Data Model

### Session

前端 store 中的实际字段：

| Field | Description |
|-------|-------------|
| `id` | 会话 ID，优先使用 Claude Code `session_id` |
| `label` | 展示名，通常取 `cwd` 最后一段 |
| `cwd` | 会话工作目录 |
| `phase` | `idle` / `running` / `waitingForApproval` / `waitingForAnswer` / `completed` |
| `pid` | 可选进程 ID，用于窗口聚焦 |
| `createdAt` / `lastActivity` | 前端时间戳 |
| `currentTool` | 当前工具名、输入、开始时间 |
| `toolName` / `filePath` | UI 展示用工具信息 |
| `toolHistory` | 最近 20 条工具执行记录 |
| `lastError` | 最近错误信息 |
| `model` / `source` | 可选 Claude Code hook 元信息 |

### ToolExecution

| Field | Description |
|-------|-------------|
| `id` | 前端生成的执行 ID |
| `toolName` | 工具名 |
| `input` | 工具输入 |
| `output` / `outputSummary` | 可选输出信息 |
| `duration` | 执行耗时 |
| `error` | 失败信息 |
| `timestamp` | 记录时间 |
| `status` | `pending` / `running` / `success` / `failed` |

### ApprovalRequest

| Field | Description |
|-------|-------------|
| `toolUseId` | 与后端 pending approval 关联的 ID |
| `sessionId` / `sessionLabel` | 所属 session |
| `toolName` | 请求审批的工具 |
| `action` | 后端格式化的人类可读动作描述 |
| `riskLevel` | `low` / `medium` / `high` |
| `diff` | Write/Edit 时可选 diff 预览 |

---

## Session Phases

| Phase | Color | Description |
|-------|-------|-------------|
| `idle` | gray | 会话存在但无活动（UI-only，不是 reducer 中的 phase） |
| `running` | blue | 正在执行任务（包含旧 thinking/running/streaming） |
| `waitingForApproval` | amber | 等待用户审批（PermissionRequest） |
| `waitingForAnswer` | gold | 等待用户回答问题 |
| `completed` | green | 会话结束（包含旧 error/done） |

### Wire Protocol 映射

HTTP Hook 端点收到的 7 态事件映射到 4-phase：

| Hook 事件 | 旧 State | 新 Phase |
|-----------|----------|----------|
| idle | `idle` | `idle` (UI-only) |
| PreToolUse | `thinking` | `running` |
| UserPromptSubmit | `running` | `running` |
| PostToolUse | `streaming` | `running` |
| PermissionRequest | `approval` | `waitingForApproval` |
| Notification (question) | `approval` | `waitingForAnswer` |
| PostToolUseFailure | `error` | `completed` |
| Stop | `done` | `completed` |

---

## IPC Commands

### Overlay / Window

| Command | Description |
|---------|-------------|
| `create_overlay` | 创建原生 overlay HWND，返回序列化 HWND 字符串 |
| `set_overlay_interactive` | 切换原生 overlay HWND 的点击穿透 |
| `update_overlay` | 更新原生 overlay HWND 位置和尺寸 |
| `destroy_overlay` | 销毁原生 overlay HWND |
| `set_window_size` | 设置主 Tauri WebView 窗口尺寸，并默认顶部居中 |
| `set_window_interactive` | 切换主 Tauri WebView 窗口点击穿透 |
| `update_overlay_size` | 动画同步用轻量 resize，约 16ms 节流，不重居中 |

### DPI

| Command | Description |
|---------|-------------|
| `get_dpi_scale` | 获取指定 HWND 的 DPI scale |
| `get_dpi_scale_at_position` | 获取指定屏幕点所在显示器 DPI scale |
| `update_overlay_with_dpi` | 带显式 DPI scale 更新 overlay |
| `enable_dpi_awareness` | 启用 Per-Monitor DPI Awareness V2 |

### Hook Server

| Command | Description |
|---------|-------------|
| `get_hook_server_status` | 返回 hook server 是否运行和端口 |
| `start_hook_server` / `stop_hook_server` | 启停 HTTP hook server |
| `get_hook_health` | 返回连接状态、uptime、请求数、错误数、pending approvals |
| `get_hook_errors` | 读取后端 hook 错误日志 |
| `clear_hook_errors` | 清空 hook 错误日志 |
| `submit_approval_response` | 通过 `tool_use_id` 提交审批结果 |

### Hook Configuration

| Command | Description |
|---------|-------------|
| `check_hook_config` | 检查 Claude Code settings 是否包含必需 hooks |
| `install_hooks` | 合并写入 Vibe Island hooks，并创建备份 |
| `uninstall_hooks` | 移除 Vibe Island hooks，存在备份时恢复备份 |
| `get_hook_config_status` | 读取当前 hook 配置状态 |
| `set_hook_config_mode` / `get_hook_config_mode` | 持久化读取自动配置模式 |

### Named Pipe / Process / Focus

| Command | Description |
|---------|-------------|
| `get_pipe_server_status` | 返回 Named Pipe server 状态 |
| `start_pipe_server` / `stop_pipe_server` | 启停 Named Pipe server |
| `start_process_watcher` / `stop_process_watcher` | 启停进程轮询 |
| `get_process_watcher_status` | 返回进程监控状态 |
| `get_detected_processes` | 返回当前检测到的 agent 进程 |
| `set_process_watcher_config` | 设置轮询间隔和 node 进程检测开关 |
| `focus_session_window` | 按 PID 聚焦会话窗口 |
| `emit_test_event` | 开发/测试用事件注入命令 |

---

## Tauri Events

| Event | Producer | Description |
|-------|----------|-------------|
| `session_start` | Hook server / pipe server / test command | 创建或更新 session |
| `session_end` | Pipe server / test command | 移除 session |
| `state_change` | Hook server / pipe server / test command | 更新 session state |
| `tool_use` | `PreToolUse` hook | 设置当前工具和文件路径 |
| `tool_complete` | `PostToolUse` hook | 记录成功工具执行并清除当前工具 |
| `tool_error` | `PostToolUseFailure` hook | 记录失败工具执行和错误 |
| `notification` | `Notification` hook | 普通通知事件 |
| `permission_request` | `PermissionRequest` hook | 显示审批面板 |
| `approval_timeout` | `PermissionRequest` timeout | 清理前端审批面板 |
| `hook_heartbeat` | `/hooks/ping` | Hook server 心跳 |
| `process_detected` | Process watcher | 检测到 agent 进程 |
| `process_terminated` | Process watcher | agent 进程退出 |

---

## HTTP Hook Endpoints

Hook server 固定监听 `127.0.0.1:7878`。

| Method | Endpoint | Behavior |
|--------|----------|----------|
| POST | `/hooks/session-start` | 创建 session，并初始化为 `idle` |
| POST | `/hooks/pre-tool-use` | 确保 session 存在，切到 `thinking`，发出 `tool_use` |
| POST | `/hooks/post-tool-use` | 发出 `tool_complete`，切到 `streaming` |
| POST | `/hooks/post-tool-use-failure` | 发出 `tool_error`，切到 `error`，记录错误日志 |
| POST | `/hooks/notification` | `permission_prompt` -> `approval`，`idle_prompt` -> `idle`，其他发 `notification` |
| POST | `/hooks/stop` | 切到 `done` |
| POST | `/hooks/user-prompt-submit` | 切到 `running` |
| POST | `/hooks/permission-request` | 阻塞等待前端审批，返回 Claude Code PermissionRequest 响应 |
| POST | `/hooks/ping` | 更新 heartbeat 并发 `hook_heartbeat` |
| GET | `/hooks/health` | 返回 hook server health JSON |

自动配置当前写入的必需 Claude Code hook 事件为：`SessionStart`、`PreToolUse`、`PostToolUse`、`Notification`、`Stop`、`UserPromptSubmit`、`PermissionRequest`。`PostToolUseFailure` 和 `/hooks/ping` 路由已实现，但不在当前自动写入的 required hooks 列表中。

---

## Hook Configuration Modes

| Mode | Serialized Value | Behavior |
|------|------------------|----------|
| Auto | `auto` | 启动时自动配置 hooks，退出时保留 |
| AutoCleanup | `autoCleanup` | 启动时自动配置 hooks，通过 tray Quit 退出时移除 |
| Manual | `manual` | 不自动配置，由用户手动管理 |

配置文件存储在系统配置目录下的 `vibe-island/config.json`。Claude Code settings 优先使用已有的用户级 `~/.claude/settings.json`，其次使用当前目录 `.claude/settings.json`；若都不存在则创建用户级 settings。

`install_hooks` 会在写入前创建备份：`settings.json.vibe-island-backup`。合并策略是非破坏性的：缺失的 hook 会新增，已指向 Vibe Island 的 hook 会更新，用户已有且不指向 Vibe Island 的同名 hook 会保留不覆盖。

---

## Key Constraints

### 必须遵守

1. **HWND 序列化**：Tauri IPC 不能传递原始指针，HWND 必须格式化为字符串后跨 IPC 传递。
2. **条件编译**：所有 Win32 专用代码必须在 `#[cfg(target_os = "windows")]` 下，并为非 Windows 提供 stub。
3. **Overlay 样式**：原生 overlay 创建时必须保留 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE`。
4. **主窗口透明**：Tauri 主窗口保持 `transparent: true`、`decorations: false`、`alwaysOnTop: true`。
5. **Hook 配置非破坏性**：自动配置不得覆盖用户已有的非 Vibe Island hook。
6. **配置治理**：前端 UI 配置（`ui.dimensions.*`、`ui.stateColors`、`ui.animation.*`）在 Rust 和前端都有默认值。Rust 通过 `get_app_config` 返回的配置会 **deep merge** 到前端默认值上，不会覆盖缺数字段。修改 UI 配置时**两边都要改**，改完后通过 `cargo check && npm run build` 验证一致性。
7. **审批关联**：审批响应必须通过 `tool_use_id` 匹配 pending approval，不能只按 session 匹配。

### 禁止事项

1. 禁止直接通过 IPC 传递 raw HWND。
2. 禁止删除 Win32 代码的 target OS 条件编译。
3. 禁止移除 overlay 关键扩展窗口样式。
4. 禁止把 Mock/demo 作为真实集成路径；当前真实路径是 HTTP Hooks 和 Named Pipe SDK。
