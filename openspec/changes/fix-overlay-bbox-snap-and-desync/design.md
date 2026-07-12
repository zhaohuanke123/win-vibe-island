## Context

`decouple-overlay-geometry` 的 B4-Lite 把 overlay HWND 从"跟随 motion.div 尺寸"改为"恒定 600×720 bounding box"。动画流畅度达成（用户确认"动画优化了很多"），但暴露了两个 bug。两者都不是 B4-Lite 新引入的逻辑错误，而是**既有代码假设 "HWND = 可见 motion.div 尺寸"**，在 HWND 变大后失真。

## Goals / Non-Goals

**Goals:**
- Bug 2（吸附）：HiDPI 下 top snap 后药丸水平居中；bottom snap 检测恢复工作。
- Bug 1（视觉错位）：用诊断数据定位根因，再修；若修 Bug 2 后消失则同源关闭。
- 不回退 B4-Lite 主架构。

**Non-Goals:**
- 不改 B4-Lite 的 bbox 推导、motion.div 动画本体。
- 不重构拖拽几何（拖拽本身正常）。
- 不预判 Bug 1 根因。

## Decisions

### Decision 1: Bug 2 修法 —— 统一传逻辑像素给 `calculate_snap_position`

**选择**：在 `smart_snap_overlay` 中把 `outer_size()`（物理像素）换算为逻辑像素后再传给 `calculate_snap_position`（它内部 `scaled_width = window_width * dpi_scale` 假设入参是逻辑像素）。

**根因数学**：

```
scale=1.5：bbox 600 logical = 900 physical
  当前代码：phys_width = 900（outer_size 直接取）
           传给 calculate_snap_position(900, ...)
           内部：scaled_width = 900 * 1.5 = 1350 ❌（应等于 900 physical）
           center_x = work.cx - 675
  HWND 在 work.cx - 675，pill 在 HWND + (182*1.5)=273 physical
  → pill 中心 = work.cx - 675 + 273 + 236*1.5/2 = work.cx - 402 + 177 = work.cx - 225
  偏左 225px ❌

修后：css_width = 900 / 1.5 = 600
      传给 calculate_snap_position(600, ...)
      内部：scaled_width = 600 * 1.5 = 900 ✓
      center_x = work.cx - 450
      HWND 在 work.cx - 450，pill 在 HWND + 273 = work.cx - 177
      pill 中心 = work.cx - 177 + 177 = work.cx ✓
```

**候选方案**：

| 方案 | 机制 | 取舍 |
|---|---|---|
| **A. caller 传逻辑像素** ⭐ | smart_snap 把 outer_size / scale 转逻辑后传入 | ✅ 选：caller 改一行，calculate_snap_position 内部不动 |
| B. calculate_snap 接受物理像素 | 改 calculate_snap 不再内部 scale | 改动面大，要改所有 caller + is_near_edge |
| C. 在 calculate_snap 检测并去重 | 内部判断是否已物理 | 黑魔法，难维护 |

**额外问题**：当前代码 `phys_width = size.width`（不乘 scale）vs `phys_height = size.height * scale`（乘了），**本身就不一致**。修时统一为逻辑像素后，width/height 一致。

### Decision 2: Bug 2 bottom snap —— 改用 pill 屏幕坐标判断边缘

**选择**：`is_near_edge` 改签名，接受药丸屏幕坐标（pill_top_y, pill_bottom_y, probe_x, probe_y）而非 HWND y + HWND height。caller（`smart_snap_overlay`）从 HWND 顶 + bbox - compact 推导 pill 位置（或前端直接传入）。

**根因**：

```
B4-Lite：HWND 高 720，pill 在 HWND y=0
  用户拖 pill 到屏幕底部 → HWND top 也到底（pill 在 HWND 顶部）
  当前 is_near_edge：检查 HWND 底部 = y + 720 是否接近 work.bottom
  但 HWND top = y 已经在 work.bottom 附近，y + 720 早超出屏幕
  → 检测失败 ❌

修后：检查 pill 底部 = pill_top_y + pill_height 是否接近 work.bottom
  pill_top_y = HWND top（flex-start）+ 0 = HWND top
  pill_height = barHeight（52）
  pill 拖到底时 pill_top_y ≈ work.bottom - 52
  → work.bottom - 52 - y ≈ 0，触发 ✓
```

**caller 推导 pill 坐标的方式**：
- pill_offset_y_within_hwnd = 0（`#root align-items: flex-start`）
- pill_height_logical = config.ui.dimensions.barHeight
- pill_top_y_physical = HWND_outer_position.y + 0 * dpi_scale
- pill_bottom_y_physical = pill_top_y_physical + barHeight * dpi_scale

简单，无需前端传参。

### Decision 3: Bug 1 调查 —— 加诊断日志，复现抓数据

**选择**：先在 `AnimatedOverlay` 的关键节点加结构化日志（生产可保留，trace 级别），用户复现时收集数据，再决定修法。

