## 1. AnimatedOverlay 回调透传

- [x] 1.1 在 `frontend/src/components/AnimatedOverlay.tsx` 的 `AnimatedOverlayProps` 增加可选 `onComplete?: () => void`
- [x] 1.2 修改 `motion.div` 的 `onAnimationComplete`：保留现有 `syncFinalWindowSize()` 调用，在其后追加 `props.onComplete?.()`（透传外部回调，保持组件单职责）

## 2. Overlay 测量 gate 实现

> 实现期细化：gate 逻辑抽成独立 hook `frontend/src/hooks/useAnimationGatedMeasure.ts`（见 design.md Decision 5），Overlay 只负责 measure useCallback + 接线。以下任务的"实现位置"由 Overlay 内联变为 hook，但功能等价完成。

- [x] 2.1 ~~在 Overlay.tsx 顶部新增 isAnimatingRef~~ → 实现在 `useAnimationGatedMeasure` hook 内部（`isAnimatingRef = useRef(false)`）
- [x] 2.2 把当前 measure effect 内的 `measure` 闭包重构为组件级的 `useCallback`（依赖：`BAR_HEIGHT`、`EXPANDED_MIN`、`EXPANDED_MAX`），用 `measureRef.current` 持有最新引用 —— hook 内 `measureRef` 持有外部传入的 measure
- [x] 2.3 在 `measure` 入口插入 early-return gate —— hook 内 `gatedMeasure` 在 `isAnimatingRef.current` 为 true 时直接 return
- [x] 2.4 measure effect 的 ResizeObserver 改用 `gatedMeasure`（initTimer 同理）

## 3. 动画标志生命周期接线

- [x] 3.1 hook 内 `useEffect` 监听 `isExpanded`：true 置位 / false 复位（覆盖 spec 场景 4）
- [x] 3.2 `Overlay` 给 `<AnimatedOverlay>` 传 `onComplete={onAnimationComplete}`；hook 内 onAnimationComplete 复位 gate + `requestAnimationFrame` 触发一次 measure
- [x] 3.3 hook 内 safety timeout（默认 1500ms，可配 `safetyTimeoutMs`），cleanup 中清除

## 4. 单元测试（对应 spec 场景）

- [x] 4.1 spec 场景 1：动画飞行中 `gatedMeasure` 多次触发不调用 `measure`（`useAnimationGatedMeasure.test.ts`）
- [x] 4.2 spec 场景 2：`onAnimationComplete` 复位 gate + 触发一次 measure（`useAnimationGatedMeasure.test.ts`）
- [x] 4.3 spec 场景 3：首次展开 `measuredHeight` 初始 `EXPANDED_MIN` —— 由 gate 行为（场景 1）保证，Overlay 集成测试 smoke 间接覆盖
- [x] 4.4 spec 场景 4：收起复位 gate，恢复测量（`useAnimationGatedMeasure.test.ts`）
- [x] 4.5 spec 场景 5：审批专注模式 `expandedHeight === approvalFocusHeight`（`Overlay.test.tsx`），另含 wiring（onComplete 透传）+ smoke

## 5. 验证

- [x] 5.1 `cd frontend && npm run lint`（无新增 lint 错误）
- [x] 5.2 `cd frontend && npm run build`（TypeScript 严格模式编译通过）
- [x] 5.3 `cd frontend && npm test`（15 文件 / 251 测试全过：原 241 + 新 10）
- [x] 5.4 `node scripts/config-sync.js --strict`（79/79，未触碰双默认值不变量）
- [x] 5.5 手动验证 —— 用户在 Tauri 运行时确认"稍微好了一点"（飞行中抖动减轻），符合本 change 预期（只拆反馈环，不解决每帧 Win32 开销）
- [x] 5.6 `openspec validate fix-expand-animation-resizeobserver-feedback --strict`（spec delta 合法）
