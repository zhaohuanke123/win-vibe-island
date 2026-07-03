## ADDED Requirements

### Requirement: Canonical Hook Transport

Vibe Island 与 Claude Code 的主集成传输 MUST (MUST) 为 **command hooks**：`hook_config.rs::generate_hook_config()` 写入 `type: "command"`、`command` 指向 `vibe-island-hooks.exe`，事件流为 `vibe-island-hooks.exe → Named Pipe → pipe_server.rs → session_state.rs`。
HTTP hook server（localhost:7878）MUST (MUST) 视为 legacy / 备用路径，文档中 MUST 显式标注，不得作为推荐的手动配置方式。

#### Scenario: 文档与代码传输模型一致

- **WHEN** 维护者阅读 `docs/hooks/hooks-setup.md` 或 `architecture.md` 的集成章节
- **THEN** 看到的主传输路径 MUST 与 `hook_config.rs` 实际生成的 command hook 模型一致；HTTP 路径 MUST 明确标注为 legacy
