---
name: session-flow
description: |
  Agent 事件处理流程。从 Hook/Pipe 接收到前端渲染的完整数据链路，以及新增事件适配器的步骤。
  触发条件：
  - 用户要理解或修改事件处理链路
  - "事件流"、"数据流"、"adapter"、"session_state"
  - 需要添加新的 Agent 事件类型
  - 事件没有正确传递到前端
  - "pipe_server"、"hook_server"、"adapters"
  不要触发：与事件流无关的模块修改
---

# Agent 事件处理流程

## 完整数据链路

```
Claude Code HTTP Hooks ──→ hook_server.rs ──┐
                                              ├──→ adapters/ ──→ agent_event.rs ──→ session_state.rs ──→ Tauri emit ──→ Frontend listen ──→ Zustand store
Codex CLI / Custom Agent ──→ pipe_server.rs ─┘
```

## 双通道架构

| 通道 | 入口 | 协议 | 适用场景 |
|------|------|------|----------|
| HTTP Hook | `hook_server.rs` | HTTP POST on `localhost:7878` | Claude Code（主要） |
| Named Pipe | `pipe_server.rs` | JSON over Named Pipe | Codex CLI、自定义 Agent |

## 启动流程

在 `lib.rs` 的 `setup` 中按顺序初始化：

1. `logger::init()` — JSONL 日志
2. `session_state::init()` — Session 状态
3. `transcript_discovery::merge_into_state()` — 发现已有 session
4. `pipe_server::start_pipe_server()` — Named Pipe 服务器
5. `hook_server::start_hook_server()` — HTTP Hook 服务器
6. `process_watcher::start_process_watcher()` — 进程监控
7. `hook_config::auto_configure_hooks()` — 自动配置 hooks

## Session 生命周期

```
session_start → [state_changes...] → session_end
```

每个 session 通过 `session_id` 唯一标识。状态变更通过 `state_change` 事件传递。

## 关键文件

| 文件 | 职责 |
|------|------|
| `src-tauri/src/hook_server.rs` | HTTP Hook 服务器，处理 Claude Code hooks |
| `src-tauri/src/pipe_server.rs` | Named Pipe 服务器，处理其他 Agent |
| `src-tauri/src/adapters/` | 事件适配器，标准化不同来源的事件 |
| `src-tauri/src/agent_event.rs` | 统一事件模型（AgentEvent 枚举） |
| `src-tauri/src/session_state.rs` | Session 状态 reducer（单一数据源） |
| `src-tauri/src/events.rs` | Tauri 事件发射函数 |
| `frontend/src/hooks/useAgentEvents.ts` | 前端事件监听和 Zustand 更新 |
| `frontend/src/store/sessions.ts` | Zustand store |

## 新增事件适配器步骤

1. 在 `agent_event.rs` 的 `AgentEvent` 枚举中添加新 variant
2. 在对应 adapter 中将原始数据映射到新 variant
3. 在 `session_state.rs` 的 reducer 中处理新事件
4. 在 `events.rs` 中添加新的 emit 函数（如需前端推送）
5. 在前端 `useAgentEvents.ts` 中监听新事件
6. 在 Zustand store 中添加新事件的处理逻辑
7. 运行 `cargo check && npm run build` 验证

## 检查清单

- [ ] AgentEvent 枚举已更新
- [ ] Adapter 映射逻辑正确
- [ ] Session state reducer 处理新事件
- [ ] 前端监听新事件
- [ ] Zustand store 更新正确
- [ ] `cargo check && npm run build` 通过
