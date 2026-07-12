## Why

`fix-expand-animation-resizeobserver-feedback` 拆掉了 React 反馈环，但展开/收起动画仍**有些卡顿** —— 根因转移到每帧 Win32 调用：每个动画帧（~60Hz）触发一次 `update_overlay_size`，内部做 `set_size` + `SetWindowRgn(redraw=TRUE)` + `set_position`，在一个 `WS_EX_LAYERED` 透明分层窗口上。300ms 动画 ≈ 18 次完整 Win32 调用，其中 `SetWindowRgn` 带重绘是 Win32 最昂贵的操作之一。本 change 把"HWND 几何 = 视觉形状"的耦合拆开：HWND 恒定为 max bounding box，视觉变化用 CSS `clip-path` 在固定尺寸 div 上完成，Win32 调用从"每帧"降到"每状态切换"。

## What Changes

- **B4-Lite 离散 HWND resize**：HWND 启动即设为 max bounding box（从 config 派生），正常使用中尺寸恒定。`AnimatedOverlay` 的 `motion.div` **保留现有 width/height 动画**（视觉变化仍由 Framer Motion 表达），但**删除 `onUpdate` 每帧 `update_overlay_size` 调用** —— HWND 不再跟随动画每帧 resize，只在端点（动画完成）调用一次。
- **B1 region 命中测试**：compact 态 `set_overlay_region` 设到药丸子矩形（motion.div 当前位置 + 尺寸，HWND 其余区域点击穿透），expanded 态 region = motion.div 当前可见矩形。region 仅在状态切换 + 动画完成时更新（每秒 ≤1-2 次）。
- **Bounding box 推导**：从 config 一次性算出 `box = max(compact, expanded, approval, panelMaxHeights.*)`；HWND 启动即设为该尺寸，正常使用中尺寸恒定，仅在 config 变更时重算。
- **位置模型**：motion.div 在 bbox HWND 内仍由现有 flex 布局（`#root align-items: center`）居中，anchorCenter 仍以 HWND 中心为锚 —— 视觉与现状一致。
- **Spike 已通过**：Phase 1 的 `?sandbox=bbox-spike` 已验证 clip-path 机制（虽然 B4-Lite 最终不用 clip-path，spike 的 SetWindowRgn + 端点 resize 验证仍直接适用）。

## Non-Goals

- **不做完整 B4**（motion.div 固定 bbox + CSS `clip-path` 表达视觉变化）—— 实现期发现：这要求重写 Overlay 子组件（NotchRow、bar、panel）的布局模型，从"响应父级尺寸"改为"按 bbox 绝对定位 + clip-path 切片显隐"。风险/收益不划算，因为 WebView 内部 width/height 动画本身不是瓶颈（浏览器测试已证）。完整 B4 留作未来可选的进一步优化。
- **不改 `motion.div` 的 width/height/borderRadius/scale 动画** —— 视觉模型保持现状。
- **不做 B3**（`WM_NCHITTEST` / `HTTRANSPARENT` / WndProc subclass）。
- **不改审批专注模式核心逻辑**。
- **不改拖拽/吸附的产品行为**。
- **不做多显示器边界特判**。
- **不保留旧每帧同步路径** —— 干净切换。
- **不改 Rust ↔ 前端配置治理映射**。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `overlay-window`：
  - **MODIFIED** `Overlay Size Update Throttling` —— 节流模型从"每帧 ≥16ms"改为"动画端点离散调用 + 状态切换时 region 更新"，删除 onUpdate 每帧同步的契约。
  - **MODIFIED** `Multi-Layer Rounded Corner Consistency` —— 圆角裁剪层语义变化：Win32 region 现在同时承担"视觉裁剪 + 命中测试"，clip-path 承担动画期间平滑视觉。
  - **ADDED** `Fixed Bounding Box Window Geometry` —— HWND 尺寸恒定为 config 派生的 max bounding box。
  - **ADDED** `Region-Based Hit Testing for Compact State` —— compact 态 region 缩到视觉药丸形，空白 bounding box 区域 MUST 点击穿透。

## Impact

- **前端**：
  - `frontend/src/components/AnimatedOverlay.tsx` —— 从 width/height 动画改为固定尺寸 + clip-path 动画；移除 onUpdate 每帧 syncWindowSize，改为动画端点调用。
  - `frontend/src/components/Overlay.tsx` —— 引入 bounding box 计算 + 离散 resize 触发；pill 在 box 内偏移；拖拽/吸附几何重算。
  - `frontend/src/config/animation.ts` / `store/config.ts` —— 派生 bounding box 工具函数。
- **后端**：
  - `src-tauri/src/commands.rs` —— `update_overlay_size` 语义变化（端点调用而非每帧）；新增或在 `apply_snap_aware_round_region` 基础上调整 region 策略，支持"compact 小药丸 region"。
  - `src-tauri/src/overlay.rs` —— 窗口创建时即按 bounding box 尺寸初始化。
- **架构约束**：保留 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE` 四件套不变；`WS_EX_TRANSPARENT` 仍由 `set_window_interactive` 切换；命中测试通过 region 而非新 flag。
- **风险**：中高。触及前后端 + 改窗口管理模型。Phase 1 spike 是 go/no-go 门，spike 失败则 change 暂停，回到 B4 纯粹版（接受静态点击拦截）或维持现状。
- **下游**：`fix-expand-animation-resizeobserver-feedback`（已归档）的 gate hook 与本 change 正交，迁移后该 hook 仍保留（动画期间仍需冻结测量回写，只是 resize 频率变了）。
