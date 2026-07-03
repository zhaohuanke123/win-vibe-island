# Backlog（迁移自 Task.json）

> **来源**：cron-review 自动发现，原存于 Task.json（2026-06-13 ~ 2026-06-15）。
> **现状**：Task.json 已迁移到 OpenSpec。critical 项已转为活跃 change（见下方）；本文件列出其余项，按需用 `/opsx:propose` 升级为 change。
> 完整 description/fix 文本见 git 历史（迁移前的 Task.json）或对应源码 file:line。

## 已转为 OpenSpec change（critical）

| 原 ID | OpenSpec change |
|---|---|
| HOOK-003 + HOOK-004 | `fix-hook-docs-http-vs-command` |
| REACT-001 + REACT-002 | `fix-frontend-error-logging`（合并：同一 ErrorHandlingConvention 根因）|
| HOOK-010 | `fix-refresh-title-state-regression` |

## medium (18)

- **HOOK-005** `architecture.md 407` architecture.md Hook 配置存储路径描述错误
  - _cron-review-hook-adapter 2026-06-14_
- **HOOK-006** `hook_server.rs 926` architecture.md 说审批超时 120 秒，但代码三处路径都不一致
  - _cron-review-hook-adapter 2026-06-14_
- **HOOK-007** `README.md L10-16` README.md 仍显示旧的 7 态模型
  - _cron-review-hook-adapter 2026-06-14_
- **HOOK-008** `src-tauri/src/pipe_server.rs L844-1021` hook_server.rs 和 pipe_server.rs 有 4 个重复的辅助函数
  - _cron-review-hook-adapter 2026-06-14_
- **RUST-001** `src-tauri/src/session_state.rs 96` on_session_started 对已存在 session 设置 phase=Completed 逻辑错误
  - _cron-review-rust-core 2026-06-14_
- **RUST-002** `architecture.md 361-374` architecture.md Tauri Events 表缺少统一 agent_event 事件
  - _cron-review-rust-core 2026-06-14_
- **RUST-003** `architecture.md 336-343` architecture.md Hook Configuration 命令表缺少 Codex CLI 命令
  - _cron-review-rust-core 2026-06-14_
- **RUST-004** `architecture.md 186` architecture.md 误称 debug 模式启用 tauri-plugin-log
  - _cron-review-rust-core 2026-06-14_
- **RUST-007** `docs/architecture/states-and-flows.md L14-87` states-and-flows.md 仍使用旧 7 态模型，未更新到 4-phase 模型
  - _cron-review-rust-core 2026-06-15_
- **REACT-003** `architecture.md 300-356` architecture.md IPC Commands 表缺少 12 个前端调用的命令
  - _cron-review-react 2026-06-14_
- **REACT-004** `architecture.md 361-374` architecture.md Tauri Events 表缺少 permission_resolved/test_reset 事件
  - _cron-review-react 2026-06-14_
- **REACT-005** `architecture.md 312` architecture.md update_overlay_size 命令参数与实际不匹配
  - _cron-review-react 2026-06-14_
- **HOOK-011** `src-tauri/src/hook_server.rs, src-tauri/src/adapters/claude_adapter.rs hook_server.rs L1361-1366, claude_adapter.rs L14-19` 时间戳精度不一致（秒 vs 毫秒）
  - _cron-review-hook-adapter 2026-06-15_
- **HOOK-012** `src-tauri/src/hook_server.rs L85-103` PendingApproval 结构体 5/6 字段被 #[allow(dead_code)] 抑制
  - _cron-review-hook-adapter 2026-06-15_
- **REACT-008** `frontend/src/hooks/useAgentEvents.ts 323` useAgentEvents.ts tool_complete conditionally drops executions without duration_ms
  - _cron-review-react 2026-06-15_
- **REACT-009** `frontend/src/hooks/useSessionPersistence.ts 82` useSessionPersistence.ts restoreSessions 空 catch 吞掉所有错误
  - _cron-review-react 2026-06-15_
- **REACT-013** `architecture.md 233-245` architecture.md Session Data Model 字段名 `phase` 应为 `state`
  - _cron-review-react 2026-06-15_
- **REACT-014** `architecture.md 262-269` architecture.md ApprovalRequest Data Model 缺少 4 个字段
  - _cron-review-react 2026-06-15_

## suggestion (14)

- **HOOK-001** `src-tauri/src/hook_server.rs 107-111` PENDING_APPROVALS 预初始化
  - _cron-review-hook-adapter 2026-06-13_
- **HOOK-002** `src-tauri/src/` Review 范围中提及的目录/文件不存在
  - _cron-review-hook-adapter 2026-06-13_
- **HOOK-009** `src-tauri/src/hook_config.rs L360-437` Claude Code command hook 未显式指定 --source 参数
  - _cron-review-hook-adapter 2026-06-14_
- **RUST-005** `src-tauri/src/window_focus.rs 658, 735` focus_any_terminal() 是死代码（#[allow(dead_code)] 抑制警告）
  - _cron-review-rust-core 2026-06-14_
- **RUST-006** `src-tauri/src/claude_usage.rs 67-109` claude_usage.rs 存在 4 次重复的 early-return 模式
  - _cron-review-rust-core 2026-06-14_
- **RUST-008** `src-tauri/src/events.rs 1-38` events.rs 是遗留模块，仅保留 3 个旧事件类型
  - _cron-review-rust-core 2026-06-15_
- **RUST-009** `src-tauri/src/approval_types.rs 1-19` approval_types.rs 嵌套 pub mod 导致双命名空间
  - _cron-review-rust-core 2026-06-15_
- **REACT-006** `frontend/src/components/SessionContextMenu.tsx 46-48` SessionContextMenu 视口裁剪注释与实际不符
  - _cron-review-react 2026-06-14_
- **REACT-007** `frontend/src/config/animation.ts 6-45` animation.ts 配置 getter 在动态更新时可能产生过期值
  - _cron-review-react 2026-06-14_
- **HOOK-013** `src-tauri/src/hook_server.rs L15（以及贯穿全文）` hook_server.rs 绕过 HookAdapter 分发，直接使用 ClaudeCodeAdapter
  - _cron-review-hook-adapter 2026-06-15_
- **REACT-010** `frontend/src/components/SessionRow.tsx 60-61` SessionRow.tsx stale 状态非响应式，行不会自动折叠
  - _cron-review-react 2026-06-15_
- **REACT-011** `frontend/src/components/SessionList.tsx 1-116` SessionList.tsx 是死代码（未在应用树中使用）
  - _cron-review-react 2026-06-15_
- **REACT-012** `frontend/src/components/GroupedRows.tsx 19-22` GroupedRows.tsx 重复定义 isStale 函数（与 phase-colors.ts 重复）
  - _cron-review-react 2026-06-15_
- **REACT-015** `architecture.md 195` architecture.md 紧凑胶囊高度描述错误（60px vs 32px）
  - _cron-review-react 2026-06-15_

