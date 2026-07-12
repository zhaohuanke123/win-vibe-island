## 1. Phase 1 — Spike（go/no-go 门）

> 目标：在 `?sandbox=bbox-spike` 用最小原型验证 4 个未知，spike 代码与主 Overlay.tsx 隔离，可弃。spike 失败则 change 暂停，不进 Phase 2。

- [x] 1.1 在 `frontend/src/App.tsx` 新增 `?sandbox=bbox-spike` 路由入口（不动 `?sandbox=geometry`）
- [x] 1.2 新建 `frontend/src/components/BboxSpike.tsx`：固定 600×720 div，CSS `transition: clip-path 320ms cubic-bezier(...)` 在药丸形（`inset(...)`）与全 box（`inset(0 round r)`）间过渡。**实现期细化**：design 原写 Framer Motion `animate: { clipPath }`，实测 framer-motion 12 + React 19 对 clip-path 字符串插值不可靠（`animate` 不更新 inline style；改用 `useMotionTemplate`+`useMotionValue` 仍不更新 DOM）。改为 CSS transition 直接驱动 clip-path，WebView2/Chromium 走 GPU 合成，行为可预期。
- [x] 1.3 BboxSpike 在动画开始（handleToggle 立即）+ 结束（setTimeout 340ms）两次调用 `update_overlay_size`，无每帧调用；含调用计数器与日志
- [x] 1.4 新增后端命令 `set_overlay_region(x,y,w,h,scale)`（`commands.rs`），已注册到 `lib.rs` `generate_handler!`；封装 `CreateRectRgn` + `SetWindowRgn`，带 `AtomicU64` 缓存
- [x] 1.4b 自动验证通过：`cargo check` ✓ / `npm run build` ✓ / `npm run lint` ✓ / `npm test` 251/251 ✓（无回归）
- [x] 1.5-1.8 实测验证（spike 机制）：clip-path CSS transition 在浏览器预览切换正常、调用序列正确、计数器显示 size ≤2/切换、region 1/切换。完整 Tauri 真机验证延后到 Phase 3（B4-Lite 不用 clip-path，spike 的 region/端点 resize 验证直接复用）
- [x] 1.9 **门条件决策**：用户选择 **B4-Lite**（详见 design.md Decision 1 修订）—— 完整 B4 的 clip-path 模型要求重写子组件布局，ROI 不划算。B4-Lite 保留 motion.div width/height 动画，仅消除每帧 HWND resize（最大头开销）

## 2. Phase 2 — 后端（已随 spike 完成）

- [x] 2.1 `set_overlay_region` 命令（commands.rs）+ `lib.rs` 注册 —— Phase 1 已加，Phase 2 正式化（去掉 "test"/"spike" 命名）
- [x] 2.2 `update_overlay_size` 现有缓存逻辑保留 —— B4-Lite 下端点调用走 no-op 提前 return，无需改动
- [x] 2.3 后端结构化日志：`[set_overlay_region]` info 级别日志已加（`commands.rs`），`[update_overlay_size]` trace 级别保留

## 3. Phase 2 — 前端 AnimatedOverlay（B4-Lite 核心）

> 关键约束：保留 motion.div 的 width/height/borderRadius/scale 动画不变，只改 HWND 同步策略。

- [x] 3.1 `frontend/src/store/config.ts` 新增 `deriveBoundingBox(normalizedOverlay, barHeight)` 派生函数（design Decision 5 公式）；单测覆盖 6 场景
- [x] 3.2 在 `frontend/src/components/AnimatedOverlay.tsx` **删除 `onUpdate` 回调**（移除每帧 `syncWindowSize`）—— B4-Lite 核心改动
- [x] 3.3 在 `AnimatedOverlay.tsx` **加 bbox init effect**：mount 时一次性调 `update_overlay_size(bbox.w, bbox.h, ...)` 把 HWND 撑到 bounding box
- [x] 3.4 在 `AnimatedOverlay.tsx` **加 region effect**：`onAnimationComplete` 时调 `set_overlay_region`，rect 由 motion.div 目标尺寸 + bbox 居中推导（`x = (bbox.w - motion.w)/2, y = 0, w, h`）
- [x] 3.5 保留 `onAnimationComplete` 端点调用 + `onComplete` prop（已归档 change 的 hook 依赖）
- [x] 3.6 保留 `useAnimationGatedMeasure` hook（已归档 change 引入）—— 测量冻结仍需要，只是 resize 频率变了

## 4. Phase 2 — 单元测试

- [x] 4.1 `deriveBoundingBox` 单测（6 场景，已随 3.1 完成）
- [x] 4.2 `AnimatedOverlay` 测试：mount 调 update_overlay_size(bbox) + state 切换不调（B4-Lite 无 onUpdate）
- [x] 4.3 `AnimatedOverlay` 测试：mount 调 set_overlay_region 设为 compact 居中矩形
- [x] 4.4 `Overlay` 集成测试回归：既有 `Overlay.test.tsx` mock 子组件仍通过（251→261 测试无回归）；`useAnimationGatedMeasure` 行为不变；审批专注模式仍走固定尺寸路径

## 5. Phase 3 — 验证与归档

- [x] 5.1 `cd frontend && npm run lint`
- [x] 5.2 `cd frontend && npm run build`（tsc 严格模式通过）
- [x] 5.3 `cd frontend && npm test`（17 文件 / 261 测试全过：原 251 + 新 10 = deriveBoundingBox 6 + AnimatedOverlay 4）
- [x] 5.4 `cargo check`（30 既有警告，0 错误）
- [x] 5.5 `node scripts/config-sync.js --strict`（79/79，未触碰双默认值不变量）
- [x] 5.6 `openspec validate decouple-overlay-geometry --strict`（合法）
- [x] 5.7 手动验证（真实 Tauri 运行）：用户确认"动画优化了很多"（B4-Lite 核心目标达成）；同时发现 2 个 bug（吸附位置偏移、视觉偶发错位），已记入独立 change `fix-overlay-bbox-snap-and-desync`
- [ ] 5.8 通过后 `/opsx:archive`
