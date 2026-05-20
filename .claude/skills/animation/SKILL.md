---
name: animation
description: |
  动画系统开发。包含弹簧参数、状态尺寸、IPC 同步、前端动画组件和后端窗口同步的完整工作流。
  触发条件：
  - 用户要调整或添加动画
  - "弹簧参数"、"stiffness"、"damping"、"动画卡顿"
  - Overlay 展开/收缩动画问题
  - 窗口尺寸同步、DPI 缩放问题
  - "StatusDot 动画"、"BarsGlyph"
  不要触发：与动画无关的 UI 变更、纯后端逻辑
---

# 动画系统

动画系统使用 Framer Motion 弹簧物理动画，前端驱动动画并通过 IPC 同步窗口尺寸。

**参考文档**：`docs/architecture/animation-design.md`

## 弹簧参数

| 用途 | stiffness | damping | mass |
|------|-----------|---------|------|
| 展开/收缩 | 300 | 25 | 1 |
| 状态指示 | 200-280 | 20-30 | 1 |

动画时长控制在 200-500ms。

## 状态尺寸

| 状态 | 宽度 | 高度 | 圆角 |
|------|------|------|------|
| compact | 236px | 52px | height/2 |
| expanded | 600px | 自适应 | 18px |
| approval focus | 600px | 720px | 18px |

## 数据流

```
状态变化 → Framer Motion 动画
                ↓
          onUpdate 回调
                ↓
      invoke('update_overlay_size')  ← 16ms 节流
                ↓
          SetWindowPos() (Win32)
                ↓
          窗口尺寸 + 圆角更新
```

## 前端动画组件

| 组件 | 动画效果 |
|------|----------|
| `StatusDot` | thinking 脉动、running 闪烁、streaming 快闪 |
| `Overlay` | 展开/收缩 max-height 过渡 |
| `BarsGlyph` | 活动指示条动画 |

GPU 加速：动画元素添加 `will-change` + `translateZ(0)`。

## 后端窗口同步

- `update_overlay_size` — 节流窗口尺寸更新（16ms 最小间隔）
- `set_window_interactive` — 点击穿透切换（WS_EX_TRANSPARENT）
- `apply_window_round_region` — Win32 圆角（CreateRoundRectRgn）
- DPI 缩放：CSS 像素 → 物理像素转换

## 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/components/Overlay.tsx` | 前端动画和状态驱动 |
| `frontend/src/components/StatusDot.tsx` | 状态指示点动画 |
| `frontend/src/config/` | 动画参数配置 |
| `src-tauri/src/commands.rs` | update_overlay_size、set_window_size |
| `src-tauri/src/overlay.rs` | Win32 窗口管理 |

## 检查清单

- [ ] 动画参数在合理范围（stiffness 200-300, damping 20-30）
- [ ] IPC 调用有 16ms 节流
- [ ] DPI 缩放正确转换物理像素
- [ ] 圆角根据高度自动选择（≤80px 用 height/2，否则 18px）
- [ ] `cargo check && npm run build` 通过
