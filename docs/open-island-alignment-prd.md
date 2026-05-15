# Vibe Island v2.0 — Open Island 对标架构升级 PRD

> **参考项目:** [Open Island](https://github.com/Octane0411/open-vibe-island) (1k+ stars, 899 commits)  
> **目标:** 吸收 Open Island 的架构机制和功能设计，重构 Vibe Island 核心基础设施  
> **适用平台:** Windows (Tauri 2.0 + Rust + React)

---

## 0. 对标分析摘要

| 维度 | Open Island | Vibe Island 当前 | 差距 |
|------|-------------|-----------------|------|
| Agent 事件模型 | `AgentEvent` enum — 所有 agent 统一 | 分散的事件处理 | **需统一** |
| 状态管理 | `SessionState.apply()` 纯 reducer | Zustand store 散落逻辑 | **需集中化** |
| Hook 安装/卸载 | Manifest 跟踪 + 备份 + status 查询 | 直接写配置文件，无 manifest | **缺清单** |
| Session 发现 | JSONL transcript 扫描恢复 | 仅内置持久化 | **缺扫描** |
| 终端跳回 | 15+ 终端/IDE 精确跳回 | 基础 PID 窗口聚焦 | **需增强** |
| Usage Dashboard | 5h/7d 用量读取 | 无 | **缺** |
| Fail-open | 硬保证 | 有但需验证 | **需加固** |
| 多 Agent 支持 | 10 种 agent | 主要是 Claude Code | **可扩展** |

---

## Phase 1: 架构重构（基础设施）

### 1.1 AgentEvent 统一事件枚举

**当前问题:** `events.rs` 定义了 `SessionStart`, `StateChange`, `SessionEnd` 三个事件，`hook_server.rs` 做了大量 ad-hoc 映射。新增 agent 类型需要修改多处。

**方案:** 参照 Open Island 的 `AgentEvent` enum：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentEvent {
    SessionStarted(SessionStartedPayload),
    ActivityUpdated(ActivityUpdatedPayload),
    PermissionRequested(PermissionRequestPayload),
    QuestionAsked(QuestionAskedPayload),
    SessionCompleted(SessionCompletedPayload),
    ToolUseStarted(ToolUseStartedPayload),
    ToolUseCompleted(ToolUseCompletedPayload),
    JumpTargetUpdated(JumpTargetPayload),
    ErrorOccurred(ErrorOccurredPayload),
}
```

每个 variant 携带自包含的 payload，所有 agent (Claude Code / Codex / OpenCode / Cursor) 经过各自的 adapter 转换为统一事件。

**涉及文件:**
- Replace: `src-tauri/src/events.rs` → `src-tauri/src/agent_event.rs`（新模块）
- New: `src-tauri/src/adapters/claude_adapter.rs`（Claude Code hook → AgentEvent）
- New: `src-tauri/src/adapters/codex_adapter.rs`（预留）
- Modify: `src-tauri/src/hook_server.rs`（使用 adapter）
- Modify: `src-tauri/src/lib.rs`（注册新模块）

### 1.2 SessionState 纯 Reducer

**当前问题:** 前端 `store/sessions.ts` 的 Zustand store 散落着 session 创建/更新/完成逻辑。后端 `hook_server.rs` 也做部分状态管理。没有单一真相源。

**方案:**

```
后端 (Rust):
  SessionState.apply(event: AgentEvent) → SessionState  // 纯函数 reducer

前端 (TypeScript):
  sessionReducer(state: SessionState, event: AgentEvent): SessionState  // 镜像 reducer
```

- 后端 `SessionState` 持有 `HashMap<SessionId, AgentSession>`，通过 `apply()` 处理所有事件
- 前端通过 Tauri events 接收完整 `SessionState` 快照或增量更新
- Zustand store 瘦身为薄壳：只保存 `SessionState` + 派生 computed 值

**涉及文件:**
- New: `src-tauri/src/session_state.rs`（纯 reducer）
- New: `src-tauri/src/agent_session.rs`（Session 模型定义）
- Modify: `frontend/src/store/sessions.ts`（简化，引入 reducer）
- New: `frontend/src/shared/session-reducer.ts`（前端镜像 reducer）

### 1.3 Fail-Open 硬保证

**当前状态:** `hook_server.rs` 的 HTTP handler 返回 200 即使处理失败，但没有超时保护。

**改进:**
- Hook handler 必须设置全局超时（5 秒）
- 超时后立即返回 `{"permissionDecision": "allow"}`（fail-open）
- Pipe server 接受连接失败时不影响 agent 运行
- 添加 `--dry-run` 模式：agent hook CLI 在不连接 app 时静默退出

---

## Phase 2: Hook 安装/卸载重构

### 2.1 Manifest 清单机制

**当前问题:** `hook_config.rs` 安装时直接写 `settings.json`，卸载时扫描 URL 匹配来判断是否是自己的 hook。没有独立的安装清单：
- 卸载时可能误删用户自己的 hook（URL 巧合匹配）
- 多次安装不会去重
- 不知道"上次装了什么"

**方案:** 参照 Open Island 的 `ClaudeHookInstallerManifest`：

```rust
struct HookManifest {
    hook_command: String,       // 安装的 hook 命令
    installed_at: DateTime,     // 安装时间
    installed_hooks: Vec<String>,  // 已安装的 hook 事件名
    app_version: String,        // Vibe Island 版本号
}
```

- 安装前：读取 manifest 判断是否已安装
- 安装时：备份原 settings.json（时间戳命名）→ 写入 hooks → 写 manifest
- 卸载时：只删除 manifest 中记录的 hooks，保留用户自己的
- Status 查询：report installed/partial/missing + manifest 信息

**涉及文件:**
- Modify: `src-tauri/src/hook_config.rs`（重构为 HookManager）
- New: `src-tauri/src/hook_manifest.rs`（Manifest 结构 + 读写）

### 2.2 多 Agent Hook 安装支持

**当前:** 只支持 Claude Code (`~/.claude/settings.json`)。

**扩展:**
- Codex CLI (`~/.codex/config.toml` hooks)
- Cursor (`~/.cursor/hooks.json`)
- OpenCode (`~/.config/opencode/plugins/`)

每个 agent 有独立的 installer 实现，共享 manifest 格式。

---

## Phase 3: Session 发现与恢复

### 3.1 Transcript 扫描

**当前:** Task 36 实现了 session 持久化（保存到自己的文件），但没有扫描 agent 原生的 transcript 文件来恢复 session。

**方案:** 参照 `ClaudeTranscriptDiscovery`：
- 扫描 `~/.claude/projects/` 下的 `*.jsonl` 文件
- 流式解析（`BufReader` 逐行读，处理大文件不 OOM）
- 提取：session_id, cwd, 最后用户 prompt, 模型, 工具调用历史
- 与持久化缓存 merge（优先使用已有的 registry 数据）

**涉及文件:**
- New: `src-tauri/src/transcript_discovery.rs`
- Modify: `src-tauri/src/session_store.rs`（merge 逻辑）

---

## Phase 4: 终端跳回增强

### 4.1 Windows 终端精确跳回

**当前:** `window_focus.rs` 通过 PID → EnumWindows 找窗口 → SetForegroundWindow。只有一个策略。

**增强:**
| 终端/IDE | 跳回策略 |
|-----------|---------|
| Windows Terminal | `wt -w 0 focus-tab --target <tab-id>` |
| VS Code | `code -r <workspace-path>` |
| Cursor | `cursor -r <workspace-path>` |
| JetBrains IDEs | `idea64.exe --line <line> <file>` |
| 通用（fallback）| SetForegroundWindow + FlashWindowEx |

后端在 hook 事件时记录终端环境信息（终端类型、窗口标题、工作区路径），前端点击 session 时调用最精准的跳回命令。

---

## Phase 5: Usage Dashboard

### 5.1 Claude Code 用量面板

**当前:** 无。

**方案:** 参照 `ClaudeUsageLoader`：
- 读取 Claude Code 的用量缓存文件（`/tmp` 或 `~/.claude/` 下的 JSON）
- 提取 5 小时 / 7 天使用百分比 + 重置时间
- Settings 面板新增 Usage 标签页，显示进度条

---

## 实施优先级

| Phase | 内容 | 优先级 | 依赖 |
|-------|------|--------|------|
| 1.1 | AgentEvent 统一枚举 | P0 | 无 |
| 1.2 | SessionState 纯 Reducer | P0 | 1.1 |
| 1.3 | Fail-Open 硬保证 | P0 | 无 |
| 2.1 | Hook Manifest 清单 | P0 | 无 |
| 2.2 | 多 Agent Hook 安装 | P1 | 2.1 |
| 3.1 | Transcript 扫描 | P1 | 1.2 |
| 4.1 | 终端跳回增强 | P1 | 1.2 |
| 5.1 | Usage Dashboard | P2 | 无 |

---

## 风险与约束

- **向后兼容:** 重构 `events.rs` → `agent_event.rs` 时保留旧 Tauri event name，不做 breaking change
- **Windows 特化:** 终端跳回策略仅 Windows，不写跨平台兼容代码
- **Fail-open 优先:** 任何重构都不能破坏"agent 继续运行"的基本保证
