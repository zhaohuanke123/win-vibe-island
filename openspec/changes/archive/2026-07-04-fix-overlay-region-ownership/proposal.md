## Why

`fix-overlay-bbox-snap-and-desync` 落地后用户报告两个新现象：
1. compact 态下，黑色胶囊背后出现一条很长的"渐变白色半圆"条
2. 屏幕顶部有一块不可点击的区域

根因：B4-Lite 引入了 `set_overlay_region` 作为命中 region 的唯一管理者（小药丸 region），但旧的 `apply_snap_aware_round_region`（设大 bbox region）仍被 4 处调用，**覆盖**了小 region。`update_overlay_size`（AnimatedOverlay 每次 init/动画完成调）和 `smart_snap_overlay`（拖拽松手调）的调用让 region 在小药丸和大 bbox 之间反复横跳 —— 最终往往是"大 bbox 赢"，导致 HWND 整块可见 + 拦截点击。

本 change 让 `set_overlay_region` 独占 region 管理，删除 B4-Lite 下已过时的 `apply_snap_aware_round_region` 调用。

## What Changes

- **删除 `update_overlay_size` 内的 `apply_snap_aware_round_region` 调用**（[commands.rs:598](src-tauri/src/commands.rs:598)）—— B4-Lite 下可见形状由 motion.div + clip-path 负责，HWND region 只管命中测试，由 `set_overlay_region` 设。
- **删除 `smart_snap_overlay` 内的 `apply_snap_aware_round_region` 调用**（[commands.rs:1202](src-tauri/src/commands.rs:1202)）—— 同上，吸附后不再覆盖 region。
- **审计 + 清理 `snap_overlay`（[commands.rs:1133](src-tauri/src/commands.rs:1133)）和 `set_window_size`（[commands.rs:462](src-tauri/src/commands.rs:462)）**：
  - 若仍被前端调用：同样删除内部 `apply_snap_aware_round_region` 调用，保留命令本身。
  - 若是死代码：连命令 + handler 注册一起删。
- **不动** `apply_snap_aware_round_region` 函数定义本身（保留为内部工具，未来若需要 Win32 圆角命中可复用；只是不再被自动调用）。
- **不动** `set_overlay_region` 的 CreateRectRgn 实现（命中用纯矩形，可接受 expanded 态圆角外小三角区可点击的代价）。

## Non-Goals

- **不做 expanded 态 region 圆角化** —— 命中区比视觉稍大可接受；如需精确可后续用 CreateRoundRectRgn，但非本 change 范围。
- **不动 motion.div / clip-path / AnimatedOverlay 逻辑**。
- **不动 set_overlay_region 命名/签名**。
- **不重写拖拽几何** —— `move_overlay_drag` 工作正常。
- **不修 `apply_snap_aware_round_region` 函数本身** —— 只断它的调用者。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `overlay-window`：
  - **MODIFIED** `Multi-Layer Rounded Corner Consistency` —— 纠正"Win32 region 同时承担视觉裁剪 + 命中测试"的过时表述。B4-Lite 下 Win32 region **只管命中测试**，视觉裁剪由 motion.div clip-path + CSS border-radius 负责。
  - **ADDED** `Region Ownership Solely in set_overlay_region` —— HWND region MUST 只由 `set_overlay_region` 命令设置；其他命令（`update_overlay_size`、`smart_snap_overlay`、`snap_overlay`、`set_window_size`）MUST NOT 改 region。

## Impact

- **后端**：
  - `src-tauri/src/commands.rs` —— 删除 2-4 处 `apply_snap_aware_round_region` 调用；可能删除 `snap_overlay` / `set_window_size` 死命令。
  - `src-tauri/src/lib.rs` —— 若删命令，同步从 `generate_handler!` 移除。
- **前端**：无改动。
- **架构约束**：不动 `WS_EX_*` 四件套、不动 HWND 序列化、不动配置治理。
- **风险**：低。改动是纯删除（region 调用），不动其他逻辑。手动验证：compact 态无白色背景、屏幕顶部可点击。
- **下游**：依赖 `decouple-overlay-geometry`（B4-Lite）+ `fix-overlay-bbox-snap-and-desync`（snap 修复）的成果。本 change 在两者之后或同时归档。

**Test Approach:** implementation-shaped (pure delete refactor — no TDD signals; verification via manual run + existing region tests regression).
