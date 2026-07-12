## Context

`fix-expand-animation-resizeobserver-feedback`（已归档）拆掉了 React 测量反馈环，但动画卡顿的另一半根因仍在：**每帧 Win32 调用**。

当前数据流（`AnimatedOverlay.tsx:189-198`）：
```
Framer Motion onUpdate (每帧 ~60Hz)
   → invoke("update_overlay_size")
      → window.set_size()                     [SetWindowPos]
      → apply_snap_aware_round_region()       [CreateRoundRectRgn + SetWindowRgn(redraw=TRUE)]
      → window.set_position()                 [又一次 SetWindowPos]
```

300ms expand 动画 ≈ 18 次完整循环。其中 `SetWindowRgn(BOOL(1))`（redraw=TRUE）在 `WS_EX_LAYERED` 透明窗口上强制 DWM 立即重新裁剪 + 重绘 —— 这是 Win32 最昂贵的操作之一，是肉眼卡顿的主要贡献者。

`SIZE_SYNC_THROTTLE_MS = 16` 的节流等于一帧，实际无节流效果。`LAST_REGION_KEY` 缓存按 `(w,h,radius,snap)` 索引，动画期间 w/h 每帧变化，缓存永远 miss。

**前置事实**（explorer 阶段确认）：
- `set_window_interactive` 是 `WS_EX_TRANSPARENT` 整窗位切换（[overlay.rs:196](src-tauri/src/overlay.rs:196)），二元，非逐像素。
- 全仓无 `WM_NCHITTEST` / `HTTRANSPARENT` 处理 —— 逐像素命中测试是新地面。
- `WS_EX_LAYERED + TRANSPARENT + TOPMOST + NOACTIVATE` 四件套从 initial commit 起未变，是 Dynamic Island 视觉的承载基础，不动。

## Goals / Non-Goals

**Goals:**
- 把 `update_overlay_size` 调用频率从 ~60Hz 降到 ≤2Hz（动画端点各 1 次 + 状态切换时 region 更新）。
- compact 态下，bounding box 中"看不见"的区域 MUST 点击穿透到下层窗口（消除 B4 静态点击拦截痛点）。
- 视觉动画流畅度达到浏览器里看到的水准（GPU 合成 clip-path）。
- 保留现有产品行为：自由拖拽、顶/底吸附、审批专注模式、自适应展开高度。
- 通过 sandbox spike 在全量迁移前 de-risk。

**Non-Goals:**
- 不实现 `WM_NCHITTEST` / WndProc subclass（B3）。
- 不改配置治理映射、不动 Rust ↔ 前端双默认值。
- 不做多显示器跨屏特判。
- 不保留旧每帧同步路径（无 feature flag）。

## Decisions

### Decision 1: B4-Lite（HWND 恒定 bbox + motion.div 保留 width/height 动画 + 删除每帧 resize）

**选择**：HWND 启动即设为 `box = max(所有状态尺寸)`，正常使用中尺寸恒定。`AnimatedOverlay` 的 `motion.div` **保留现有 Framer Motion width/height 动画**（视觉模型不变），但**删除 `onUpdate` 回调里的 `syncWindowSize`** —— HWND 不再跟随每帧 resize。`update_overlay_size` 仅在 `onAnimationComplete` 端点调用一次（且因 HWND 未变，后端走缓存 no-op）。状态切换 + 动画完成时调 `set_overlay_region` 更新命中 region。

**候选方案对比**（实现期重新评估）：

| 方案 | HWND 行为 | motion.div 动画 | WebView 每帧 layout | 子组件重构 | Win32 调用频率 | 取舍 |
|---|---|---|---|---|---|---|
| **B4-Lite** ⭐ | 恒定 max | width/height（保留） | 有（与现状同） | 无 | ≤2 次/动画 | ✅ 选 |
| 完整 B4（clip-path） | 恒定 max | clip-path（GPU 合成） | 无 | 大重构 | ≤2 次/动画 | 子组件布局模型要重写 ❌ |
| 现状（每帧 resize） | 跟随视觉 | width/height | 有 | — | ~18 次/动画 | 当前卡顿 |
| A 冻结 start | 冻结 | width/height 被 HWND 裁 | 有 | — | 0 | expand 内容不可见 ❌ |
| B3 HTTRANSPARENT | 恒定 max | width/height | 有 | — | 0 + 命中回调 | WndProc subclass 风险高 |

**为什么从完整 B4 改为 B4-Lite**：实现期发现完整 B4 要求 Overlay 子组件（NotchRow、bar、panel）从"响应父级当前尺寸"改为"按 bbox 绝对定位 + clip-path 切片显隐"——这是 1-2 天的视觉重构，且浏览器测试已证明 WebView 内部 width/height 动画本身不是瓶颈（浏览器流畅 = 无 Win32 开销，width/height 动画 GPU/合成层足够快）。B4-Lite 用最小改动消除主因（每帧 Win32 resize），保留现有视觉/布局。

