## Why

`hook_config.rs::generate_hook_config()` 实际生成 **command hooks**（`type: "command"`，指向 `vibe-island-hooks.exe`），事件流走 `vibe-island-hooks → Named Pipe → pipe_server.rs → session_state.rs`。但文档仍以 **HTTP hooks** 为主要集成路径：
- `docs/hooks/hooks-setup.md`（L42-121）的手动配置示例用 `type: "http"`，URL 指向 `localhost:7878/hooks/xxx`
- `architecture.md`（L215、L378-398 HTTP Endpoints 表、启动流程描述）以 HTTP hook server 为假设

代码中 HTTP 已被标注为 "legacy detection"（`hook_config.rs` L304）。当 command hooks 安装后，HTTP hook server 实际收不到事件——按文档手动配置或读架构者会得到错误的系统模型。

本 change 合并了 cron-review 标记的两条 critical（**HOOK-003**、**HOOK-004**，根因相同）。动机：消除文档与代码的根本性背离，让文档反映真实架构，避免后续维护者基于错误模型做决策。

## What Changes

以代码为准，统一文档到 command-hook 模型（代码不改，command hook 是当前正确实现）：
- `docs/hooks/hooks-setup.md`：手动配置示例改为 command hook 格式；HTTP 模式标注为 legacy / 不推荐
- `architecture.md`：主集成路径改述为 command hooks（`vibe-island-hooks.exe → Named Pipe → pipe_server.rs → session_state.rs`）；L378-398 HTTP Endpoints 表注明 legacy；补充 pipe 协议说明
- `.claude/skills/hook-integration/SKILL.md` 与 `session-flow/SKILL.md`：同步传输层描述（HTTP hook 标注为 legacy / 备用）

## Non-Goals

- 不改 `hook_config.rs` 或任何运行时代码
- 不移除 HTTP hook server（保留为备用路径）
- 不补 spec delta —— `openspec/specs/hook-integration/spec.md` 已刻意保持传输无关，本 change 是文档对齐

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无 —— 本 change 是文档对齐，不改变 spec 级行为。）

## Impact

- 受影响文件：`docs/hooks/hooks-setup.md`、`architecture.md`、`.claude/skills/hook-integration/SKILL.md`、`.claude/skills/session-flow/SKILL.md`
- 不影响代码、API、运行时行为
- 风险：若仍有用户依赖 HTTP hook 路径，需在文档中给出迁移说明
