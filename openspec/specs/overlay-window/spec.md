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

`update_overlay_size` MUST (MUST) 以"离散调用"模式工作 —— 仅在动画完成（`onAnimationComplete`）端点和状态切换时调用，MUST NOT (MUST NOT) 在 Framer Motion `onUpdate` 中每帧调用。bounding box 尺寸由配置派生且在正常使用中恒定（详见 `Fixed Bounding Box Window Geometry`），因此端点调用实际是 no-op（尺寸未变）。

后端 MUST (MUST) 用 `AtomicU64` 缓存 `(width, height, radius, snap)` 组合避免重复 `SetWindowPos` / `SetWindowRgn`；前端 MUST NOT (MUST NOT) 在 `onUpdate` 回调中触发 `update_overlay_size`。

#### Scenario: 动画期间不调用 update_overlay_size

- **WHEN** expand / collapse 动画的 `onUpdate` 每帧触发
- **THEN** 前端 MUST NOT 调用 `update_overlay_size`；MUST 只在 `onAnimationComplete` 端点调用

#### Scenario: bounding box 未变时的 no-op

- **WHEN** `onAnimationComplete` 端点调用传入的 `(width, height)` 与后端缓存一致（bounding box 恒定下的常态）
- **THEN** 后端 MUST 提前 return，不触发 `SetWindowPos` 或 `SetWindowRgn`

### Requirement: Drag vs Click Disambiguation

拖拽与点击 MUST (MUST) 在统一的 `mouseup` 处理器中按移动距离阈值（约 3px）判定：未超阈值 = 纯点击（toggle），超阈值 = 拖拽结束（吸附）。不得用独立的 `onClick` 处理点击（Tauri WebView2 中 `onClick` 在 `mouseup` 之后触发，会产生竞争）。

#### Scenario: 拖拽松手

- **WHEN** 用户拖动 overlay 超过阈值后松手
- **THEN** MUST 触发吸附逻辑，不得误触展开/收缩 toggle

### Requirement: Multi-Layer Rounded Corner Consistency

overlay 圆角的视觉表达与命中区域 MUST (MUST) 按以下分工：视觉层（动画期间平滑变化）= `motion.div` 的 `clipPath`（Framer Motion `animate` 驱动）+ CSS `.overlay__shell` border-radius，这是 overlay 形状的唯一视觉来源；命中层（状态切换时 step 变化）= Win32 `SetWindowRgn`，仅承担点击命中测试，不再承担视觉裁剪。命中 region MUST (MUST) 由 `set_overlay_region` 命令独占管理（详见 `Region Ownership Solely in set_overlay_region`）。`borderRadius` MUST (MUST) 放在 Framer Motion 的 `animate`（不是 `style`）以触发动画回调。视觉层（clip-path + border-radius）MUST (MUST) 用吸附感知的同一逐角圆角值保持一致。命中 region MAY (MAY) 是纯矩形（不需与视觉圆角精确匹配），允许命中区比视觉稍大。

#### Scenario: 吸附顶部

- **WHEN** overlay 吸附到屏幕顶部（`snapPosition === "top"`）
- **THEN** 视觉层（clip-path + border-radius）MUST 用「顶平底圆」值（`0px 0px ${r}px ${r}px`），否则顶部出现白色 / 非胶囊色边

#### Scenario: 动画期间 region 恒定

- **WHEN** expand / collapse 动画进行中
- **THEN** Win32 region MUST 保持动画开始时设定的值不变（不在每帧重新 `SetWindowRgn`）；视觉层（motion.div width/height + clip-path）自由动画

### Requirement: Region Ownership Solely in set_overlay_region

HWND 的命中 region MUST (MUST) 只由 `set_overlay_region` 命令设置。其他 IPC 命令（`update_overlay_size`、`smart_snap_overlay`、`snap_overlay`、`set_window_size`）MUST NOT (MUST NOT) 调用 `apply_snap_aware_round_region` 或任何修改 HWND region 的 Win32 API。这避免了 B4-Lite 下"两套 region 管理互相覆盖"导致 compact 态 bbox 整块可见 + 拦截点击的 bug。

`apply_snap_aware_round_region` 函数定义 MAY (MAY) 保留为内部工具（标注 `#[allow(dead_code)]`），但 MUST NOT (MUST NOT) 被任何 IPC 命令自动调用。

#### Scenario: compact 态 bbox 空白区不可见

