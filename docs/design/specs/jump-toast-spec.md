# JumpToast 跳转提示 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/flows/master-interaction-flow.html](../artifacts/flows/master-interaction-flow.html)

---

## 1. 目的

JumpToast 是一个浮层通知，显示终端跳转操作的反馈信息。短暂出现后自动消失，提供非阻塞的操作确认。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| 最大宽度 | 280px |
| 内边距 | 10px 14px |
| 圆角 | 10px |
| 显示时长 | 2.5s |
| 位置 | Overlay 内浮层，水平居中 |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 背景 | `var(--glass-bg)` | `rgba(13, 13, 15, 0.85)` |
| 边框 | `var(--glass-border)` | `rgba(255, 255, 255, 0.06)` |
| 文字 | `var(--paper)` | `#f1ead9` |
| 详情文字 | `var(--ink-soft)` | `rgba(241, 234, 217, 0.55)` |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 |
|------|------|------|------|
| 标题 | `var(--font-ui)` | 12px | 500 |
| 路径 | `var(--font-mono)` | 10px | 400 |

## 3. 状态与变体

| 状态 | 视觉处理 |
|------|---------|
| 出现 | 从下方滑入 + opacity 淡入 |
| 停留 | 静态显示 2.5s |
| 消失 | 向下滑出 + opacity 淡出 |
| success | 正常显示 |
| error | 错误颜色 (`var(--phase-approval)`) 强调 |

## 4. 动画规格

| 过渡 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| enter | opacity + translateY | 200ms | springSmooth |
| exit | opacity + translateY | 200ms | ease-out |

## 5. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 浮层而非独立通知窗口 | Windows 通知 | 浮层在 overlay 上下文内，视觉连贯 |
| 2.5s 显示时长 | 更长/更短 | 足够阅读路径信息，不过分干扰 |
| 底部滑入 | 顶部弹出 | 底部不会遮挡 NotchRow |

## 6. 实现验证清单

- [x] 280px 最大宽度, 圆角 10px
- [x] 玻璃态背景 + 边框
- [x] enter/exit 动画 200ms
- [x] 2.5s 后自动消失
- [x] `npm run build` 通过
