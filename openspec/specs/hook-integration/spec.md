# Hook Integration Specification

## Purpose

定义 Vibe Island 与 Claude Code hooks 的集成契约：必须 (MUST)覆盖的事件、配置模式、非破坏性合并规则、设置路径优先级与健康检查。
传输层（command-hook 二进制 `vibe-island-hooks.exe` 与 HTTP 服务器 localhost:7878）的具体选择由实现与 `fix-hook-docs-http-vs-command` change 对齐；本规格只约束行为不变量。

实现参考：`src-tauri/src/hook_server.rs`、`src-tauri/src/hook_config.rs`、`src-tauri/src/hook_manifest.rs`、`docs/hooks/hooks-setup.md`。

## Requirements

### Requirement: Seven Hook Events Coverage

Vibe Island 必须 (MUST)覆盖 Claude Code 的 7 种 hook 事件，每种映射到固定的处理端点/路由：

| Hook 事件 | 用途 |
|-----------|------|
| SessionStart | 会话开始，提取 session_id / label |
| PreToolUse | 工具执行前，用于 PermissionRequest |
| PostToolUse | 工具执行后，状态更新 |
| Notification | 通知事件 |
| Stop | 会话停止 |
| UserPromptSubmit | 用户提交 prompt |
| PermissionRequest | 审批请求 |

#### Scenario: 缺少某类 hook

- **WHEN** `auto_configure_hooks` 检测到 7 种 hook 中任一缺失
- **THEN** 必须 (MUST)标记为 partial / missing 并在健康检查中上报，不得静默忽略

### Requirement: Three Configuration Modes

hook 配置必须 (MUST)支持 3 种模式：

| 模式 | 行为 |
|------|------|
| Auto | 启动时自动配置，退出时保留 |
| AutoCleanup | 启动时自动配置，tray 退出时移除 |
| Manual | 不自动配置，由用户手动维护 |

配置模式存储在系统配置目录 `vibe-island/config.json`。

#### Scenario: AutoCleanup 退出

- **WHEN** 用户以 AutoCleanup 模式从 tray 退出
- **THEN** Vibe Island 写入的 hooks 必须 (MUST)被移除，用户原有 hooks 必须 (MUST)保留

### Requirement: Non-Destructive Merge

自动配置 hooks 时必须 (MUST)遵守非破坏性合并：

- 用户 settings 中**缺失**的 Vibe Island hook → 新增
- 已指向 Vibe Island 的 hook → 更新为本机最新配置
- 用户已有且**不指向** Vibe Island 的 hook → **保留不动**

写入前必须 (MUST)创建备份 `settings.json.vibe-island-backup`。

#### Scenario: 用户已有自定义 hook

- **WHEN** 用户 `settings.json` 的某个事件已配置了指向第三方工具的 hook
- **THEN** 自动配置不得覆盖该条目；Vibe Island 只能新增自己缺失的 hook，并在备份后写入

#### Scenario: 写入前备份

- **WHEN** 自动配置即将修改用户 settings.json
- **THEN** 必须 (MUST)先创建 `settings.json.vibe-island-backup`，以便回滚

### Requirement: Settings Path Priority

查找 / 写入 Claude Code settings 时必须 (MUST)按以下优先级：

1. 用户级 `~/.claude/settings.json`
2. 项目级 `.claude/settings.json`
3. 若都不存在 → 新建用户级 `~/.claude/settings.json`

#### Scenario: 仅项目级存在

- **WHEN** 用户级 settings 不存在但项目级存在
- **THEN** 配置写入用户级（优先级 1），不污染项目级

### Requirement: Hook Health Check

必须 (MUST)暴露健康检查机制：服务端点 `GET /hooks/health`，前端每 5 秒轮询，连续 3 次失败后标记为 disconnected。

#### Scenario: 连续失败

- **WHEN** 健康检查连续 3 次未收到正常响应
- **THEN** UI 必须 (MUST)显示 hook disconnected 状态，提示用户检查配置；不得继续假装在线