- **WHEN** overlay 处于 compact 态，用户观察屏幕
- **THEN** bounding box 中 motion.div 之外的区域 MUST 不可见（不出现 body 背景、白色条、渐变等），因为 region 缩到 motion.div 矩形 + layered window 透明背景

#### Scenario: compact 态 bbox 空白区点击穿透

- **WHEN** overlay 处于 compact 态，用户点击 bounding box 中 motion.div 之外的区域
- **THEN** 点击 MUST 穿透到下层窗口，MUST NOT 被 overlay 拦截

#### Scenario: 拖拽松手吸附后 region 保持小矩形

- **WHEN** 用户拖动 overlay 到屏幕顶部/底部并松手，`smart_snap_overlay` 触发 set_position
- **THEN** `smart_snap_overlay` MUST NOT 调用 `apply_snap_aware_round_region`；region MUST 保持 `set_overlay_region` 上次设置的小矩形（compact 药丸）；吸附后屏幕顶部/底部 MUST NOT 出现不可点击的大块区域

#### Scenario: update_overlay_size 不改 region

- **WHEN** `update_overlay_size` 被调用（无论是 AnimatedOverlay init 还是 onAnimationComplete）
- **THEN** 后端 MUST 只执行 `set_size` / `set_position`，MUST NOT 调用 `apply_snap_aware_round_region`；region 状态 MUST 不因 `update_overlay_size` 而改变

### Requirement: Adaptive Height Measurement Must Not Retarget In-Flight Animation

展开/收起动画飞行中，自适应高度测量（`ResizeObserver` 触发的 `measure()`）MUST (MUST) 不向 Framer Motion 的动画目标回写新值。测量结果 MUST (MUST) 仅在动画非飞行期间（动画启动前 或 `onAnimationComplete` 之后）影响 `overlayExpandedHeight`。这切断"`measure() → setMeasuredHeight → animate.height 目标重写 → 弹簧轨迹重规划`"反馈环。

实现侧不变量：
- `Overlay.tsx` MUST (MUST) 维护一个"动画飞行中"的瞬态标志（`useRef`），在 `isOverlayExpanded` 由 false→true 时置位、由 true→false 时复位、在 `AnimatedOverlay` 报告 `onAnimationComplete` 时复位。
- 该标志置位期间，`measure()` MUST (MUST) 提前 return（既不读 layout 也不调用 `setMeasuredHeight`）。
- `onAnimationComplete` 触发后 MUST (MUST) 主动调用一次 `measure()`，把动画期间累积的内容高度变化应用到 `measuredHeight` 并同步窗口尺寸。
- `isApprovalFocusMode` 路径使用固定 `APPROVAL_FOCUS_HEIGHT`，MUST (MUST) 不经过自适应测量，因此不受本不变量影响。

#### Scenario: 展开动画期间不重写目标

- **WHEN** 用户触发展开（`isOverlayExpanded: false → true`），Framer Motion 开始播放 expand 弹簧动画，且 `ResizeObserver` 在动画期间多次触发 `measure()`
- **THEN** `setMeasuredHeight` MUST 在动画飞行中保持不被调用；`overlayExpandedHeight`（透传给 `AnimatedOverlay` 的 `expandedHeight`）MUST 保持等于动画启动时的值，不得在动画中被改写

#### Scenario: 动画完成后切回自适应测量

- **WHEN** `AnimatedOverlay` 报告 `onAnimationComplete`（expand 动画结束）
- **THEN** "动画飞行中"标志 MUST 被复位，并 MUST 在同一回调中主动触发一次 `measure()`；该次测量结果 MUST 正常写入 `measuredHeight` 并通过 `update_overlay_size` 同步到 native 窗口

#### Scenario: 首次展开使用最小高度兜底

- **WHEN** 进程首次展开（`measuredHeight` 仍为初始值 `EXPANDED_MIN`，尚无任何历史测量值）
- **THEN** 动画目标 MUST 等于 `EXPANDED_MIN`；`onAnimationComplete` 后的首次 `measure()` MUST 把 `measuredHeight` 校正为真实内容高度（受 `clampOverlayHeight` 约束在 `[EXPANDED_MIN, EXPANDED_MAX]` 区间），并同步窗口尺寸（无动画，立即对齐）

#### Scenario: 收起切换必须复位动画标志

- **WHEN** `isOverlayExpanded` 由 true→false（收起），或 `AnimatedOverlay` 因异常未触发 `onAnimationComplete`
- **THEN** "动画飞行中"标志 MUST 被强制复位，避免测量被永久卡死；后续的 `ResizeObserver` 触发 MUST 恢复正常 `measure()` 行为