**预期效果**：消除每帧 `SetWindowRgn(redraw=TRUE)` + `set_size` + `set_position`（最大头的开销）。WebView 内部 layout 仍在，但与浏览器同档。理论结果：Tauri 流畅度接近浏览器。

### Decision 2: B1 region 命中测试（compact 态 region 缩到药丸形）

**选择**：保留并扩展 `apply_snap_aware_round_region`，让它根据状态切换 region：
- compact 态：region = 药丸矩形（小，居中于 box 顶部）
- expanded / approval 态：region = 全 box（含圆角）
- region 仅在状态切换时调用（每秒 ≤1-2 次）

**候选方案对比**：

| 方案 | 命中测试机制 | compact 态空白穿透 | 实现成本 | 取舍 |
|---|---|---|---|---|
| **B1 region** ⭐ | `SetWindowRgn` 状态切换 | ✅ 穿透 | 中（复用现有 region 代码） | ✅ 选 |
| 纯 B4（无 region） | 整窗 `WS_EX_TRANSPARENT` 二元 | ❌ 空白拦截 | 小 | 静态痛点 ❌ |
| B3 HTTRANSPARENT | `WM_NCHITTEST` 逐像素 | ✅ 穿透 | 大（WndProc subclass） | 风险高 |
| B2 CSS pointer-events | DOM 路由 | ❌ HWND 仍拦截 | — | 物理不可行 ❌ |

**为什么选 B1**：用户在 explorer 阶段确认"纯 B4 的静态点击拦截（compact 态下方 ~600×668 隐形 HWND）是日常痛点"。B1 用现有 region 代码路径解决，无 Win32 黑客。region 频率从每帧降到每秒 1-2 次后，`SetWindowRgn` 的单次开销可接受。

### Decision 3: motion.div 在 bbox 内由现有 flex 居中（视觉与现状一致）

**选择**：`#root` 现有 `align-items: center` 让 motion.div 在 bbox HWND 内居中。anchorCenter 仍以 HWND 中心为屏幕锚 —— motion.div 中心 = HWND 中心 = 屏幕锚。compact 时小药丸居中，expand 时整 box 居中，**视觉与现状一致**。

**与完整 B4 的区别**：完整 B4 把药丸钉在 bbox 顶部（向下延伸），需要重写子组件布局。B4-Lite 不改布局，沿用 flex 居中。

**代价**：compact 态 bbox 下方/上方有大量"看不见但 HWND 存在"的区域 —— 由 D2 的 region 解决（compact 态 region 缩到 motion.div 当前位置 + 尺寸，其余穿透）。

### Decision 4: Spike 先行（Phase 1 在 sandbox 验证后再迁移）

**选择**：Phase 1 在 `?sandbox=geometry` 做最小原型，验证 4 个未知：
1. WebView2 上 Framer Motion `clip-path` spring 动画是否真流畅（理论是 GPU 合成，实测）。
2. `SetWindowRgn` 仅状态切换时调用，单次开销在用户感知阈值下（实测命令耗时 + 主观数）。
3. compact 态 region = 药丸矩形时，点击精准穿透（实测点药丸 vs 点空白）。
4. bounding box 位置模型 + 拖拽/吸附几何正确（pill 屏幕坐标推导）。

**为什么 spike 而非直接迁移**：本 change 触及前后端 + 改窗口管理模型，是中等风险。spike 1-2 小时成本，失败则回到 B4 纯粹版（接受静态点击拦截）或暂停。Spike 在 `GeometrySandbox.tsx` 内新增 `?sandbox=bbox-spike` 模式，不动主 Overlay.tsx，原型代码可弃。

### Decision 5: Bounding box 从 config 派生，不新增配置项

**选择**：
```
box.width  = max(compactWidth, expandedWidth, approvalFocusWidth)
box.height = max(barHeight, expandedMaxHeight, approvalFocusHeight,
                 panelMaxHeights.sessionList, panelMaxHeights.sessionDetail)
```
全部从 `frontend/src/store/config.ts` 现有字段算，无新配置。配置变更时重算 + 一次 resize。

**为什么不新增配置**：bounding box 是派生不变量，给它独立配置会引入"box < 某状态尺寸"的不一致风险。配置治理（双默认值）也不必触动。

## Risks / Trade-offs

