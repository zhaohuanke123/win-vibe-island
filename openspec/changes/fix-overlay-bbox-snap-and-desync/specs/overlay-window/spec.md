## ADDED Requirements

### Requirement: Snap Position Calculation Must Use Logical Pixels

`smart_snap_overlay` 与其他 snap 相关 caller MUST (MUST) 传**逻辑像素**给 `calculate_snap_position`（其内部 `scaled_width = window_width * dpi_scale` 假设入参为逻辑像素）。MUST NOT (MUST NOT) 直接传 `outer_size()` 的物理像素，否则会双重缩放导致 HWND 中心点计算错误。`outer_size()` 返回的物理像素 MUST (MUST) 先除以 `scale_factor()` 换算为逻辑像素。

#### Scenario: scale 1.5 下 top snap 后药丸水平居中

- **WHEN** overlay 在 DPI scale=1.5 的显示器上，HWND 为 600×720 bbox（900×1080 physical），用户拖动后触发 top snap
- **THEN** `smart_snap_overlay` MUST 传逻辑像素 600 给 `calculate_snap_position`；`calculate_snap_position` 内部 scaled_width = 900；HWND 中心 MUST 落在 work area 水平中央；可见药丸（在 bbox 顶部居中）MUST 也在 work area 水平中央，不偏移

#### Scenario: scale 1.0 下行为不变

- **WHEN** overlay 在 DPI scale=1.0 显示器上触发 top snap
- **THEN** 药丸水平位置 MUST 与修复前一致（scale=1.0 双重缩放巧合正确，修后仍正确）

### Requirement: Snap Edge Detection Must Use Pill Screen Coordinates

`is_near_edge` MUST (MUST) 用**药丸的屏幕坐标**（pill_top_y / pill_bottom_y）判断是否接近 work area 顶/底边，MUST NOT (MUST NOT) 用 HWND 顶 + HWND 高度推断。因为 B4-Lite 下 HWND 是 bounding box（远大于可见药丸），HWND 底部远在屏幕外，用 HWND 高度检测 bottom snap 会永久失效。caller（`smart_snap_overlay`）MUST (MUST) 推导药丸屏幕坐标：`pill_top_y = HWND_outer_position.y + pill_offset_y_within_hwnd * dpi_scale`，`pill_bottom_y = pill_top_y + barHeight * dpi_scale`。

#### Scenario: 拖药丸到屏幕底部触发 bottom snap

- **WHEN** B4-Lite 下用户把 overlay 拖到屏幕底部，使药丸（在 HWND 顶部）的 pill_bottom_y 接近 work.bottom
- **THEN** `is_near_edge` MUST 检测到 bottom snap 条件成立（|work.bottom - pill_bottom_y| ≤ SNAP_THRESHOLD）；MUST 返回 `Some(SnapPosition::Bottom)`

#### Scenario: 拖药丸到屏幕顶部仍触发 top snap

- **WHEN** 用户把 overlay 拖到屏幕顶部，使 pill_top_y 接近 work.top
- **THEN** `is_near_edge` MUST 检测到 top snap 条件成立；行为与修复前一致

#### Scenario: HWND 中部不影响边缘检测

- **WHEN** B4-Lite 下 HWND 底部（= pill_top_y + 720*dpi）已超出 work.bottom，但 pill_top_y 仍在屏幕中部
- **THEN** `is_near_edge` MUST NOT 因为 HWND 底部出屏而误判 bottom snap

### Requirement: Visual State Must Match Content State

`AnimatedOverlay` 的 `motion.div` 可见尺寸 MUST (MUST) 在动画结束后与 `isExpanded` 状态一致：`isExpanded === true` 时 motion.div 的 `offsetWidth/offsetHeight` MUST 接近（±2px 内）目标 `expandedDim`；`isExpanded === false` 时 MUST 接近 `OVERLAY_DIMENSIONS.compact`。`onAnimationComplete` 触发时 MUST (MUST) 记录 motion.div 当前 offset 尺寸 + 目标 dimensions + isExpanded 到诊断日志（DEV 模式或 trace 级别），用于验证一致性与诊断错位 bug。

#### Scenario: expand 动画完成后 motion.div 尺寸到位

- **WHEN** 用户触发展开（isExpanded: false → true），expand 动画的 onAnimationComplete 触发
- **THEN** motion.div 的 offsetWidth/offsetHeight MUST 在 expandedDim 目标值的 ±2px 范围内；诊断日志 MUST 记录该一致性

#### Scenario: compact 动画完成后 motion.div 尺寸到位

- **WHEN** 用户触发收起（isExpanded: true → false），collapse 动画的 onAnimationComplete 触发
- **THEN** motion.div 的 offsetWidth/offsetHeight MUST 在 compact dim 目标值的 ±2px 范围内

#### Scenario: 诊断日志不污染生产

- **WHEN** 应用以生产模式构建（`import.meta.env.DEV === false`）
- **THEN** 诊断日志 MUST NOT 产生运行时开销（被构建时剥离或走默认不输出的 trace 级别）
