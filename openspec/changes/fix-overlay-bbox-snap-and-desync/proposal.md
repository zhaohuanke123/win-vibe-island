## Why

`decouple-overlay-geometry`（B4-Lite）落地后，动画流畅度明显改善（用户反馈"动画优化了很多"），但暴露了两个 bug：

1. **吸附位置偏移（确定性）**：拖到屏幕顶部吸附后，药丸位置偏向一侧，不在屏幕水平中央。在 HiDPI 显示器（scale ≠ 1.0）上尤其明显。同时 bottom snap（拖到底部吸附）完全失效。
2. **视觉与内容状态偶发错位（间歇性）**：偶发"药丸形状还在，但内容已展开" —— motion.div 卡在 compact 尺寸，AnimatePresence 已挂载展开面板。

两者都是 B4-Lite 把 HWND 从"motion.div 尺寸"撑到"600×720 bbox"后，**既有代码仍假设 HWND = 可见尺寸** 而暴露的潜在缺陷。Bug 2 根因已锁定（双重 DPI 缩放 + 边缘检测用 HWND 高度），Bug 1 根因待诊断。本 change 先记录两个 bug 的现象与已知根因，再分阶段修复。

## What Changes

### Bug 2 — 吸附几何（根因清楚，确定性修复）

- **修 `smart_snap_overlay` 的物理/逻辑像素混淆**（[commands.rs:1151-1152](src-tauri/src/commands.rs:1151)）：`outer_size()` 已返回物理像素，但代码把 `phys_height` 又乘了一遍 `scale`（且 `phys_width` 没乘，本身就不一致）；传给 `calculate_snap_position` 时它内部又乘 `dpi_scale` → 双重缩放。修法：统一传**逻辑像素**给 `calculate_snap_position`（它内部负责 scale）。
- **修 `is_near_edge` 的 bottom 检测**（[window_manager.rs:177](src-tauri/src/window_manager.rs:177)）：当前用 HWND 高度判断"HWND 底部是否接近 work.bottom"，但 B4-Lite 下 HWND 720 高、药丸在 HWND 顶部，用户把药丸拖到底部时 HWND 顶部到底部、HWND 底部早已出屏 —— 永远检测不到。改用**药丸屏幕坐标**（前端传入，或后端减去内偏移）判断边缘。

### Bug 1 — 视觉错位（根因待查，先诊断后修）

- **加诊断日志**：在 `AnimatedOverlay` 关键节点（mount / isExpanded 切换 / onAnimationComplete / region 调用）记录 motion.div 的 inline width/height + 当前 isExpanded + 时间戳，复现时抓数据。
- **基于日志定位根因后再修**。候选假设：Framer Motion 在大 HWND 内 flex 居中下的 layout 异常 / `onUpdate` 移除后缺少的副作用 / measure 反馈环第一帧读到被 clip 的 scrollHeight。
- **若 Bug 2 修复后 Bug 1 不再复现**，则视为同源，关闭 Bug 1。

## Non-Goals

- **不改 B4-Lite 主架构** —— 不回退 motion.div width/height 动画，不改 bounding box 模型。两个 bug 都是局部修复。
- **不改 `calculate_snap_position` 内部公式** —— 它的 `scaled_width = window_width * dpi_scale` 是对的（假设入参是逻辑像素），改的是 caller 传参。
- **不重写拖拽几何** —— 拖拽本身工作正常，只是 snap 检测/定位用错了坐标系。
- **不预判 Bug 1 根因** —— 没有诊断数据前不臆测改实现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `overlay-window`：
  - **ADDED** `Snap Position Calculation Must Use Logical Pixels` —— snap 相关 caller 必须传逻辑像素给 `calculate_snap_position`，禁止传物理像素导致双重缩放。
  - **ADDED** `Snap Edge Detection Must Use Pill Screen Coordinates` —— `is_near_edge` 必须用药丸屏幕坐标（而非 HWND 顶/底）判断是否贴边，以适应 B4-Lite 的 bbox 模型。
  - **ADDED** `Visual State Must Match Content State` —— motion.div 的可见尺寸 MUST 在动画结束后与 `isExpanded` 状态一致；onAnimationComplete 触发时记录的诊断数据用于验证。

## Impact

- **后端**：
  - `src-tauri/src/commands.rs` `smart_snap_overlay` —— 修正 phys_width/phys_height 计算，统一传逻辑像素。
  - `src-tauri/src/window_manager.rs` `is_near_edge` —— 改签名接受药丸屏幕坐标（或HWND 顶 + 内偏移），不再依赖 HWND 高度。
  - 可能需要 `move_overlay_drag` / `smart_snap_overlay` 从前端获取药丸内偏移信息（或在后端硬编码 bbox - compact 推导）。
- **前端**：
  - `frontend/src/components/AnimatedOverlay.tsx` —— 加诊断日志（Bug 1 调查），生产路径保留。
  - 可能需要前端在 snap 调用时传药丸屏幕坐标（若后端命令签名改）。
- **架构约束**：不动 `WS_EX_*` 四件套、不动 HWND 序列化、不动配置治理。
- **风险**：低-中。Bug 2 是数学修正，可单测覆盖；Bug 1 涉及动画时序，需复现验证。
- **下游**：依赖 `decouple-overlay-geometry`（活跃中）的 B4-Lite 成果；本 change 在其归档后或同时归档。

**Test Approach:** TDD (user-selected full TDD mode; auto-detected: math/bounds for snap calc, state transitions for edge detection, timing ordering for visual coherence) — tasks.md is test-first.
