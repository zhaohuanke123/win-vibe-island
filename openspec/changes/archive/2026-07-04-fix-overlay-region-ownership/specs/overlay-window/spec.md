## MODIFIED Requirements

### Requirement: Multi-Layer Rounded Corner Consistency

overlay 圆角的视觉表达与命中区域 MUST (MUST) 按以下分工：视觉层（动画期间平滑变化）= `motion.div` 的 `clipPath`（Framer Motion `animate` 驱动）+ CSS `.overlay__shell` border-radius，这是 overlay 形状的唯一视觉来源；命中层（状态切换时 step 变化）= Win32 `SetWindowRgn`，仅承担点击命中测试，不再承担视觉裁剪。命中 region MUST (MUST) 由 `set_overlay_region` 命令独占管理（详见 `Region Ownership Solely in set_overlay_region`）。`borderRadius` MUST (MUST) 放在 Framer Motion 的 `animate`（不是 `style`）以触发动画回调。视觉层（clip-path + border-radius）MUST (MUST) 用吸附感知的同一逐角圆角值保持一致。命中 region MAY (MAY) 是纯矩形（不需与视觉圆角精确匹配），允许命中区比视觉稍大。

#### Scenario: 吸附顶部

- **WHEN** overlay 吸附到屏幕顶部（`snapPosition === "top"`）
- **THEN** 视觉层（clip-path + border-radius）MUST 用「顶平底圆」值（`0px 0px ${r}px ${r}px`），否则顶部出现白色 / 非胶囊色边

#### Scenario: 动画期间 region 恒定

- **WHEN** expand / collapse 动画进行中
- **THEN** Win32 region MUST 保持动画开始时设定的值不变（不在每帧重新 `SetWindowRgn`）；视觉层（motion.div width/height + clip-path）自由动画

## ADDED Requirements

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
