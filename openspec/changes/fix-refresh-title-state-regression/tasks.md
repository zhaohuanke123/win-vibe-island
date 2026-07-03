## 1. 修复 try_refresh_title

- [x] 1.1 `src-tauri/src/hook_server.rs`：`try_refresh_title` 签名增加 `opt_phase: Option<SessionPhase>` 参数；函数内 `phase` 取 `opt_phase.unwrap_or(SessionPhase::Running)`
- [x] 1.2 `handle_stop` 的 200ms 延迟任务（L755-764）调用 `try_refresh_title` 时传入 `Some(SessionPhase::Completed)`
- [x] 1.3 检查并更新所有其他 `try_refresh_title` 调用点：传入 `None`（保持原 Running 行为）

## 2. 验证

- [x] 2.1 `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- [ ] 2.2 端到端：触发一个会话到 Stop，观察前端 200ms 后是否仍保持 completed（不再闪烁回 running）— 待手动验证（需运行 app + 真实 Claude Code 会话）
- [x] 2.3 `openspec validate state-machine --type spec` 通过（确认 spec 未被破坏）
