---
name: hook-integration
description: |
  Claude Code Hooks 集成配置。包含 7 种 Hook 事件、自动/手动配置模式、非破坏性合并策略和故障排查。
  触发条件：
  - 用户要配置或调试 Hooks
  - "hook 配置"、"Claude Code 集成"、"hook 不工作"
  - 需要添加新的 Hook 事件类型
  - Hook 健康检查失败
  - "session_start 没触发"、"permission_request 不响应"
  不要触发：与 Hook 集成无关的功能开发
---

# Hook 集成

Vibe Island 通过 HTTP Hooks 与 Claude Code 集成。本地启动 `http://localhost:7878` 服务器。

**参考文档**：`docs/hooks/hooks-setup.md`

## 7 种 Hook 事件

| Hook 事件 | 端点 | 用途 |
|-----------|------|------|
| SessionStart | `/hooks/session-start` | 会话开始，提取 session_id/label |
| PreToolUse | `/hooks/pre-tool-use` | 工具执行前，用于 PermissionRequest |
| PostToolUse | `/hooks/post-tool-use` | 工具执行后，状态更新 |
| Notification | `/hooks/notification` | 通知事件 |
| Stop | `/hooks/stop` | 会话停止 |
| UserPromptSubmit | `/hooks/user-prompt-submit` | 用户提交 prompt |
| PermissionRequest | `/hooks/permission-request` | 审批请求 |

## 配置模式

| 模式 | 行为 |
|------|------|
| Auto | 启动时自动配置，退出时保留 |
| AutoCleanup | 启动时自动配置，tray 退出时移除 |
| Manual | 不自动配置 |

配置文件存储在系统配置目录 `vibe-island/config.json`。

## 自动配置流程

1. 启动时检查 Claude Code settings
2. 如果缺少 hook → 合并 Vibe Island hooks
3. 写入前创建备份：`settings.json.vibe-island-backup`
4. 合并策略非破坏性：
   - 缺失的 hook → 新增
   - 已指向 Vibe Island 的 hook → 更新
   - 用户已有且不指向 Vibe Island 的 hook → 保留

Settings 路径优先级：用户级 `~/.claude/settings.json` → 项目级 `.claude/settings.json` → 新建用户级。

## 健康检查

- 端点：`GET /hooks/health`
- 间隔：5 秒轮询
- 连续 3 次失败 → 标记 disconnected

## 关键文件

| 文件 | 职责 |
|------|------|
| `src-tauri/src/hook_server.rs` | HTTP Hook 服务器 |
| `src-tauri/src/hook_config.rs` | 自动配置逻辑 |
| `src-tauri/src/hook_manifest.rs` | Hook 清单管理 |
| `docs/hooks/hooks-setup.md` | 完整配置指南 |

## 故障排查

1. 检查 `get_hook_server_status()` 确认服务器运行
2. 检查 `check_hook_config()` 确认 hooks 已安装
3. 查看 `get_hook_errors()` 获取错误日志
4. 确认 Claude Code settings.json 中 hook URL 指向 `http://localhost:7878`
5. 检查防火墙是否阻止本地连接

## 检查清单

- [ ] Hook 服务器在 `localhost:7878` 运行
- [ ] Claude Code settings.json 包含所有 7 种 hook
- [ ] 健康检查正常
- [ ] 非破坏性合并逻辑已验证
- [ ] `cargo check` 通过
