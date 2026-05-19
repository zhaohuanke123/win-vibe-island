---
name: overlay-debug
description: |
  Overlay 悬浮窗调试辅助。帮助诊断 Win32 窗口显示、点击穿透、动画同步等问题。
  触发条件：
  - overlay 窗口不显示、闪烁、位置异常
  - 点击穿透异常（无法点击或不应穿透时穿透了）
  - 动画卡顿、尺寸不对、DPI 缩放问题
  - "悬浮窗问题"、"overlay bug"、"窗口调试"
  不要触发：与 overlay 无关的 bug、纯前端逻辑问题
---

# Overlay 调试流程

## 常见问题排查清单

### 1. 窗口样式检查

检查 `overlay.rs` 中的窗口样式，必须包含：
- `WS_EX_LAYERED` — 支持透明
- `WS_EX_TRANSPARENT` — 点击穿透（按需切换）
- `WS_EX_TOPMOST` — 置顶
- `WS_EX_NOACTIVATE` — 不抢焦点

确认 `set_window_interactive` 命令正确切换 `WS_EX_TRANSPARENT`。

### 2. 前端动画和 CSS 检查

- 确认 Framer Motion 动画参数正确
- 检查 CSS `will-change` 和 `translateZ(0)` GPU 加速
- 确认 `max-height` 过渡值合理
- 查看 `docs/architecture/animation-design.md` 的参数参考

### 3. IPC 节流检查

- `update_overlay_size` 必须有 16ms 节流
- 检查前端是否使用 `requestAnimationFrame` 控制调用频率
- 检查后端 `AtomicU64` 缓存是否正确避免重复操作

### 4. DPI 缩放检查

- 确认 `get_dpi_scale_for_window` 返回正确值
- 检查 `set_window_size` 是否正确转换为物理像素
- 确认 WebView2 `RasterizationScale` 配置正确
- 查看 `lib.rs` 中 DPI 相关初始化代码

### 5. 圆角检查

- 确认 `apply_window_round_region` 被正确调用
- 检查 `border_radius` 参数传递是否正确
- 矮窗口（≤80px）使用 `height / 2` 作为圆角半径

## 关键文件

| 文件 | 关注点 |
|------|--------|
| `src-tauri/src/overlay.rs` | Win32 窗口创建和管理 |
| `src-tauri/src/commands.rs` | IPC 命令（set_window_size, update_overlay_size 等） |
| `frontend/src/components/Overlay.tsx` | 前端 overlay 组件和动画 |
| `frontend/src/hooks/useAgentEvents.ts` | 事件驱动的状态更新 |
| `docs/architecture/animation-design.md` | 动画参数参考 |

## 相关 Skills

- [[animation]] — 动画参数和窗口同步流程
- [[tauri-command]] — IPC 命令参考（set_window_size 等）

## 调试命令

```typescript
// 检查窗口几何信息
const geo = await invoke("get_window_geometry");

// 检查 DPI 缩放
const dpi = await invoke("get_dpi_scale", { hwndStr: "..." });

// 测试事件
await invoke("simulate_state_change", { sessionId, state: "running" });
```
