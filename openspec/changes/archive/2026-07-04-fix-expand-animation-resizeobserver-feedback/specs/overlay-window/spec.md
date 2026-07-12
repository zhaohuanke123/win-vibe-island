## ADDED Requirements

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