- **[风险] WebView2 clip-path 动画实际不流畅** → 缓解：Phase 1 spike 是 go/no-go 门；失败则 change 暂停或回退。spike 中若发现特定 clip-path 形状（如 `inset()` 带 `round`）性能差，可降级为 transform scale + opacity（牺牲精确形状）。
- **[风险] region 与 clip-path 形状不完全重合，出现"看得见点不到"或"点得到看不见"鬼影** → 缓解：region 用稍大于 clip-path 的包围矩形（保守扩大 1-2px），宁可"点得到看不见"也不要"看得见点不到"。
- **[风险] 拖拽期间 HWND 大尺寸带来吸附计算错误** → 缓解：吸附检测用"pill 屏幕坐标"而非 HWND 左上角；pill 坐标 = HWND 位置 + 内偏移。Phase 1 spike 验证。
- **[风险] bounding box 跨屏（pill 在主屏边缘，box 延伸到副屏）** → 缓解：OS 自然裁剪 box 超出部分；region 仍只覆盖 pill 形，副屏无点击拦截。沿用当前跨屏行为，不特判。
- **[权衡] region 仍是 `SetWindowRgn`，只是频率降低** —— 单次 `SetWindowRgn(redraw=TRUE)` 在大 region 上仍可能 ~5-15ms。状态切换时（非动画中）用户可接受。
- **[权衡] bounding box 占用屏幕空间** —— compact 态虽然 region 缩到 pill，但 HWND 仍是 600×720，影响 Alt+Tab 预览、截屏选区等基于 HWND 的工具。需 spike 中实测此类副作用。
- **[权衡] spike 代码丢弃成本** —— Phase 1 原型若失败，1-2 小时沉没，可接受。

## 对硬约束的影响（.claude/rules/）

- **ArchitectureConstraints.md**：
  - `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE` 四件套保留不变 ✅
  - `WS_EX_TRANSPARENT` 仍由 `set_overlay_interactive` 切换（不改 hit-test 机制，hit-test 走 region）✅
  - HWND 序列化、条件编译、主窗口透明、Hook 非破坏性、审批 tool_use_id 关联 —— 均不动 ✅
  - **配置治理（第 6 条）**：bounding box 从现有字段派生，**不新增也不修改任何双默认值**，无需 `config-sync.js` 改动 ✅
- **TauriIPCConvention.md**：`update_overlay_size` 命名与 payload 兼容（仅调用频率变化）；可能新增 `set_overlay_region` 命令承载状态切换时的 region 更新，命名遵循 snake_case + 注册流程。
- **FrontendConvention.md**：符合 —— 组件用 Framer Motion + clip-path，BEM 不变，hook 封装 invoke。
- **RustConvention.md**：符合 —— 条件编译保留，新命令走 `#[tauri::command]` + `generate_handler!` 注册。
- **ErrorHandlingConvention.md**：新增 IPC 走 `Result<T, String>` + 结构化日志。

## Migration Plan

**Phase 1 — Spike（go/no-go 门，1-2 小时）**
1. 在 `GeometrySandbox.tsx` 加 `?sandbox=bbox-spike` 模式。
2. 原型：固定 600×720 motion.div + clip-path spring 动画；端点调用 `update_overlay_size`；状态切换 `SetWindowRgn`。
3. 验证 4 个未知（Decision 4 列表）。
4. **门条件**：clip-path 动画主观流畅 + region 命中精准 + 拖拽几何正确。失败则 change 暂停。

**Phase 2 — 全量迁移（spike 通过后）**
1. 后端：新增/调整 region 命令；`update_overlay_size` 适配端点调用语义。
2. 前端：`AnimatedOverlay` 重写为固定尺寸 + clip-path；`Overlay` 加 bounding box 推导 + pill 内偏移 + 拖拽几何重算。
3. 移除 `onUpdate` 每帧同步路径（干净切换）。
4. 单元测试覆盖：bounding box 推导、pill 内偏移、region 状态切换、clip-path 关键帧。

**Phase 3 — 验证 + 归档**
1. 全套自动验证：lint / build / test / config-sync --strict / openspec validate。
2. 手动验证：真实 Tauri 运行展开/收起动画主观流畅度 + compact 态点击穿透正确性 + 拖拽/吸附几何。
3. 通过后 `/opsx:archive`。

**回滚策略**：Phase 1 失败 → 不进 Phase 2，spike 代码丢弃，无生产影响。Phase 2 中途发现问题 → `git revert` 迁移 commit，回到 `fix-expand-animation-resizeobserver-feedback` 后的状态。

## Open Questions

- **clip-path 形状选择**：`inset(0 round r)`（圆角矩形）vs 多边形精确药丸形？spike 中比较性能与视觉。
- **region 是否需要圆角**：`SetWindowRgn` 支持圆角矩形（`CreateRoundRectRgn`），但命中测试用矩形更廉价。compact 态 region 用纯矩形（点击边界 = 矩形）还是圆角矩形（与视觉严格一致）？倾向矩形（1-2px 误差可接受）。
- **animation duration 调整**：clip-path 动画的感知时长可能与 width/height 不同，spike 后可能需要微调 `SPRING_CONFIG.expand/collapse`。
- **审批专注模式 region**：approval 是固定 600×720，与 bounding box 重合，region = 全 box。是否在 approval 期间临时把 HWND 收缩到 600×720（若 bounding box 更大）？倾向不收缩（保持 HWND 恒定原则）。
