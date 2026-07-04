# Terminal Jump Specification

## Purpose

定义用户在 Vibe Island UI 中点击「跳转到终端/编辑器」时，系统如何把 AI agent 所在的终端窗口或编辑器窗口带到前台焦点（focus / activate）。这是 `src-tauri/src/terminal_jump/`（注册表驱动的探测与策略分发）和 `src-tauri/src/window_focus.rs`（Win32 窗口枚举与 SetForegroundWindow）之间的跨层契约。

子系统解决的核心问题：Agent（Claude Code / Codex / 自定义）的 PID 通常是后台进程（如 `node.exe`、`claude.exe`），无可见窗口；要精准跳回启动它的真实终端（Windows Terminal / WezTerm / Alacritty / Tabby）或 IDE（VS Code / Cursor / Windsurf），必须 (MUST) 做三件事：(1) 向上走进程树探测真实父终端；(2) 用注册表分发到对应的聚焦策略；(3) 当精准定位失败时逐级 fallback。本规格约束这三步的输入、策略选择优先级、超时、降级路径与错误处理。

实现参考：`src-tauri/src/terminal_jump/{mod,registry,snapshot,resolver,service}.rs`、`src-tauri/src/terminal_jump/strategies/{windows_terminal,cli_workspace,workspace_match,pid_fallback}.rs`、`src-tauri/src/window_focus.rs`、`src-tauri/src/agent_event.rs`（`JumpTarget` 结构体）、`src-tauri/src/commands.rs`（`focus_session_window` 命令）。

## Requirements

### Requirement: 注册表驱动的终端识别

子系统 MUST 通过 `KNOWN_TERMINALS` 注册表（`registry.rs`）声明已知终端，每个 `TerminalDescriptor` MUST 至少包含 `id`、`display_name`、`aliases`、`exe_names`、`focus_strategy`（`cli_command` 可选）。Resolver 与 Service MUST 通过 `find_by_id_or_alias` / `find_by_exe_name` 动态分发，MUST NOT 在策略链里硬编码终端类型判断（仅 `terminal_app == "WindowsTerminal"` 这种身份守卫允许）。

#### Scenario: 新增终端应用

- **WHEN** 新增一个已知终端（如 Sublime Merge）
- **THEN** 只需在 `KNOWN_TERMINALS` 追加一项并选定 `focus_strategy`，无需修改 Resolver 或 Service 主流程；新增项 MUST 至少声明 `id`、`display_name`、`aliases`、`exe_names`、`focus_strategy`

#### Scenario: 未注册的 exe 名

- **WHEN** 进程树探测遇到一个 exe 名未出现在任何 `TerminalDescriptor.exe_names` 中
- **THEN** MUST 跳过该进程继续向上走进程树，MUST NOT 报错或终止探测

### Requirement: 四种聚焦策略类型

注册表 MUST 通过 `FocusStrategyType` 枚举声明四种聚焦策略类型，每种类型对应一个策略实现：

| FocusStrategyType | 策略实现 | 适用终端 |
|---|---|---|
| `WindowsTerminal` | `WindowsTerminalStrategy` | Windows Terminal |
| `CliOpenWorkspace` | `CliWorkspaceStrategy` | 通过 CLI（如 `code -r`、`cursor -r`）打开 workspace 的 IDE |
| `WorkspaceMatch` | `WorkspaceMatchStrategy` | 通过窗口标题匹配 workspace 的 IDE（VS Code / Cursor / Windsurf） |
| `PidFallback` | `PidFallbackStrategy` | 通过 PID → EnumWindows → SetForegroundWindow 的终端（WezTerm / Alacritty / Tabby） |

每个策略 MUST 实现 `FocusStrategy::try_focus`，返回 `Option<JumpResult>`：`None` 表示该策略不适用于此目标（让下一个策略继续尝试），`Some(result)` 表示该策略已尝试（无论成功或失败）。

#### Scenario: 策略返回 None 表示「不归我管」

- **WHEN** 一个 `JumpTarget.terminal_app` 是 VS Code，但当前策略是 `WindowsTerminalStrategy`
- **THEN** 该策略 MUST 返回 `None`，让链上的下一个策略有机会处理

#### Scenario: 策略返回 Some(NotFound) 表示「归我管但找不到」

- **WHEN** `PidFallbackStrategy` 接受目标，但 `find_window_by_pid` 未找到可见窗口
- **THEN** MUST 返回 `Some(JumpResult::NotFound)`，Service 会按降级规则决定是否继续

### Requirement: 策略链顺序与降级

`TerminalJumpService::new` 在 Windows 平台 MUST 按以下固定顺序注册策略：`WindowsTerminal` → `CliOpenWorkspace` → `WorkspaceMatch` → `PidFallback`。`Service::jump` MUST 遍历策略链依次调用 `try_focus`：

