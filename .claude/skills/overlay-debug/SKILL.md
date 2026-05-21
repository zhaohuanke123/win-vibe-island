---
name: overlay-debug
description: |
  Overlay 悬浮窗调试辅助。帮助诊断 Win32 窗口显示、点击穿透、拖拽吸附、事件竞争等问题。
  触发条件：
  - overlay 窗口不显示、闪烁、位置异常
  - 点击穿透异常（无法点击或不应穿透时穿透了）
  - 拖拽后意外展开/收缩面板、拖拽和点击互相干扰
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

### 6. 拖拽与点击事件竞争

拖拽（mousedown → mousemove → mouseup）和点击（mousedown → mouseup → click）共享 mousedown 起点，容易产生竞争。

**已知陷阱：onClick 和 mouseup 竞争**

在 Tauri WebView2 中，`onClick` 事件在 `mouseup` 之后触发。如果用两个独立处理器分别处理拖拽（mouseup）和点击（onClick），存在以下问题：

- mouseup 中重置拖拽标记 → onClick 看不到标记 → 拖拽松手后误触展开
- 即使不重置标记，React 合成事件和原生 document 监听器的执行时序不完全可预测

**正确模式：统一在 mouseup 中判断**

```
mousedown → 记录起点，标记 wasDragged = false
mousemove → 超过阈值(3px)则 wasDragged = true
mouseup:
  - wasDragged = false → 纯点击，执行 toggle 逻辑
  - wasDragged = true  → 拖拽结束，执行吸附
```

移除 bar 上的 `onClick`，所有判断集中在 document 的 mouseup 监听器中。toggle 逻辑通过 `useRef` 保存（避免 useEffect `[]` 依赖导致的闭包过期）。

**涉及文件**：`frontend/src/components/Overlay.tsx`

**涉及后端命令**：
- `start_manual_drag` — 记录拖拽起始鼠标位置和窗口位置
- `move_overlay_drag` — 每次 mousemove 调用，后端用 SetWindowPos 移动窗口
- `end_manual_drag` — 设置拖拽结束标志
- `smart_snap_overlay` — 延迟 50ms 调用，检测窗口是否靠近屏幕边缘并吸附

**注意**：项目使用 CRLF 换行符，Edit 工具可能因 `\r` 字符匹配失败，必要时用 sed 替代。

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
