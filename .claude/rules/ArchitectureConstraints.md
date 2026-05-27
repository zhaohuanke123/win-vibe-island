# 架构约束

从 `architecture.md` 提取的硬性约束，所有代码变更必须遵守。

## 必须遵守

1. **HWND 序列化**：Tauri IPC 不能传递原始指针，HWND 必须格式化为字符串（`format!("{:?}", hwnd)`）。
2. **条件编译**：所有 Win32 专用代码必须在 `#[cfg(target_os = "windows")]` 下，并为非 Windows 平台提供 stub。
3. **Overlay 样式**：原生 overlay 创建时必须保留 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE`。
4. **主窗口透明**：Tauri 主窗口保持 `transparent: true`、`decorations: false`、`alwaysOnTop: true`。
5. **Hook 非破坏性**：自动配置 hooks 时不得覆盖用户已有的非 Vibe Island hook。
6. **配置治理**：以下配置在 Rust 和前端都有默认值，修改时两边都改：

| 配置类别 | Rust 文件 | 前端文件 | 同步项 |
|----------|----------|---------|--------|
| 状态颜色 | `src-tauri/src/config/types.rs` → `StateColors` | `frontend/src/store/config.ts` → `DEFAULT_CONFIG.ui.stateColors` | idle/running/waitingForApproval/waitingForAnswer/completed |
| 弹簧参数 | `types.rs` → `SpringConfig` | `config.ts` → `DEFAULT_CONFIG.ui.animation.spring` | expand/collapse/transition/micro |
| 动画时长 | `types.rs` → `AnimationConfig` | `config.ts` → `DEFAULT_CONFIG.ui.animation` | running/waitingForApproval/waitingForAnswer duration |
| UI 尺寸 | `types.rs` → `UiDimensions` | `config.ts` → `DEFAULT_CONFIG.ui.dimensions` | barHeight/padding/gap/statusDotSize |
| UI 杂项 | `types.rs` → `UiConfig` | `config.ts` → `DEFAULT_CONFIG.ui` | stateIndicator/density |
| Overlay 尺寸 | `types.rs` → `OverlayConfigDefaults` | `config.ts` → `DEFAULT_CONFIG.overlay` | compactWidth/expandedWidth/各种radius |

验证：`cargo check && npm run build`
7. **审批关联**：审批响应必须通过 `tool_use_id` 匹配 pending approval，不能只按 session 匹配。

## 禁止事项

1. 禁止直接通过 IPC 传递 raw HWND。
2. 禁止删除 Win32 代码的 target OS 条件编译。
3. 禁止移除 overlay 关键扩展窗口样式。
4. 禁止把 Mock/demo 作为真实集成路径；真实路径是 HTTP Hooks 和 Named Pipe SDK。