**日志点**：
- `mount`：bbox dims、compact dims、初始 region
- `isExpanded` 切换：旧值 → 新值、目标 dimensions
- `onAnimationComplete`：触发时 motion.div 的 `offsetWidth/offsetHeight`、当前 isExpanded、传给 set_overlay_region 的 rect
- `useAnimationGatedMeasure` gate 状态变化

**抓数据方式**：用户复现时打开 DevTools 控制台，看 `[AO-DIAG]` 系列日志。如果 motion.div 的 offsetWidth/Height 与目标 dimensions 不一致 → 动画未完成；如果一致但视觉仍小 → CSS 渲染问题。

**候选根因假设**（按概率排序）：

| 假设 | 验证方式 |
|---|---|
| A. measure 反馈环第一帧读到被 clip 的 panel scrollHeight | 日志看 measure 的 next 值 vs 预期 |
| B. Framer Motion 在大 HWND 内 flex 居中下 layout 异常 | 日志看 motion.div offsetWidth 在 onAnimationComplete 时 |
| C. `onUpdate` 移除后缺少某个驱动 motion.div 重渲染的副作用 | 加回 onUpdate（仅日志，不调 invoke）看是否复现 |
| D. region 调用与动画完成的时序 race | 日志看 region rect 在不同时间点的值 |

**Decision 3 取舍**：用户可能觉得"先加日志再修"绕远，但 Bug 1 复现不稳定，盲改实现风险高（可能改错地方，或破坏 change C 的 gate hook）。日志是低成本投资。

### Decision 4: Bug 2 优先于 Bug 1

**选择**：tasks.md 把 Bug 2 修复列为 Phase 1（确定性强），Bug 1 诊断+修复列为 Phase 2（依赖数据）。修完 Bug 2 后让用户重测 Bug 1 是否复现。

**理由**：Bug 2 是数学错误，单测能精确覆盖；Bug 1 涉及动画时序，盲改成本高。且两者可能共享底层（bbox 几何 + 旧代码假设），修 Bug 2 时可能顺带发现 Bug 1 线索。

## Risks / Trade-offs

- **[风险] Bug 2 修复改变 snap 行为**：用户已习惯当前偏移后的位置（虽然错），修后位置变化。→ 缓解：修后位置更正确（药丸真的居中），用户应感到改善而非回退。
- **[风险] is_near_edge 改签名影响其他 caller**：检查了，只 `smart_snap_overlay` 一处调用。→ 缓解：单测覆盖。
- **[风险] Bug 1 诊断日志在生产拖性能**：→ 缓解：用 `import.meta.env.DEV` 包裹，生产构建零成本；或用 `log.trace` 级别（默认不输出）。
- **[权衡] Bug 1 可能永不复现或难抓**：→ 接受不确定性；若修 Bug 2 后稳定消失，视为同源；若仍偶发，凭日志定位。
- **[风险] caller 推导 pill 坐标耦合 bbox - compact 计算**：→ 缓解：后端硬编码 `barHeight` 来源同 config 治理；或前端在 snap 调用时传 pill rect（更解耦，但改前端代码）。

## 对硬约束的影响（.claude/rules/）

- **ArchitectureConstraints.md**：不动 `WS_EX_*` 四件套、不动 HWND 序列化、不动配置治理、不动条件编译。✅
- **TauriIPCConvention.md**：若改 `is_near_edge` 签名，是后端内部函数（非 IPC 命令），不影响前端契约；`smart_snap_overlay` IPC payload 不变。✅
- **RustConvention.md**：改后端函数遵循命名 + 条件编译 + 错误处理规范。✅
- **FrontendConvention.md**：诊断日志走 `logger` 而非裸 `console.log`（生产路径）。✅
- **ErrorHandlingConvention.md**：IPC 错误用 `Result<T, String>` + 结构化日志。✅

## Migration Plan

**Phase 1 — Bug 2 修复（确定性）**
1. 改 `smart_snap_overlay` 传逻辑像素。
2. 改 `is_near_edge` 接受 pill 屏幕坐标 + 改 `smart_snap_overlay` caller 适配。
3. 单测覆盖：calculate_snap_position 在不同 scale 下的中心点 + is_near_edge top/bottom 触发条件。
4. 手动验证：HiDPI 下 top snap 药丸居中；bottom snap 检测恢复。

**Phase 2 — Bug 1 诊断**
5. 加诊断日志（trace 级别或 DEV-only）。
6. 用户复现抓数据。
7. 根据日志定位根因，写针对性修复（Phase 3）或关闭同源。

**回滚**：纯函数级改动，`git revert` 即可。

## Open Questions

- Bug 2 修复后 Bug 1 是否复现？需用户验证。
- `is_near_edge` 改签名是否值得做成 IPC（让前端传 pill 实时坐标）？当前选择后端推导（解耦前端），但如果 B4-Lite 后 bbox - compact 偏移逻辑改了，后端推导要同步。
- Bug 1 诊断日志的级别：`trace`（默认隐藏）还是 `info`（生产可见）？倾向 trace + DEV-only 双保险。
