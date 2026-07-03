# Session Flow Specification

## Purpose

定义 Agent 事件从外部接入（HTTP Hook / Named Pipe）到前端 Zustand store 渲染的完整数据链路与不变量。
确保事件经过标准化、单一数据源 reducer、显式 Tauri emit，再到达前端，避免状态分叉。

实现参考：`src-tauri/src/hook_server.rs`、`src-tauri/src/pipe_server.rs`、`src-tauri/src/adapters/`、`src-tauri/src/agent_event.rs`、`src-tauri/src/session_state.rs`、`src-tauri/src/events.rs`、`frontend/src/hooks/useAgentEvents.ts`、`frontend/src/store/sessions.ts`。

## Requirements

### Requirement: Event Pipeline Ordering

所有 Agent 事件必须 (MUST)按以下固定顺序流经后端管线，不得跳过任何阶段：

```
接入层（hook_server.rs / pipe_server.rs）
  → adapters/（标准化为 AgentEvent）
  → agent_event.rs（统一事件模型）
  → session_state.rs（单一数据源 reducer）
  → events.rs（Tauri emit）
  → 前端 useAgentEvents.ts（listen）
  → Zustand store（sessions.ts）
```

#### Scenario: 跳过 reducer 直接 emit

- **WHEN** 适配器绕过 `session_state.rs` 直接调用 `events.rs` emit
- **THEN** 视为违反不变量；前端 Zustand 与后端 reducer 状态会分叉，代码审查 / 测试必须 (MUST)拦截

### Requirement: Dual-Channel Ingestion

系统必须 (MUST)支持两条独立的接入通道，且都最终汇入同一个 `agent_event.rs`：

| 通道 | 入口模块 | 适用来源 |
|------|----------|----------|
| HTTP Hook | `hook_server.rs`（localhost:7878） | Claude Code |
| Named Pipe | `pipe_server.rs`（JSON over Named Pipe） | Codex CLI、自定义 Agent |

#### Scenario: 两个通道并发事件

- **WHEN** 同一 session_id 的事件同时从 HTTP 与 Pipe 到达
- **THEN** reducer 必须 (MUST)按到达顺序串行化处理，最终状态一致，不得出现丢失或重复

### Requirement: Backend Startup Ordering

`lib.rs` 的 `setup` 必须 (MUST)按以下顺序初始化，前置模块是后续模块的依赖：

1. `logger::init()` — JSONL 日志
2. `session_state::init()` — Session 状态
3. `transcript_discovery::merge_into_state()` — 发现已有 session
4. `pipe_server::start_pipe_server()` — Named Pipe 服务器
5. `hook_server::start_hook_server()` — HTTP Hook 服务器
6. `process_watcher::start_process_watcher()` — 进程监控
7. `hook_config::auto_configure_hooks()` — 自动配置 hooks

#### Scenario: hook 服务器先于 session_state 启动

- **WHEN** `hook_server` 在 `session_state::init()` 之前启动并立即收到事件
- **THEN** 事件无处落地，启动序被视为错误；启动顺序必须 (MUST)保证 session_state 先就绪

### Requirement: Session Lifecycle

每个 session 由 `session_id` 唯一标识，生命周期为 `session_start → [若干 state_change] → session_end`。所有状态变更必须 (MUST)通过 `state_change` 事件携带 session_id 传递到前端。

#### Scenario: 未知 session_id 的事件

- **WHEN** reducer 收到一个未经过 `session_start` 的 session_id 事件
- **THEN** 必须 (MUST)先补建 session 记录（按需 auto-create）或丢弃并记 WARN，不得静默写入孤儿状态

### Requirement: Approval Response Correlation

审批响应 MUST (MUST) 通过 `tool_use_id` 匹配对应的 pending approval，不得只按 `session_id` 匹配。`submit_approval_response` 命令 MUST (MUST) 接受 `tool_use_id` 参数定位正确的 pending 项。

#### Scenario: 同一 session 多个 pending approval

- **WHEN** 同一 session 先后产生两个 PermissionRequest（不同 `tool_use_id`），用户响应第二个
- **THEN** MUST 用 `tool_use_id` 精确匹配第二个，不得误把响应应用到第一个或按 session 模糊匹配

### Requirement: Adding a New Event Adapter

新增 Agent 事件类型必须 (MUST)按以下完整步骤实现，任何一步缺失视为不完整：

1. 在 `agent_event.rs` 的 `AgentEvent` 枚举添加新 variant
2. 在对应 adapter 将原始数据映射到新 variant
3. 在 `session_state.rs` reducer 处理新事件
4. 在 `events.rs` 添加 emit 函数（如需前端推送）
5. 在 `frontend/src/hooks/useAgentEvents.ts` 监听新事件
6. 在 `frontend/src/store/sessions.ts` Zustand store 添加处理逻辑
7. 运行 `cargo check && npm run build` 验证

#### Scenario: 后端加了 variant 前端未监听

- **WHEN** `AgentEvent` 新增 variant 并 emit，但 `useAgentEvents.ts` 未监听
- **THEN** 后端事件被忽略，UI 不更新；步骤清单用于审查时发现这种缺失