#### Scenario: 审批专注模式绕过自适应测量

- **WHEN** overlay 进入审批专注模式（`isApprovalFocusMode === true`）
- **THEN** `overlayExpandedHeight` MUST 直接使用固定 `APPROVAL_FOCUS_HEIGHT`，MUST 不读取 `measuredHeight`；本不变量描述的"动画飞行中冻结测量"MUST 对该路径无影响

### Requirement: Fixed Bounding Box Window Geometry

主 overlay HWND 的尺寸 MUST (MUST) 在启动时设为由配置派生的 max bounding box，并在正常使用中保持恒定（仅在配置变更时重算 + resize 一次）。bounding box MUST (MUST) 覆盖所有可达状态的尺寸最大值：

```
box.width  = max(compactWidth, expandedWidth, approvalFocusWidth)
box.height = max(barHeight, expandedMaxHeight, approvalFocusHeight,
                 panelMaxHeights.sessionList, panelMaxHeights.sessionDetail)
```

视觉形状变化（药丸 / 展开面板 / 审批）MUST (MUST) 在 WebView 内部表达（motion.div width/height 动画），HWND MUST NOT (MUST NOT) 跟随动画每帧 resize。motion.div 在 bbox HWND 内的位置由现有 flex 布局（`#root align-items: center`）决定，HWND 中心 = 屏幕锚（anchorCenter）= motion.div 中心。

#### Scenario: HWND 尺寸恒定

- **WHEN** overlay 在 compact / expanded / approval / sessionDetail 状态间切换或动画进行中
- **THEN** HWND 尺寸 MUST 保持等于 bounding box，不发生 resize；视觉差异仅通过 WebView 内的 motion.div 表达

#### Scenario: 配置变更触发重算

- **WHEN** 用户修改 `overlay.expandedMaxHeight` 或相关配置项导致 bounding box 推导值变化
- **THEN** overlay MUST 重算 bounding box 并 resize HWND 一次；之后恢复恒定

### Requirement: Region-Based Hit Testing for Compact State

compact 态下，bounding box 中"motion.div 之外"的区域 MUST (MUST) 点击穿透到下层窗口。这通过把 Win32 region 缩到 motion.div 当前在 HWND 内的子矩形实现 —— region 之外的 HWND 区域不接收鼠标事件。

- compact 态：region MUST (MUST) 覆盖 motion.div 当前矩形（居中于 bbox 的小药丸）；region 之外点击穿透。
- expanded / approval 态：region MUST (MUST) 覆盖 motion.div 当前矩形（接近或等于全 bbox）；整 motion.div 接收点击。
- region MUST (MUST) 仅在状态切换（compact ⇄ expanded ⇄ approval）和动画完成（motion.div 尺寸稳定）时更新，MUST NOT (MUST NOT) 在动画每帧更新。
- expand 动画完成时 region MUST (MUST) step 到 motion.div 展开后的矩形；collapse 动画完成时 region MUST (MUST) step 回 motion.div 收起后的药丸矩形。

`set_window_interactive` 的 `WS_EX_TRANSPARENT` 整窗切换 MUST (MUST) 保留用于"全局禁用 overlay 交互"场景，MUST NOT (MUST NOT) 用于 compact 态的精细命中测试（那是 region 的职责）。

#### Scenario: compact 态点击穿透空白

- **WHEN** overlay 处于 compact 态，用户点击 bounding box 中 motion.div 之外的区域
- **THEN** 点击 MUST 穿透到下层窗口，MUST NOT 被 overlay 拦截

#### Scenario: compact 态点击药丸正常触发

- **WHEN** overlay 处于 compact 态，用户点击可见的 motion.div 药丸区域
- **THEN** 点击 MUST 命中 motion.div，正常触发 onMouseDown / toggle 逻辑

#### Scenario: expand 动画完成后 region 跟随

- **WHEN** expand 动画结束、motion.div 已展开到接近 bbox 尺寸
- **THEN** region MUST 更新到 motion.div 展开后的矩形，覆盖整个可见区域

#### Scenario: collapse 动画完成后 region 收缩

- **WHEN** collapse 动画结束、motion.div 已收回到药丸尺寸
- **THEN** region MUST 收缩到 motion.div 当前矩形（居中于 bbox 的药丸），bbox 其余区域恢复点击穿透
