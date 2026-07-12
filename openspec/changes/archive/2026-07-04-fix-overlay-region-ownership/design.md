## Context

B4-Lite（`decouple-overlay-geometry`）把 HWND 撑到 600×720 bounding box 后，命中 region 由新命令 `set_overlay_region` 管理（设小药丸矩形让 bbox 空白区点击穿透）。但旧的 `apply_snap_aware_round_region`（在 B4-Lite 之前负责"视觉圆角裁剪 + 命中"）仍被 4 处调用，**每次调用都把 region 重设为整个 bbox 大矩形**，覆盖 `set_overlay_region` 设的小矩形。

```
apply_snap_aware_round_region 调用点（commands.rs）：
  :462   set_window_size          — 旧命令，疑似死代码
  :598   update_overlay_size      — AnimatedOverlay init + onAnimationComplete 调  ← 活跃
  :1133  snap_overlay             — 显式 snap 命令，疑似死代码
  :1202  smart_snap_overlay       — 拖拽松手后调                                            ← 活跃
```

活跃路径（:598 + :1202）反复覆盖小 region → 用户看到：
- compact 态下 bbox 整块可见（motion.div 外露出 WebView body 背景 = "白色半圆条"）
- bbox 整块拦截点击（"屏幕顶部不可点击"）

## Goals / Non-Goals

**Goals:**
- `set_overlay_region` 成为 HWND region 的唯一管理者。
- 删除 B4-Lite 下过时的 `apply_snap_aware_round_region` 自动调用。
- compact 态下 bbox 空白区不可见 + 点击穿透；expanded 态下整 motion.div 可点。

**Non-Goals:**
- 不改 `apply_snap_aware_round_region` 函数定义（保留为内部工具）。
- 不做 expanded 态 region 圆角化（命中区比视觉稍大可接受）。
- 不动 motion.div / clip-path / AnimatedOverlay 逻辑。

## Decisions

### Decision 1: 删除 4 处 `apply_snap_aware_round_region` 调用，函数定义保留

**选择**：删 `:462`、`:598`、`:1133`、`:1202` 四处调用。`apply_snap_aware_round_region` 函数本身保留（未公开，未来若需 Win32 圆角命中可复用，不影响）。

**候选方案**：

| 方案 | 机制 | 取舍 |
|---|---|---|
| **A. 删所有调用** ⭐ | 4 处 caller 全删，set_overlay_region 独占 | ✅ 选：彻底解决覆盖问题 |
| B. 只删活跃路径（:598 + :1202） | 保留死命令的调用 | 死命令复活时隐患重现 ❌ |
| C. 让 apply_snap 内部判空 | 检测 B4-Lite 模式跳过 | 黑魔法，难维护 |

**为什么删所有 4 处**：死命令（`set_window_size` / `snap_overlay`）若将来被复活，又会引入覆盖 bug。一并删干净，set_overlay_region 成为唯一 region 路径，契约清晰。

### Decision 2: 死命令（`snap_overlay` / `set_window_size`）的处理

**选择**：先 grep 前端代码确认是否仍被调用：
- 若**仍被调用**：保留命令，仅删其内部的 `apply_snap_aware_round_region` 调用。
- 若**死代码**：连命令 + `generate_handler!` 注册一起删（避免未来误用）。

**初步判断**（实现时 grep 确认）：B4-Lite + 当前 Overlay.tsx 主路径用 `update_overlay_size` + `set_overlay_region` + `smart_snap_overlay`；`snap_overlay` 和 `set_window_size` 看起来是早期遗留，可能死。

### Decision 3: expanded 态 region 保持纯矩形

**选择**：`set_overlay_region` 用 `CreateRectRgn`（纯矩形），expanded 态不圆角化。

**取舍**：expanded motion.div 有圆角（CSS clip-path），但命中区是矩形 → 圆角外的小三角区（每角约 18² × (4-π)/4 ≈ 70px²）可点击但视觉无内容。肉眼几乎不可察，可接受。

**为什么不圆角化**：`CreateRoundRectRgn` 在每帧 region 调用时成本更高；B4-Lite 的核心收益之一是降低 region 频率，圆角化抵消部分收益。视觉圆角已由 motion.div 表达，命中精度非关键。

## Risks / Trade-offs

- **[风险] 删 `set_window_size` / `snap_overlay` 命令破坏未知调用方** → 缓解：实现时 grep 全仓 + 前端，确认无引用再删；有引用则保留命令、仅删 region 调用。
- **[权衡] expanded 命中区比视觉大 ~280px²**（4 个圆角外三角）→ 可接受，肉眼不可察。
- **[风险] `apply_snap_aware_round_region` 函数变 dead code 触发 warning** → 缓解：加 `#[allow(dead_code)]` 或在 `lib.rs` 注释说明保留意图。
- **[风险] region 在某些时序下仍可能为空（极少数）** → 缓解：保留 AnimatedOverlay init effect 的 `set_overlay_region` 调用作为兜底（已是 B4-Lite 实现）。

## 对硬约束的影响（.claude/rules/）

- **ArchitectureConstraints.md**：不动 `WS_EX_*` 四件套、不动 HWND 序列化、不动条件编译、不动配置治理。✅
- **TauriIPCConvention.md**：若删命令，从 `generate_handler!` 移除；保留的命令 payload 不变。✅
- **RustConvention.md**：删除遵循命名 + 条件编译规范；`#[allow(dead_code)]` 加注释说明。✅
- **ErrorHandlingConvention.md**：不动错误处理路径。✅

## Migration Plan

1. grep `snap_overlay` / `set_window_size` 全仓 + 前端，确认死活。
2. 删 `apply_snap_aware_round_region` 的 4 处调用。
3. 死命令连命令 + 注册一起删。
4. `apply_snap_aware_round_region` 函数加 `#[allow(dead_code)]`。
5. 自动验证（cargo check / cargo test / config-sync）。
6. 手动验证：compact 态无白色背景、屏幕顶部可点击、expanded 态整 motion.div 可点。

**回滚**：纯删除，`git revert` 即可。

## Open Questions

- `set_window_size` / `snap_overlay` 是否真的死了？实现时 grep 确认。
- 未来若需要 expanded 态精确圆角命中，是否值得加 CreateRoundRectRgn？暂不做，记录在 backlog。
