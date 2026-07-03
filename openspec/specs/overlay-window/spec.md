# Overlay Window Specification

## Purpose

定义 Win32 overlay 悬浮窗与 Tauri 主窗口的创建、样式、DPI、尺寸同步、拖拽/点击事件、圆角裁剪的不变量。
这是 `src-tauri/src/overlay.rs`、`src-tauri/src/commands.rs`、`src-tauri/src/window_manager.rs` 与 `frontend/src/components/{Overlay,AnimatedOverlay}.tsx` 之间的跨层契约。

实现参考：`src-tauri/src/overlay.rs`、`src-tauri/src/commands.rs`（`apply_snap_aware_round_region`、`smart_snap_overlay`）、`src-tauri/src/window_manager.rs`（`SnapPosition`、`CURRENT_SNAP`）、`frontend/src/components/AnimatedOverlay.tsx`。

## Requirements

### Requirement: Overlay Extended Window Styles

原生 overlay HWND 创建时 MUST (MUST) 保留全部 4 个扩展样式：`WS_EX_LAYERED`（透明）、`WS_EX_TRANSPARENT`（点击穿透，按需切换）、`WS_EX_TOPMOST`（置顶）、`WS_EX_NOACTIVATE`（不抢焦点）。`set_overlay_interactive` MUST (MUST) 通过切换 `WS_EX_TRANSPARENT` 控制点击穿透。

#### Scenario: 缺少 WS_EX_NOACTIVATE

- **WHEN** overlay 创建时遗漏 `WS_EX_NOACTIVATE`
- **THEN** overlay 会抢夺焦点，破坏用户当前输入；视为违反不变量

### Requirement: Main Window Transparency

Tauri 主 WebView 窗口 MUST (MUST) 保持 `transparent: true`、`decorations: false`、`alwaysOnTop: true`，以承载透明 overlay UI。

#### Scenario: 主窗口装饰开启

- **WHEN** 主窗口误设 `decorations: true` 或 `transparent: false`
- **THEN** overlay 出现系统边框 / 不透明背景，破坏悬浮胶囊视觉

### Requirement: Conditional Compilation

所有 Win32 专用代码 MUST (MUST) 在 `#[cfg(target_os = "windows")]` 下，并为非 Windows 平台提供 stub（no-op）实现，保证跨平台编译。

#### Scenario: 非 Windows 平台编译

- **WHEN** 在 Linux/macOS 执行 `cargo check`
- **THEN** Win32 调用走 stub，编译 MUST 通过，不得出现链接错误

### Requirement: Per-Monitor DPI Awareness

启动时 MUST (MUST) 调用 `enable_dpi_awareness()` 启用 Per-Monitor DPI Awareness V2；Win32 尺寸设置 MUST (MUST) 用 `get_dpi_scale_for_window` 把 CSS 逻辑像素换算为物理像素；WebView 的 `RasterizationScale` / `devicePixelRatio` MUST (MUST) 与系统 DPI 一致。

#### Scenario: 高 DPI 显示器

- **WHEN** overlay 显示在 150% DPI 的显示器上
- **THEN** 物理像素 = 逻辑像素 × 1.5；CSS 圆角值 MUST 用逻辑像素高度（`size.height`），不得二次缩放

### Requirement: Overlay Size Update Throttling

`update_overlay_size` MUST (MUST) 至少 16ms（约 60fps）最小间隔节流，前端用 `requestAnimationFrame` 控制调用频率，后端用 `AtomicU64` 缓存避免重复 `SetWindowPos`。

#### Scenario: 动画期间高频 resize

- **WHEN** Framer Motion 动画的 `onUpdate` 每帧触发尺寸变化
- **THEN** 实际 `SetWindowPos` 调用 MUST 被节流到 ≥16ms 间隔，不得逐帧调用 Win32

### Requirement: Drag vs Click Disambiguation

拖拽与点击 MUST (MUST) 在统一的 `mouseup` 处理器中按移动距离阈值（约 3px）判定：未超阈值 = 纯点击（toggle），超阈值 = 拖拽结束（吸附）。不得用独立的 `onClick` 处理点击（Tauri WebView2 中 `onClick` 在 `mouseup` 之后触发，会产生竞争）。

#### Scenario: 拖拽松手

- **WHEN** 用户拖动 overlay 超过阈值后松手
- **THEN** MUST 触发吸附逻辑，不得误触展开/收缩 toggle

### Requirement: Multi-Layer Rounded Corner Consistency

overlay 圆角由多层独立裁剪机制共同决定（Win32 `SetWindowRgn`、Framer Motion `borderRadius`、`motion.div` `clipPath`、CSS `.overlay__shell` border-radius），所有层 MUST (MUST) 用吸附感知的同一逐角圆角值保持一致；`borderRadius` MUST (MUST) 放在 Framer Motion 的 `animate`（不是 `style`）以触发动画回调。

#### Scenario: 吸附顶部

- **WHEN** overlay 吸附到屏幕顶部（`snapPosition === "top"`）
- **THEN** 所有裁剪层 MUST 用「顶平底圆」值（`0px 0px ${r}px ${r}px`），否则顶部出现白色 / 非胶囊色边
