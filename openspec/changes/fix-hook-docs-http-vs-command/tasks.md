## 1. 调研确认

- [ ] 1.1 通读 `src-tauri/src/hook_config.rs`（特别是 `generate_hook_config`、`detect_hook_type`、L292-310 的 command/http 检测注释），确认 command hook 是当前主集成路径
- [ ] 1.2 确认 HTTP hook server（`hook_server.rs` on `localhost:7878`）目前是否仍在启动、是否仍接收任何事件（用于决定 "legacy / 备用" 的措辞强度）

## 2. 更新 hooks-setup.md

- [ ] 2.1 `docs/hooks/hooks-setup.md` L42-121：手动配置示例改为 command hook 格式（`type: "command"`、`command: "...vibe-island-hooks.exe"`、`matcher`）
- [ ] 2.2 添加说明：`type: "http"` 模式已不推荐（legacy），保留作迁移参考
- [ ] 2.3 核对所有端点路径示例与 `hook_manifest.rs` 的实际清单一致

## 3. 更新 architecture.md

- [ ] 3.1 L215 附近 "Claude Code HTTP Hooks" 主路径描述改述为 command hooks
- [ ] 3.2 L378-398 HTTP Endpoints 表加 "legacy" 标注，补充 pipe 协议说明（`vibe-island-hooks.exe → Named Pipe → pipe_server.rs`）
- [ ] 3.3 启动流程描述对齐（command hook + pipe server 为主，HTTP server 为备用）

## 4. 同步 skill 描述

- [ ] 4.1 `.claude/skills/hook-integration/SKILL.md`：传输层说明改为 command hook 为主、HTTP 为 legacy
- [ ] 4.2 `.claude/skills/session-flow/SKILL.md`：双通道架构表更新（HTTP 标注 legacy，pipe 通道为主）

## 5. 验证

- [ ] 5.1 `openspec validate --specs` 通过（hook-integration / session-flow spec 仍传输无关，无需 delta）
- [ ] 5.2 `npm --prefix frontend run build` 通过（仅文档变更，不应破坏构建）