- 策略返回 `None` → 继续下一个策略
- 策略返回 `Some(Success)` 或 `Some(AppActivated)` → 立即返回，不再尝试后续策略
- 策略返回 `Some(NotFound)` → 继续下一个策略
- 策略返回 `Some(Failed)` → 记录日志并继续下一个策略

所有策略都未命中（全为 `None` 或最终 `NotFound`）时，MUST 返回 `JumpResult::NotFound` 并记 WARN 日志。

#### Scenario: 首个策略精准命中

- **WHEN** `WindowsTerminalStrategy` 返回 `Success("...")`
- **THEN** Service MUST 立即返回该结果，MUST NOT 调用 `PidFallbackStrategy` 等后续策略

#### Scenario: 策略失败后降级

- **WHEN** 某策略返回 `Some(Failed(msg))`
- **THEN** Service MUST 记 INFO 日志后继续尝试下一个策略，MUST NOT 把单策略失败作为整体失败

#### Scenario: 全部策略耗尽

- **WHEN** 链上所有策略都返回 `None` 或 `NotFound`
- **THEN** Service MUST 返回 `JumpResult::NotFound` 并记 WARN 日志，MUST NOT panic

### Requirement: jump_to_session 三级降级路径

`jump_to_session` 是面向 IPC 命令的高层入口，MUST 按以下顺序尝试三条路径，任意一条返回 `Success` / `AppActivated` / `Failed` 即停止；只有返回 `NotFound` 才进入下一条：

1. **JumpTarget 策略链**：当 `jump_target.terminal_app` 为 `Some` 时，调用 `jump_to(target)`
2. **PID fallback**：当 `session_pid` 为 `Some` 时，先直接 `focus_window_by_pid`；若 `NotFound`，再用 `detect_terminal_app` 走进程树探测父终端 PID，对 IDE 类型（`CliOpenWorkspace` / `WorkspaceMatch`）且有 cwd 时优先用 `focus_by_workspace_with_exe`，否则用 `focus_window_by_pid(tpid)`
3. **Workspace fallback**：用 `JumpTarget.working_directory` 或 `session_cwd` 调用 `focus_by_workspace`（在 `code.exe` / `cursor.exe` 之间遍历）

cwd 取值 MUST 优先 `JumpTarget.working_directory`，其次 `session_cwd` 参数。

#### Scenario: JumpTarget 路径精准命中

- **WHEN** `jump_target.terminal_app = Some("WindowsTerminal")` 且策略链返回 `Success`
- **THEN** MUST 直接返回该结果，MUST NOT 进入 PID fallback 或 workspace fallback

#### Scenario: Agent 进程无窗口但父终端有

- **WHEN** `session_pid` 指向的进程无可见窗口（`focus_window_by_pid` 返回 `NotFound`），但 `detect_terminal_app` 探测到父终端 PID
- **THEN** MUST 用父终端 PID 重试聚焦，MUST NOT 直接降级到 workspace fallback

#### Scenario: IDE 父进程多窗口

- **WHEN** 探测到的父终端是 IDE（`WorkspaceMatch` 或 `CliOpenWorkspace` 策略类型）且有 cwd
- **THEN** MUST 用 `focus_by_workspace_with_exe(cwd, exe)` 按标题匹配 IDE 窗口，避免跳到错误的 IDE 窗口

#### Scenario: 所有路径耗尽

- **WHEN** 三条路径全部返回 `NotFound`（或 `terminal_app` / `pid` / `cwd` 都缺失）
- **THEN** MUST 返回 `JumpResult::NotFound` 并记 WARN 日志 `[jump_to_session] all paths exhausted`

### Requirement: 进程树探测不变量

`detect_terminal_app`（Resolver）MUST 从给定 PID 的**父进程**开始向上走进程树（不得检查传入 PID 本身），每层用 `find_by_exe_name` 匹配注册表；MUST 限制最大遍历层数（实现取值 10 层）以防无限循环；遇到 `pid == 0` 或进程已退出 MUST 停止并返回 `(None, None)`；命中时 MUST 返回 `(Some(规范化 app 名), Some(终端 PID))`。

「Windows Terminal」注册项命中时，规范化名 MUST 是 `"WindowsTerminal"`（无空格）；其他终端 MUST 用 `display_name` 作为 `terminal_app`。

#### Scenario: Hook PID 已退出（SessionStart 竞态）

- **WHEN** `resolve_from_pid` 用 hook PID 探测失败（`(None, None)`），但 `fallback_pid`（ppid）非零
- **THEN** Resolver MUST 用 ppid 重试一次 `detect_terminal_app`，以提高竞态场景下的命中率

#### Scenario: 进程树超过最大层数未命中

