# NotchRow 紧凑通知条 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

NotchRow 是悬浮条始终可见的紧凑行，显示在 Overlay 的 32px 条内。职责：
- 显示当前活跃 Agent 的状态指示器 (BarsGlyph / StatusDot)
- 显示 Agent 图标和名称标签
- 显示会话计数等右侧扩展信息
- 作为展开面板的触发器（点击后展开）

在组件树中位于 Overlay 之下，包含 BarsGlyph、AgentDot、Label、RightSlot。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| 高度 | 32px (继承自 bar) |
| 内边距 | 0 10px |
| 子元素间距 | 6px |
| Agent 图标尺寸 | 14×14px |
| BarsGlyph 尺寸 | 24×24px |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 背景 | 透明 (继承 glass-bg) | — |
| 标签文字 | `var(--paper)` | `#f1ead9` |
| 次级信息 | `var(--ink-soft)` | `rgba(241, 234, 217, 0.55)` |
| 计数 chip | `var(--bg-soft)` 背景 | `rgba(255, 255, 255, 0.025)` |
| 分隔线 | `var(--line)` | `rgba(255, 255, 255, 0.08)` |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 | 颜色 |
|------|------|------|------|------|
| Agent 名称 | `var(--font-ui)` | 12px | 500 | `var(--paper)` |
| 状态文本 | `var(--font-ui)` | 10px | 400 | `var(--ink-soft)` |
| 计数 | `var(--font-mono)` | 10px | 400 | `var(--ink-mute)` |

## 3. 状态与变体

| 状态 | 视觉处理 | 触发条件 |
|------|---------|---------|
| default (无 Agent) | BarsGlyph idle 模式, 显示 "Vibe Island" | 没有活跃会话 |
| active (有 Agent) | BarsGlyph 动画 + Agent 名称 + 会话计数 | 有活跃会话 |
| running | BarsGlyph running 动画 (蓝色条跳动) | Agent 状态为 running |
| waitingForApproval | BarsGlyph waiting 模式 (点脉冲) | Agent 等待审批 |
| completed | BarsGlyph done 模式 (对勾动画) | Agent 完成 |
| hover | 背景微亮, cursor: pointer | 鼠标悬停 |

## 4. 动画规格

### 4.1 Framer Motion 弹簧

不适用 — NotchRow 本身不触发弹簧动画，动画由 BarsGlyph 内部处理。

### 4.2 CSS 过渡

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| hover 背景 | background-color | 120ms | ease |
| chip 出现/消失 | opacity | 150ms | ease-in-out |

## 5. 组件 API

### 5.1 Props

```typescript
interface NotchRowProps {
  // NotchRow 通过 store 读取状态，不接收外部 props
}
```

### 5.2 Store 集成

| Store | Selector | 用途 |
|-------|----------|------|
| `useSessionsStore` | `(s) => s.sessions` | 会话计数 |
| `useSessionsStore` | `(s) => s.activeSessionId` | 活跃会话的 Agent 名称 |
| `useSessionsStore` | Agent 状态 | 驱动 BarsGlyph 模式 |

### 5.3 IPC 调用

无直接 IPC 调用。

## 6. CSS / BEM 类名结构

```
.notch-row                   -- 根元素 (flex row, 32px 高)
.notch-row__glyph            -- BarsGlyph 容器
.notch-row__agent-dot        -- Agent 颜色点
.notch-row__agent-icon       -- Agent 图标 (14x14)
.notch-row__label            -- Agent 名称标签
.notch-row__spacer           -- 弹性间距
.notch-row__right            -- 右侧区域
.notch-row__chip             -- 计数 chip
.notch-row__count            -- 会话数量
```

## 7. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| BarsGlyph 替代纯文字 | 仅显示文字标签 | BarsGlyph 提供一目了然的状态感知，不需要读文字 |
| 14px Agent 图标 | 更大图标 | 32px 条内空间有限，14px 平衡可识别性和空间 |
| 等宽数字计数 | 比例字体 | 等宽字体让计数变化时不产生布局抖动 |
| 点击整行展开 | 仅点击 V 形 | 整行可点击符合悬浮条的使用直觉 |

## 8. 实现验证清单

- [x] Agent 名称使用 `var(--paper)`, 字号 12px
- [x] 内边距 0 10px, 子元素间距 6px
- [x] Agent 图标 14×14px
- [x] BarsGlyph 24×24px
- [x] hover 过渡 120ms ease
- [x] CSS 使用 BEM 命名
- [x] `data-testid` 已添加
- [x] `npm run build` 通过
