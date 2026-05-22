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

### 5. 圆角检查（三层裁剪机制）

Overlay 窗口有**三层独立的裁剪机制**，必须保持一致，否则会出现非胶囊色边、白色边、圆角不匹配等问题：

```
第1层: Win32 SetWindowRgn    → apply_snap_aware_round_region → 裁剪原生窗口形状
第2层: motion.div borderRadius → Framer Motion animate       → overflow:hidden 裁剪子元素
第3层: motion.div clipPath     → style 属性                  → CSS clip-path 裁剪
第4层: .overlay__shell border-radius → CSS class 覆盖        → 内容裁剪
```

**已知陷阱：三层不一致导致视觉异常**

| 症状 | 原因 | 修复 |
|------|------|------|
| 贴边后顶部出现白色/非胶囊色边 | motion.div `borderRadius:16` 四角圆角，overflow:hidden 裁掉了 shell 的深色背景 | motion.div 的 borderRadius 也用吸附感知的逐角值 |
| 展开/收缩不触发 | borderRadius 放在 `style` 而非 `animate`，Framer Motion 动画循环不触发 onUpdate/onAnimationComplete | borderRadius 必须在 `animate` 中 |
| 拖拽后圆角不恢复 | snapPosition 只在 smart_snap_overlay 返回后才更新（50ms延迟） | handleMouseMove 首次超过阈值时立即 setSnapPosition(null) |
| CombineRgn 生成全矩形 | full_rect OR 圆角子集 = 全矩形，没有裁剪效果 | 先 CreateRoundRectRgn 四角圆角，再用 CreateRectRgn 矩形条 OR 填补需要扁平的角 |
| radius 双重缩放 | 后端用 phys_h 算 radius 传入函数，函数内部又乘了一次 DPI | radius 用 CSS 逻辑像素高度（size.height），不用物理像素 |

**吸附感知圆角值**（`frontend/src/components/AnimatedOverlay.tsx`）：

```typescript
const snapBorderRadius = snapPosition === "top"
  ? `0px 0px ${r}px ${r}px`      // 顶平底圆
  : snapPosition === "bottom"
    ? `${r}px ${r}px 0px 0px`    // 底平顶圆
    : `${r}px`;                   // 四角圆角
```

**后端不对称圆角**（`src-tauri/src/commands.rs` `apply_snap_aware_round_region`）：

- 自由浮动：`CreateRoundRectRgn` 四角圆角
- 吸附顶部：先四角圆角 + `CreateRectRgn(0, 0, w, r+1)` 顶部矩形条 + `CombineRgn(RGN_OR)` 填补顶角
- 吸附底部：先四角圆角 + `CreateRectRgn(0, h-r-1, w, h)` 底部矩形条 + `CombineRgn(RGN_OR)` 填补底角
- 缓存 key 包含 snap 方向，避免重复创建 region

**吸附状态跟踪**（`src-tauri/src/window_manager.rs`）：

- `CURRENT_SNAP: AtomicU8` 全局变量（0=None, 1=Top, 2=Bottom）
- `current_snap_position()` / `set_current_snap_position()` 读写
- `SnapResult` 包含 `snap_position: Option<SnapPosition>` 字段
- 前端通过 `smart_snap_overlay` 返回值获取，存为 `snapPosition` state

**完全贴边**：`calculate_snap_position` 增加 `edge_margin` 参数，吸附时传 `Some(0)`，启动定位传 `None`（保持 4px 默认值）。

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
| `src-tauri/src/commands.rs` | IPC 命令、apply_snap_aware_round_region（不对称圆角）、smart_snap_overlay |
| `src-tauri/src/window_manager.rs` | SnapPosition 枚举、CURRENT_SNAP 状态、calculate_snap_position（edge_margin）、is_near_edge |
| `frontend/src/components/Overlay.tsx` | 拖拽/点击逻辑、snapPosition 状态、CSS 类 |
| `frontend/src/components/AnimatedOverlay.tsx` | snapBorderRadius/snapClipPath 计算、motion.div 三层裁剪 |
| `frontend/src/components/Overlay.css` | .overlay--snapped-top/bottom 圆角覆盖 |
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