- **WHEN** 向上走满最大层数仍未找到注册终端
- **THEN** MUST 停止并返回 `(None, None)`，MUST NOT 继续遍历到系统根进程

#### Scenario: Windows Terminal 进程名匹配

- **WHEN** 进程树某层的 exe 名是 `WindowsTerminal.exe` 或 `wt.exe`（大小写不敏感）
- **THEN** MUST 命中 `windows-terminal` 注册项，返回 `terminal_app = "WindowsTerminal"`（不是 `display_name` "Windows Terminal"）

### Requirement: CLI 命令超时与隐藏窗口

`WindowsTerminalStrategy`、`CliWorkspaceStrategy` 在调用外部 CLI（`wt`、`code`、`cursor` 等）时 MUST 设置超时上限（实现取值 5 秒），并通过 `CREATE_NO_WINDOW` 创建子进程，避免弹出额外控制台窗口。`CliWorkspaceStrategy` MUST 通过 shell 调用（`cmd /C`）执行，以让 `cmd.exe` 按 `PATHEXT` 解析 `.cmd` / `.bat` 包装脚本（如 `code.cmd`）；MUST 使用 `-r`（reuse window）标志聚焦已有窗口而非新开。超时或 spawn 失败 MUST 返回 `JumpResult::Failed` 并记 WARN 日志。

#### Scenario: code.cmd 不在 PATH 直接路径

- **WHEN** 直接 `Command::new("code")` 因 `code.cmd` 不是可执行二进制而失败
- **THEN** `CliWorkspaceStrategy` MUST 通过 `cmd /C code -r ...` 让 `cmd.exe` 解析 PATHEXT 找到 `code.cmd`

#### Scenario: CLI spawn 失败

- **WHEN** `wt` 或 `code` 命令 spawn 失败（如未安装）
- **THEN** 策略 MUST 返回 `Some(JumpResult::Failed(e))`，MUST NOT panic；Service 会继续降级

### Requirement: Win32 窗口枚举与焦点约束

`window_focus.rs` 中的窗口枚举 MUST 通过 `EnumWindows` + 进程 PID 匹配，且 MUST 同时满足「可见（`IsWindowVisible`）」和「有非空标题（`GetWindowTextLengthW > 0`）」才视为有效候选。`focus_window` MUST 处理最小化窗口（先 `ShowWindow(SW_RESTORE)` 再聚焦），并在直接 `SetForegroundWindow` 失败时通过 `AttachThreadInput` 重试；仍失败 MUST 调用 `FlashWindowEx` 闪烁任务栏图标并返回 `FlashOnly`（不能完全静默失败）。

`focus_wt_window_by_workspace`（Windows Terminal 多窗口匹配）MUST 按以下顺序在候选窗口中选择：(1) 完整 workspace 路径子串匹配；(2) 最后一段文件夹名子串匹配；(3) 负向过滤（跳过标题含 `\Windows\system32` 的系统窗口）；(4) 回退到第一个候选。

#### Scenario: 目标窗口被最小化

- **WHEN** 目标 hwnd 处于最小化状态（`IsIconic` 为真）
- **THEN** `focus_window` MUST 先 `SW_RESTORE` 恢复窗口，恢复后再尝试焦点；成功时返回 `Restored`

#### Scenario: SetForegroundWindow 被系统拒绝

- **WHEN** 直接 `SetForegroundWindow` 返回 false（Windows 焦点防盗机制）
- **THEN** MUST 尝试 `AttachThreadInput` 后再次 `SetForegroundWindow`；若仍失败 MUST 调用 `FlashWindowEx(FLASHW_ALL | FLASHW_TIMERNOFG)` 闪烁任务栏，返回 `FlashOnly`（MUST NOT 返回 `Success`）

#### Scenario: Windows Terminal 多窗口标题匹配

- **WHEN** 同一 WindowsTerminal PID 有多个可见窗口（含不同 tab 标题），且提供了 workspace 路径
- **THEN** MUST 优先选择标题包含完整 workspace 路径的窗口；都不匹配时选文件夹名匹配；再不匹配时排除系统窗口；最终回退第一个候选

### Requirement: 平台条件编译

所有 Win32 API 调用（`EnumWindows`、`SetForegroundWindow`、`CreateToolhelp32Snapshot`、`FLASHWINFO` 等）MUST 在 `#[cfg(target_os = "windows")]` 下；非 Windows 平台 MUST 提供 stub 实现，stub MUST 返回 `NotFound` / `None` / `(None, None)` 等安全默认值。`TerminalJumpService::new` 在非 Windows 平台 MUST 返回空策略链，`jump_to_session` 在非 Windows 平台 MUST 直接返回 `JumpResult::NotFound`。

#### Scenario: 非 Windows 平台调用

