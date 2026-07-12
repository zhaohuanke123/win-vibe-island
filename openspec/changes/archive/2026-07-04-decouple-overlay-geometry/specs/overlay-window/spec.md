## MODIFIED Requirements

### Requirement: Overlay Size Update Throttling

`update_overlay_size` MUST (MUST) 以"离散调用"模式工作 —— 仅在动画完成（`onAnimationComplete`）端点和状态切换时调用，MUST NOT (MUST NOT) 在 Framer Motion `onUpdate` 中每帧调用。bounding box 尺寸由配置派生且在正常使用中恒定（详见 `Fixed Bounding Box Window Geometry`），因此端点调用实际是 no-op（尺寸未变）。

后端 MUST (MUST) 用 `AtomicU64` 缓存 `(width, height, radius, snap)` 组合避免重复 `SetWindowPos` / `SetWindowRgn`；前端 MUST NOT (MUST NOT) 在 `onUpdate` 回调中触发 `update_overlay_size`。

#### Scenario: 动画期间不调用 update_overlay_size

- **WHEN** expand / collapse 动画的 `onUpdate` 每帧触发
- **THEN** 前端 MUST NOT 调用 `update_overlay_size`；MUST 只在 `onAnimationComplete` 端点调用

#### Scenario: bounding box 未变时的 no-op

- **WHEN** `onAnimationComplete` 端点调用传入的 `(width, height)` 与后端缓存一致（bounding box 恒定下的常态）
- **THEN** 后端 MUST 提前 return，不触发 `SetWindowPos` 或 `SetWindowRgn`

### Requirement: Multi-Layer Rounded Corner Consistency

overlay 圆角由多层独立裁剪机制共同决定（Win32 `SetWindowRgn`、Framer Motion `borderRadius`、`motion.div` `clipPath`、CSS `.overlay__shell` border-radius），所有层 MUST (MUST) 用吸附感知的同一逐角圆角值保持一致；`borderRadius` MUST (MUST) 放在 Framer Motion 的 `animate`（不是 `style`）以触发动画回调。

#### Scenario: 吸附顶部

- **WHEN** overlay 吸附到屏幕顶部（`snapPosition === "top"`）
- **THEN** 所有裁剪层 MUST 用「顶平底圆」值（`0px 0px ${r}px ${r}px`），否则顶部出现白色 / 非胶囊色边

#### Scenario: 动画期间 region 恒定

- **WHEN** expand / collapse 动画进行中
- **THEN** Win32 region MUST 保持动画开始时设定的值不变（不在每帧重新 `SetWindowRgn`）；视觉层（motion.div width/height + border-radius）自由动画

## ADDED Requirements

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
