## Context

`Overlay.tsx` 当前用 `ResizeObserver` + `measure()` 在展开期间持续测量 panel 内容高度，结果通过 `setMeasuredHeight` 写入 React state，再经 `overlayExpandedHeight` 透传到 `AnimatedOverlay` 作为 Framer Motion 的 `animate.height` 目标。

```
Framer Motion 动画进行中
   │  同时 AnimatePresence 挂载 panel 子树
   ▼
ResizeObserver 触发 → measure() 读 offsetHeight/scrollHeight
   │
   └─→ setMeasuredHeight(next)
          │
          └─→ overlayExpandedHeight 变更 → AnimatedOverlay 重渲染
                 │
                 └─→ motion.div animate.height 目标在飞行中被改写
                        │
                        └─→ Framer Motion 重新规划弹簧轨迹 → 肉眼抖动
                               │
                               └─→ ResizeObserver 再次触发（循环）
```

该环路由 commit `f88fb41`（2026-05-03，"fix: use ResizeObserver for overlay height measurement"）引入 —— 当时的动机是修复双 rAF 方案测不到宽度动画稳定后 panel 高度导致的 session 列表裁切 bug。修复正确，但未识别对动画的副作用。

**当前关键代码位置**：
- `frontend/src/components/Overlay.tsx:340-391` — measure effect + ResizeObserver
- `frontend/src/components/Overlay.tsx:170` — `const [measuredHeight, setMeasuredHeight] = useState(EXPANDED_MIN)`
- `frontend/src/components/Overlay.tsx:299-303` — `overlayExpandedHeight` 计算与透传
- `frontend/src/components/AnimatedOverlay.tsx:189-201` — `onUpdate` / `onAnimationComplete`（当前 `onAnimationComplete` 仅用于 `syncFinalWindowSize`）

## Goals / Non-Goals

**Goals:**
- 消除展开/收起动画飞行中的目标重写，让 Framer Motion 的弹簧轨迹不再被 React re-render 打断。
- 改动局部化 —— 只动 `Overlay.tsx` 的测量 effect 与 `AnimatedOverlay.tsx` 的回调透传，不碰 IPC、窗口管理、配置。
- 保留展开后的"自适应高度"行为（内容变化时窗口仍能动态调整）。
- 改动可被单元测试覆盖（不依赖真实窗口 / Win32）。

**Non-Goals:**
- 不解决每帧 `SetWindowRgn(redraw=TRUE)` + `set_size` 的 Win32 开销（方向 A/B）。
- 不调整 `SIZE_SYNC_THROTTLE_MS`（方向 D）。
- 不改 `isApprovalFocusMode` 固定尺寸路径（不经自适应测量）。
- 不优化 width/height 动画本身的 layout 开销。
- 不改任何 Rust 代码、不动 IPC 契约。

## Decisions

### Decision 1: 采用"动画期间冻结测量回写"（Approach A）

**选择**：在 `Overlay.tsx` 加 `isAnimatingRef`，动画飞行中 `measure()` 提前 return（既不读 layout 也不 setState）；`onAnimationComplete` 释放 gate 并主动触发一次测量。

**候选方案对比**：

| 方案 | 机制 | 优点 | 缺点 | 取舍 |
|---|---|---|---|---|
| **A. 冻结 measure 整体** | `measure()` 入口 early-return | 既省 React re-render 又省 layout 读；最简 | 首次展开目标用 `EXPANDED_MIN` 兜底 | ✅ 选 |
| B. 仅 gate `setMeasuredHeight` | `measure()` 仍读 layout，但不 setState | 测量值"最新" | layout 读仍占帧；对动画无额外帮助 | 不选：成本未降 |
| C. 快照式（snapshot-at-start） | expand 切换时把 `measuredHeight` 快照到 ref，`overlayExpandedHeight` 动画期间读快照 | 动画目标完全稳定 | 引入并行的"冻结目标"数据路径，状态更多 | 不选：复杂度高、收益等同 A |

**为什么选 A**：
- 反馈环的两个副作用（React re-render + layout 读）都被切断，单帧收益最大。
- 改动最局部：只动 `measure()` 闭包和 `AnimatedOverlay` 的 `onAnimationComplete` 透传，无新数据路径。
- 与现有 `onAnimationComplete`（已用于 `syncFinalWindowSize`）天然兼容 —— 同一回调可同时触发"最终窗口尺寸同步"和"解冻测量"。

### Decision 2: 首次展开的初始目标用 `EXPANDED_MIN` 兜底

`measuredHeight` 的 `useState` 初值即 `EXPANDED_MIN`，且 state 跨 collapse/expand 持久化。

- **首次展开**：动画目标 = `EXPANDED_MIN`（窗口先动到最小展开高度），`onAnimationComplete` 后 `measure()` 触发，setMeasuredHeight 写入真实值 → 此时窗口已稳定，再走一次 `update_overlay_size` 同步（无动画，立即对齐）。视觉上：首次展开有一次"先到最小、再补到真实高度"的两阶段感，但**无弹簧抖动**。
- **后续展开**：`measuredHeight` 已是上次测量值（接近正确），动画目标稳定，`onAnimationComplete` 后微调。

**不选"动画启动前同步预测量"的理由**：AnimatePresence 的挂载时序与 `useLayoutEffect` 协调复杂，且首次展开占比极低（每进程一次），引入复杂度不值。

### Decision 3: `onAnimationComplete` 由 `AnimatedOverlay` 透传到 `Overlay`