- **WHEN** 在 Linux/macOS 上调用 `jump_to_session` 或 `focus_window_by_pid`
- **THEN** MUST 返回 `NotFound`，编译 MUST 通过，不得出现链接错误

#### Scenario: 空 jump_target 在非 Windows

- **WHEN** `resolve_from_pid(0, Some(cwd), None)` 在非 Windows 平台被调用
- **THEN** MUST 返回所有字段为 `None`（`pid` 字段为 `Some(0)`）的 `JumpTarget`，MUST NOT panic

### Requirement: IPC 暴露

子系统 MUST 通过 Tauri 命令 `focus_session_window(session_pid, jump_target, session_cwd)` 暴露给前端，命令 MUST 委托给 `terminal_jump::jump_to_session` 并返回 `JumpResult`。命令 MUST NOT 自行实现策略逻辑（保持薄壳）。诊断命令 `test_detect_terminal` / `debug_sessions` MUST 委托给 `terminal_jump::resolver::resolve_from_pid`，MUST NOT 直接调用已废弃的 `window_focus::detect_terminal_type`。

#### Scenario: 前端点击跳转

- **WHEN** 前端 `invoke("focus_session_window", { sessionPid, jumpTarget, sessionCwd })`
- **THEN** 命令 MUST 把参数转发给 `jump_to_session`，返回 `JumpResult` 给前端；命令本身 MUST NOT 修改任何状态

#### Scenario: 诊断命令使用 Resolver API

- **WHEN** `test_detect_terminal` 或 `debug_sessions` 调用终端探测
- **THEN** MUST 使用 `resolve_from_pid`；任何使用已废弃 `detect_terminal_type` 的新代码视为违反不变量

### Requirement: Resolver 快照与 tab 精细化

`resolve_from_pid` 在确定 `terminal_app` 后，MUST 尝试用 CLI 快照补充精确信息：

- 对 `PidFallback` 策略类型且 `id == "wezterm"`：尝试 `snapshot_wezterm` + `find_matching_wezterm_pane`（按 cwd）补充 `terminal_session_id`
- Windows Terminal 的 tab 快照 MUST 返回 `None`（禁用）

WezTerm 快照（`wezterm cli list --format json`）MUST 通过 `CREATE_NO_WINDOW` 执行并解析每行 JSON。`find_matching_wezterm_pane` 的匹配 MUST 是 `cwd` 标准化（去末尾路径分隔符、大小写不敏感）后完全相等。

Windows Terminal tab 快照禁用原因：`wt.exe` 是 UWP GUI 应用，在非终端上下文调用会把子命令（如 `list-tabs`）误认为要执行的程序，弹出错误标签页；`CREATE_NO_WINDOW` 仅对 console 进程有效，对 `wt.exe` 无效。Windows Terminal 的实际聚焦 MUST 回退到 PID 方式。

#### Scenario: Windows Terminal tab 快照被禁用

- **WHEN** `resolve_from_pid` 探测到 Windows Terminal 终端
- **THEN** `snapshot_windows_terminal()` MUST 返回 `None`，不产生任何 `wt.exe list-tabs` 子进程；`terminal_tab_id` / `terminal_tab_index` 保持 `None`，聚焦回退到 PID 路径

#### Scenario: WezTerm pane 按路径匹配

- **WHEN** `wezterm cli list` 返回多个 pane，其中某个 pane 的 `cwd` 与 JumpTarget 的 `working_directory` 标准化后大小写不敏感相等
- **THEN** `find_matching_wezterm_pane` MUST 返回该 pane，把 `pane_id` 写入 `terminal_session_id`

### Requirement: 错误日志与可观测性

子系统的所有关键决策点 MUST 记录结构化日志（遵循 `LOGGING_CONTRACT.md` 的 `[function_name] key=value` 格式）：

- 策略链每步命中 / 失败 MUST 记 INFO 级别
- `jump_to_session` 三条路径的进入与退出 MUST 记 INFO（含 `path=1/2/3`）
- 全部策略耗尽 MUST 记 WARN
- CLI 命令 spawn 失败 MUST 记 WARN
- 进程树探测每层命中 / 未命中 SHOULD 记 INFO

日志 MUST NOT 在高频路径（如 `EnumWindows` 回调内）逐窗口打印。

#### Scenario: 跳转失败的根因可追溯

- **WHEN** `jump_to_session` 最终返回 `NotFound`
- **THEN** 日志 MUST 能让开发者重构出哪条路径被尝试、为什么失败（哪个策略 `NotFound`、哪个 `Failed`），MUST NOT 只留一句「失败」无上下文

#### Scenario: 高频路径不刷屏

- **WHEN** `EnumWindows` 回调遍历数十个窗口
- **THEN** MUST NOT 在回调内逐窗口记日志；候选窗口汇总（如 `focus_wt_window_by_workspace` 的候选列表）记一次 INFO 即可
