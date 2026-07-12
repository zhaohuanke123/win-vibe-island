# tasks.md（TDD 模式 —— test-first）

> 每个 spec scenario 一个 task group，红 → 绿 → 反验证 → 收尾。Bug 2 系列已完成（确定性），Bug 1 诊断日志已加（待用户复现抓数据）。

## Scenario: scale 1.5 下 top snap 后药丸水平居中

- [x] 1.1 写失败测试：`calculate_snap_position_for_work_area(600, 720, Top, &work_scale_1_5, None)` → center_x = 510（work.cx - 450）。函数尚未抽出来 → RED
- [x] 1.2 实现：从 `calculate_snap_position` 抽出纯数学函数 `calculate_snap_position_for_work_area` → GREEN
- [x] 1.3 反验证：`passing_physical_pixels_would_offcenter` 测试文档化"若传物理 900 → center_x = 285（偏左）"，证明测试不是同义反复
- [x] 1.4 收尾：caller `smart_snap_overlay` 通过 `outer_size_to_logical` 换算逻辑像素后传入

## Scenario: scale 1.0 下行为不变

- [x] 2.1 回归测试：scale=1.0 下 center_x = 660（work.cx - 300）→ GREEN（回归保护，验证 scale=1.0 路径不受 caller 改动影响）
- [x] 2.2 不需额外实现
- [x] 2.3 反验证：scale=1.0 下 phys_width=600 logical=600 一致，caller 改动不影响
- [x] 2.4 收尾

## Scenario: 拖药丸到屏幕底部触发 bottom snap

- [x] 3.1 写失败测试：`is_near_edge_for_work(pill_top=1020, pill_bottom=1070, &work_bottom=1080)` → `Some(Bottom)`。函数尚未抽出 → RED
- [x] 3.2 实现：抽 `is_near_edge_for_work(pill_top_y, pill_bottom_y, &work)`，新签名用药丸屏幕坐标；caller 从 `pos.y + barHeight*scale` 推导 pill coords → GREEN
- [x] 3.3 反验证：`legacy_hwnd_height_logic_would_false_positive_in_middle` 测试文档化"旧逻辑用 HWND 高度时 bottom snap 永远不触发"
- [x] 3.4 收尾

## Scenario: 拖药丸到屏幕顶部仍触发 top snap

- [x] 4.1 回归测试：`is_near_edge_for_work(pill_top=30, pill_bottom=82, &work_top=0)` → `Some(Top)` → GREEN
- [x] 4.2 不需额外实现（3.2 的实现同时覆盖）
- [x] 4.3 反验证：`is_near_edge_for_work_middle_returns_none` 验证中部不触发
- [x] 4.4 收尾

## Scenario: HWND 中部不影响边缘检测

- [x] 5.1 测试：pill 在屏幕中部（pill_top=500）→ `None` → GREEN
- [x] 5.2 不需额外实现
- [x] 5.3 反验证：见 4.3
- [x] 5.4 收尾

## Phase 2 — Bug 1 诊断（DOM/timing 类，TDD 在 jsdom 下受限）

## Scenario: expand 动画完成后 motion.div 尺寸到位

- [x] 6.1 写失败测试：`logAnimDiag` DEV 模式调 console.debug 带 `[AO-DIAG]` 前缀 + payload。函数不存在 → RED
- [x] 6.2 实现：在 `frontend/src/components/anim-diag.ts` 新建 `logAnimDiag`（DEV 门控），`AnimatedOverlay` 的 `onAnimationComplete` 读 `motionDivRef.offsetWidth/Height` 调用之 → GREEN
- [x] 6.3 反验证：DEV=false 时 console.debug 不被调（生产剥离）
- [x] 6.4 收尾：`logAnimDiag` 单独文件存放，避免 react-refresh/only-export-components 报错

## Scenario: compact 动画完成后 motion.div 尺寸到位

- [x] 7.1 测试：与 6.1 同函数，覆盖（同一 logAnimDiag 在 expand/collapse 都触发）
- [x] 7.2 不需额外实现
- [x] 7.3 反验证
- [x] 7.4 收尾

## Scenario: 诊断日志不污染生产

- [x] 8.1 写失败测试：`vi.stubEnv("DEV", false)` 后 `logAnimDiag` 不调 console.debug。初版未 DEV 门控 → RED
- [x] 8.2 实现：`if (!import.meta.env.DEV) return;` 门控 → GREEN
- [x] 8.3 反验证：DEV=true 时调用确认（test 6.1/7.1 验证）
- [x] 8.4 收尾：生产构建由 Vite 静态剥离 `if (false)` 块

## Phase 3 — 手动验证 + Bug 1 根因定位（留给用户）

- [ ] 9.1 手动：HiDPI 显示器下拖 overlay 到顶部 → 药丸水平居中（Bug 2 top snap 验证）
- [ ] 9.2 手动：拖到屏幕底部 → 触发 bottom snap（Bug 2 bottom snap 验证）
- [ ] 9.3 手动：复现 Bug 1（多次 toggle expand/collapse），打开 DevTools 控制台看 `[AO-DIAG]` 日志，抓数据
- [ ] 9.4 根据 9.3 数据：若 Bug 1 不再复现 → 同源关闭，更新 design.md；若仍复现 → 根据日志中 actualW vs targetW 的差异定位根因，开新 change 修复

## 自动验证（已通过）

- [x] `cd frontend && npm run lint` ✓
- [x] `cd frontend && npm run build` ✓
- [x] `cd frontend && npm test` ✓（18 文件 / 264 测试，+3 logAnimDiag）
- [x] `cargo test --lib` ✓（97 passed，+8 window_manager）
- [x] `node scripts/config-sync.js --strict` ✓（79/79）
- [x] `openspec validate fix-overlay-bbox-snap-and-desync --strict` ✓

## Refactor (post-green, optional)

- [ ] 10.1 检查 `smart_snap_overlay` 的 size/scale 计算是否可抽取为 helper（`outer_size_logical(window) -> (f64, f64)`）—— 已抽 `outer_size_to_logical`，可考虑后续把 `smart_snap_overlay` 内联的 size/scale 处理也统一走它
- [ ] 10.2 检查 `is_near_edge` 签名变更后是否有死代码 —— `SNAP_THRESHOLD`（windows-only）仍被引用，但 `SNAP_THRESHOLD_CROSS` 是新的跨平台版，可考虑统一
- [ ] 10.3 诊断日志格式统一 —— 当前 `[AO-DIAG]` 前缀已统一