当前 `AnimatedOverlay.tsx:199` 的 `onAnimationComplete` 内联调用 `syncFinalWindowSize`。改为：保留内联逻辑，同时接受外部 `onComplete` 回调 prop（可选），在 `onAnimationComplete` 中先调用内部 sync 再调用外部回调。`Overlay` 用这个回调解冻测量。

这样保持 `AnimatedOverlay` 单职责（不感知测量逻辑），`Overlay` 拥有测量状态机。

### Decision 4: 不引入新的 state machine 状态

不加 `expandPhase: 'animating' | 'settled'` 这样的显式状态。用 `useRef` 表达瞬态的"动画中"标志即可 —— 它不影响渲染输出，不需要 state 的纯函数性。如需调试可读 ref。

### Decision 5（实现期细化）：把 gate 抽成 `useAnimationGatedMeasure` hook

原计划在 `Overlay.tsx` 内联 `isAnimatingRef` + 测量 gate（Decision 1 的 Approach A）。实现时发现：`Overlay.tsx` 已 747 行，内联会让 gate 逻辑与 Overlay 的 30+ 个 hook 混在一起难以单独测试；而 jsdom 下渲染整个 Overlay（带 10+ 子组件依赖）成本极高。

**细化**：把 gate 生命周期 + measure 引用持有 + safety 兜底抽成 `frontend/src/hooks/useAnimationGatedMeasure.ts`，接口为 `(measure, isExpanded, options?) => { gatedMeasure, onAnimationComplete, isAnimatingRef }`。`Overlay.tsx` 只负责：把 `measure` 写成 `useCallback`、把 `gatedMeasure` 喂给 `ResizeObserver`、把 `onAnimationComplete` 透传给 `AnimatedOverlay.onComplete`。

**收益**：hook 可在 `renderHook` 下用 fake timers 直接测，无需渲染 Overlay；spec 场景 1/2/4 + safety 兜底 + measure 引用更新都在 hook 测试里覆盖。Overlay 集成测试只剩场景 5（审批绕过）+ wiring 校验，用 mock 子组件即可。

**未改 Design 的任何取舍**：仍是 Approach A（动画飞行中 early-return），仍是 ref 而非 state machine，仍是 1500ms safety，首次展开仍是 `EXPANDED_MIN` 兜底。只是物理位置从 Overlay 内联挪到了独立 hook 文件。

## Risks / Trade-offs

- **[风险] 首次展开的两阶段视觉感** → 缓解：`EXPANDED_MIN` 本身是配置项（`overlayLayout.expandedMinHeight`），可设到一个"看起来合理"的值减轻落差；`onAnimationComplete` 后的二次同步无动画、立即对齐，肉眼基本不可见。如后续验证仍不满意，可在 Direction B 的 spike 里一并解决。
- **[风险] 内容在展开动画期间剧烈变化（例如审批请求刚好在展开中到达）** → 缓解：审批路径走 `isApprovalFocusMode`，使用固定 `APPROVAL_FOCUS_HEIGHT`，不经过自适应测量，不受 gate 影响。普通 session 列表在 ~300ms 动画内大幅变化的概率极低。
- **[风险] `onAnimationComplete` 不触发（Framer Motion 异常）** → 缓解：在 `isOverlayExpanded` 切回 false（收起）时也强制 `isAnimatingRef.current = false`，避免 gate 卡死。此外可加一个安全 timeout（如 1500ms）兜底释放。
- **[权衡] 收起动画期间也冻结测量** —— 收起时 panel 即将卸载，测量无意义，冻结反而是正确行为，无负作用。
- **[权衡] 不解决 Win32 每帧开销** —— 本 change 只拆反馈环，每帧 `SetWindowRgn` + `set_size` 仍在。预期效果是"卡顿减轻（抖动感消失）"，不是"完全流畅"。完全流畅需要方向 B。

## 对硬约束的影响（.claude/rules/）

- **ArchitectureConstraints.md**：无影响。不动 HWND 序列化、条件编译、Overlay 四件套样式、主窗口透明、Hook 非破坏性、审批 tool_use_id 关联、配置治理（Rust ↔ 前端双默认值未触碰）。
- **TauriIPCConvention.md**：无影响。`update_overlay_size` 调用频率与参数不变，节流不变。
- **FrontendConvention.md**：符合。新代码用 `useRef` 表达瞬态、回调封装为 prop、注释中文。
- **ErrorHandlingConvention.md**：无新增错误路径。
- **RustConvention.md**：无 Rust 改动。

## Migration Plan

1. 实现 `isAnimatingRef` + `measure()` gate（见 tasks.md）。
2. 接线 `onAnimationComplete` → 解冻 + 触发一次测量。
3. 加 `isOverlayExpanded` false→true / true→false 切换时设置/重置 ref。
4. 单元测试覆盖三个核心场景（见 specs）。
5. 手动验证：`?sandbox=geometry` + 真实 Tauri 运行对比改动前后展开/收起的视觉流畅度。
6. **回滚策略**：纯前端改动，`git revert` 单 commit 即可；无数据迁移、无配置变更。

## Open Questions

- 首次展开的"两阶段感"在真机上的可接受程度？需要 Phase 1 完成后人工验证。若不可接受，考虑在展开切换的 `requestAnimationFrame` 里做一次"预测量"（panel 此时刚挂载，可读到近似高度）—— 但这会增加首次展开的 1 帧延迟。
- 是否需要在 `AnimatedOverlay` 暴露更细粒度的动画生命周期（如 `onAnimationStart`）？当前用 `isOverlayExpanded` 切换时机已够，暂不需要。
