# Pill 独立模式容器 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

Pill 是独立模式下的悬浮容器组件，管理自己的 `Motion.div` 并驱动窗口大小同步。支持 3 种模式：notch (180×32)、panel (380×380)、notif (320×120)，适用于不需要完整 Overlay 的轻量场景。

## 2. 视觉规格

### 2.1 布局与尺寸

| 模式 | 宽度 | 高度 | 圆角 |
|------|------|------|------|
| notch | 180px | 32px | 20px |
| panel | 380px | 380px | 20px |
| notif | 320px | 120px | 20px |

### 2.2 颜色

与 Overlay 一致，使用完整的玻璃态视觉语言。

| 元素 | CSS 变量 |
|------|---------|
| 背景 | `var(--glass-bg)` |
| 边框 | `var(--glass-border)` |
| 阴影 | `var(--glass-shadow)` |

### 2.3 顶边高光

`::before` 伪元素: `rgba(255,255,255,0.06) → 0.10 → 0.06` 水平渐变。

## 3. 状态与变体

| 模式 | CSS 修饰符 | 用途 |
|------|-----------|------|
| notch | — | 紧凑条，显示 Agent 状态 |
| panel | — | 展开面板，显示会话列表 |
| notif | — | 通知卡片 |

## 4. 动画规格

### 4.1 Framer Motion 弹簧

| 过渡 | stiffness | damping | mass | 约时长 |
|------|-----------|---------|------|--------|
| 模式切换 | 300 | 30 | 0.8 | ~300ms |
| 窗口大小同步 | 300 | 30 | 1.0 | ~300ms |

### 4.2 GPU 加速

- [x] `contain: paint; isolation: isolate`
- [x] `-webkit-mask-image: -webkit-radial-gradient(white, black)`
- [x] 窗口大小同步 16ms 节流

## 5. 组件 API

```typescript
interface PillProps {
  mode: 'notch' | 'panel' | 'notif';
}
```

## 6. CSS / BEM 类名结构

```
.pill                   -- 根 Motion.div
.pill--notch            -- notch 模式 (180×32)
.pill--panel            -- panel 模式 (380×380)
.pill--notif            -- notif 模式 (320×120)
```

## 7. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 独立 Pill 组件 | 复用 Overlay | Pill 更轻量，适合不需要拖拽吸附的独立使用场景 |
| 固定圆角 20px | 随模式变化 | 三种尺寸差异不大，统一 20px 保持视觉一致 |

## 8. 实现验证清单

- [x] notch 180×32, panel 380×380, notif 320×120
- [x] 圆角 20px (所有模式)
- [x] 玻璃态背景 + `::before` 顶边高光
- [x] 弹簧 (300/30/0.8) 模式切换
- [x] `contain: paint; isolation: isolate` 渲染隔离
- [x] 窗口大小同步 16ms 节流
- [x] `npm run build` 通过
