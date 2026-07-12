## 1. 审计：确认死命令

- [ ] 1.1 grep `snap_overlay` 全仓 + 前端：记录调用点
- [ ] 1.2 grep `set_window_size` 全仓 + 前端：记录调用点
- [ ] 1.3 判定：若均无前端调用 → 死代码；若有调用 → 保留命令仅删 region 调用

## 2. 删除活跃 region 覆盖路径

- [ ] 2.1 删 `src-tauri/src/commands.rs:598` `update_overlay_size` 内的 `apply_snap_aware_round_region` 调用
- [ ] 2.2 删 `src-tauri/src/commands.rs:1202` `smart_snap_overlay` 内的 `apply_snap_aware_round_region` 调用

## 3. 处理死命令（视 1.x 审计结果）

- [ ] 3.1 若 `snap_overlay` 死：删 `pub fn snap_overlay` 整个函数 + 从 `lib.rs` `generate_handler!` 移除注册
- [ ] 3.2 若 `set_window_size` 死：删 `pub fn set_window_size` 整个函数 + 从 `lib.rs` `generate_handler!` 移除注册
- [ ] 3.3 若仍活着：仅删其内部的 `apply_snap_aware_round_region` 调用（:462 / :1133），保留命令

## 4. 函数定义保留处理

- [ ] 4.1 `apply_snap_aware_round_region` 函数定义保留，加 `#[allow(dead_code)]` + 注释说明"B4-Lite 后不再自动调用，保留为内部工具"
- [ ] 4.2 确认 `LAST_REGION_KEY` 静态变量不与 `set_overlay_region` 的同名静态冲突（不同函数内，OK）

## 5. 自动验证

- [ ] 5.1 `cargo check`（确认删除后无编译错误、handler 注册一致）
- [ ] 5.2 `cargo test --lib`（window_manager 8 测试仍过 + 其他无回归）
- [ ] 5.3 `node scripts/config-sync.js --strict`（未触碰双默认值）
- [ ] 5.4 `openspec validate fix-overlay-region-ownership --strict`

## 6. 手动验证（用户在 Tauri 运行时把关）

- [x] 6.1 compact 态：黑色胶囊背后无白色/渐变条（bbox 空白区不可见）—— 用户确认"确实修复了"
- [x] 6.2 compact 态：点击 bbox 空白区穿透到下层窗口（屏幕顶部可点击）—— 用户确认
- [x] 6.3 拖拽松手吸附顶部后：region 仍是小药丸矩形，不出现大块不可点击区 —— 用户确认
- [ ] 6.4 expanded 态：整 motion.div 可点击（接受圆角外小三角区可点的代价）—— 默认 OK，无回归报告

## 7. 归档

- [ ] 7.1 通过后 `/opsx:archive`
