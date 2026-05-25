# Overlay 主面板 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/flows/master-interaction-flow.html](../artifacts/flows/master-interaction-flow.html), [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

Overlay 是 Vibe Island 的核心容器组件，负责：
- 管理紧凑条 (NotchRow) 和展开面板之间的模式切换
- 处理窗口拖拽和屏幕边缘吸附
- 响应 Agent 状态变化自动展开/收缩
- 在审批聚焦模式下重组面板布局

在组件树中位于 AnimatedOverlay 之下，是 NotchRow、SessionList、ApprovalPanel、SettingsPanel 的父级编排者。

## 2. 视觉规格

### 2.1 布局与尺寸

| 模式 | 宽度 | 高度 | 内边距 | 圆角 |
|------|------|------|--------|------|
| compact | 180px | 32px | 14px | 16px |
| expanded | 600px | 400~720px (自适应) | 0 | 22px |
| approval-focus | 600px | 720px | 0 | 22px |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 背景 | `var(--glass-bg)` | `rgba(13, 13, 15, 0.85)` |
| 边框 | `var(--glass-border)` | `rgba(255, 255, 255, 0.06)` |
| 阴影 | `var(--glass-shadow)` | `0 2px 16px rgba(0,0,0,0.32)` |
| 顶边高光 | `::before` 伪元素 | `rgba(255,255,255,0.06) → 0.10 → 0.06` |
| 分隔线 | `var(--line)` | `rgba(255, 255, 255, 0.08)` |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 | 颜色 |
|------|------|------|------|------|
| 标题 | `var(--font-ui)` | 13px | 600 | `var(--paper)` |
| 正文 | `var(--font-ui)` | 13px | 400 | `var(--paper)` |
| 次级信息 | `var(--font-ui)` | 11px | 400 | `var(--ink-soft)` |
| 代码/数据 | `var(--font-mono)` | 10px | 400 | `var(--ink-mute)` |

### 2.4 玻璃态参数

| 属性 | 值 |
|------|-----|
| backdrop-filter | `var(--glass-blur)` — `blur(24px)` |
| background | `var(--glass-bg)` — `rgba(13, 13, 15, 0.85)` |
| border | `var(--glass-border)` — `rgba(255, 255, 255, 0.06)` |
| box-shadow | `var(--glass-shadow)` |
| 渲染隔离 | `contain: paint; isolation: isolate` |
| 圆角裁剪 | `-webkit-mask-image: -webkit-radial-gradient(white, black)` |

## 3. 状态与变体

| 状态 | CSS 类名 | 视觉处理 | 触发条件 |
|------|---------|---------|---------|
| compact | `.overlay--compact` | 180×32px, 圆角16px, 仅显示 NotchRow | 默认 / 用户点击 Chevron 收起 |
| expanded | `.overlay--expanded` | 600×400~720px, 圆角22px, 显示面板内容 | 用户点击 NotchRow / 进入 running |
| approval-focus | `.overlay--approval-mode` | 600×720px, ApprovalPanel 突出显示 | waitingForApproval 状态进入 |
| snapped-top | `.overlay--snapped-top` | 吸附到屏幕顶部 | 拖拽至顶部边缘 |
| snapped-bottom | `.overlay--snapped-bottom` | 吸附到屏幕底部 | 拖拽至底部边缘 |

## 4. 动画规格

### 4.1 Framer Motion 弹簧

| 过渡 | stiffness | damping | mass | 约时长 |
|------|-----------|---------|------|--------|
| compact → expanded | 300 | 30 | 0.8 | ~300ms |
| expanded → compact | 300 | 30 | 0.7 | ~250ms |
| 拖拽吸附 | 300 | 30 | 1.0 | ~300ms |
| 审批聚焦展开 | 300 | 30 | 0.8 | ~300ms |

### 4.2 CSS 过渡

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| 模式切换 | 所有属性 | 150ms | ease-in-out |
| 面板内容 | max-height, opacity | 300ms | ease |

### 4.3 GPU 加速

- [x] `contain: paint; isolation: isolate` 声明
- [x] `-webkit-mask-image` 圆角裁剪 GPU 合成
- [x] 动画元素使用 Framer Motion (自动管理 GPU 层)
- [x] 窗口大小同步 16ms 节流

## 5. 组件 API

### 5.1 Props

```typescript
// Overlay 是顶层组件，无外部 props
// 通过 Zustand store 读取所有状态
```

### 5.2 Store 集成

| Store | Selector | 用途 |
|-------|----------|------|
| `useSessionsStore` | `(s) => s.sessions` | 读取会话列表 |
| `useSessionsStore` | `(s) => s.activeSessionId` | 当前活跃会话 |
| `useSessionsStore` | `(s) => s.approvalRequests` | 待审批请求 |
| `useSessionsStore` | `(s) => s.overlayMode` | compact/expanded/approval |
| `useConfigStore` | 弹簧/尺寸 getter | 动画参数 |

### 5.3 IPC 调用

| 命令 | 调用时机 | 参数 |
|------|---------|------|
| `update_overlay_size` | 动画帧 (16ms throttle) | `{ width, height }` |
| `set_window_position` | 拖拽结束 | `{ x, y }` |

## 6. 加载、空数据、错误状态

| 状态 | 视觉处理 |
|------|---------|
| 加载中 | 玻璃态背景 + 简洁 loading spinner |
| 无会话 | NotchRow 显示默认 idle 状态 (灰色点 + "Vibe Island") |
| 错误 | `.overlay__error` 显示错误图标 + 简要信息 |

## 7. CSS / BEM 类名结构

```
.overlay                            -- 根容器
.overlay__shell                     -- 圆角裁切层 (mask-image)
.overlay__bar                       -- 紧凑条包装器 (32px 高)
.overlay__panel                     -- 可展开面板内容区
.overlay__error                     -- 错误状态
.overlay__error-icon                -- 错误图标
.overlay__spinner                   -- 加载指示器
.overlay__approval-focus            -- 审批聚焦内容区
.overlay__approval-context          -- 审批上下文信息
.overlay__approval-context-label    -- 审批上下文标签
.overlay--compact                   -- 紧凑模式修饰符
.overlay--expanded                  -- 展开模式修饰符
.overlay--snapped-top               -- 顶部吸附
.overlay--snapped-bottom            -- 底部吸附
.overlay--approval-mode             -- 审批聚焦模式
```

## 8. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 玻璃态背景 | 纯色背景 / 渐变 | 玻璃态与悬浮窗定位一致，透过 overlay 可见桌面内容 |
| 圆角随模式变化 | 固定圆角 | compact 16px 更像 pill，expanded 22px 更像面板 |
| 审批自动展开 | 手动展开 | 审批需要即时关注，自动展开减少操作步骤 |
| 顶边内高光 | 无高光 | 微妙高光增加玻璃材质感，`::before` 伪元素实现 |
| `contain: paint` 隔离 | 不隔离 | 确保圆角裁切在 GPU 合成层正确渲染 |

## 9. 实现验证清单

- [x] 颜色与规格 2.2 匹配
- [x] 尺寸与规格 2.1 匹配（compact/expanded/approval-focus 三种模式）
- [x] 所有状态已实现（规格 3: compact/expanded/approval-focus/snapped-top/snapped-bottom）
- [x] 弹簧参数与规格 4.1 匹配
- [x] CSS 使用 BEM 命名（无 inline style）
- [x] 窗口大小同步 16ms 节流
- [x] 交互元素有 `data-testid` 属性
- [x] `npm run build` 通过
- [x] 渲染隔离 `contain: paint; isolation: isolate` 已声明
