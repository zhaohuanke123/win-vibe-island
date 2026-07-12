## Why

展开/收起动画在 Tauri 运行时会"有些卡顿"，而浏览器里流畅。根因之一是 `Overlay.tsx` 的自适应高度测量（`ResizeObserver`）与 `AnimatedOverlay` 的尺寸动画形成反馈环：动画飞行中 `measure()` 反复 `setMeasuredHeight`，导致 Framer Motion 在动画进行中不断重写目标值、重新规划弹簧轨迹，肉眼表现为"抖一下、顿一下"。该反馈环由 `f88fb41`（2026-05-03）为修复 session 列表被裁切 bug 引入，当时只关注"测得准不准"，未识别出对动画的副作用。本 change 用最小改动拆掉反馈环，是 5 个候选方向中 ROI 最高的（改动 < 30 行，几乎无副作用）。

## What Changes

- 在 `frontend/src/components/Overlay.tsx` 的 measure 闭包中加入动画状态 gate：动画飞行期间（`isOverlayExpanded` 切换中）不调用 `setMeasuredHeight`，避免触发 React re-render 重写动画目标。
- 动画结束时（`AnimatedOverlay` 的 `onAnimationComplete`）释放 gate，主动触发一次测量，切回自适应高度。
- 测量结果作为下一次展开的目标值缓存（首次展开用 `EXPANDED_MIN` 兜底），保证首次展开仍有合理高度。
- **不改动** `update_overlay_size` IPC、`SetWindowRgn` 圆角、`SIZE_SYNC_THROTTLE_MS`、窗口管理架构 —— 这些属于方向 A/B/D，本 change 不碰。

## Non-Goals

- **不解决** 每帧 `SetWindowRgn(redraw=TRUE)` + `set_size` 的 Win32 开销（方向 A/B 的范围）。
- **不调整** `SIZE_SYNC_THROTTLE_MS`（方向 D，且 spec 固化为不变量）。
- **不改** 窗口管理架构（方向 B 的"固定 bounding box + 内部 clip"是更大的后续 change）。
- **不改** 审批专注模式（`isApprovalFocusMode`）的尺寸逻辑 —— 它使用固定 `APPROVAL_FOCUS_HEIGHT`，不经过自适应测量路径。
- **不优化** width/height 动画本身的 layout 开销。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `overlay-window`: 新增"自适应高度测量与动画解耦"不变量 —— 展开动画飞行中禁止测量结果回写动画目标，动画结束才切回 adaptive。原 spec 只约束了 IPC 节流和多层圆角一致性，未覆盖测量与动画的交互。

## Impact

- **代码**：`frontend/src/components/Overlay.tsx`（measure effect、panelRef 测量闭包、新增 `isAnimatingRef` 与 `onAnimationComplete` 回调接线）；可能微调 `frontend/src/components/AnimatedOverlay.tsx` 暴露 `onAnimationComplete` 透传（当前已存在，但需确认 `overlayExpandedHeight` 变更时仍触发）。
- **配置**：无新增配置；`overlayLayout.panelMaxHeights` / `expandedMinHeight` / `expandedMaxHeight` 行为不变。
- **测试**：新增单元测试覆盖"动画期间 setMeasuredHeight 被冻结""动画结束触发一次测量""首次展开使用 EXPANDED_MIN 兜底"。
- **风险**：若 gate 窗口设置不当（如审批场景 `isApprovalFocusMode` 切换时机错位），可能出现展开后高度停留在 `EXPANDED_MIN`；通过 `onAnimationComplete` 必触发一次测量 + `requestAnimationFrame` 二次保险缓解。
- **下游兼容**：不影响 `update_overlay_size` IPC 契约、不动 spec 现有 Requirement，仅新增一条。
