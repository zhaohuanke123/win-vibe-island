# SessionList + SessionRow 会话列表 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/flows/master-interaction-flow.html](../artifacts/flows/master-interaction-flow.html), [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

SessionList 显示 Overlay 展开面板中的会话列表。每个 SessionRow 代表一个 AI Agent 会话，显示其状态、名称、工具执行信息和展开详情入口。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| SessionRow 内边距 | 11px 12px 11px 16px |
| SessionRow 最小高度 | 与内容自适应 |
| 圆角 | 内嵌在 22px 面板内 |
| V 形图标 | 22×22px (展开), 20×20px (紧凑) |
| 状态点 | 9×9px |
| 可滚动区域 | 面板内容区内 |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 行背景 | 透明 (默认) | — |
| 行 hover | `var(--bg-soft)` | `rgba(255, 255, 255, 0.025)` |
| 行 active | `rgba(255, 255, 255, 0.04)` | — |
| 文字 | `var(--paper)` | `#f1ead9` |
| 次级文字 | `var(--ink-soft)` | `rgba(241, 234, 217, 0.55)` |
| 行分隔线 | `var(--line)` | `rgba(255, 255, 255, 0.08)` |
| V 形 | `var(--ink-mute)` | `rgba(241, 234, 217, 0.30)` |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 | 颜色 |
|------|------|------|------|------|
| Agent 名称 | `var(--font-ui)` | 12px | 600 | `var(--paper)` |
| 状态文本 | `var(--font-ui)` | 10px | 400 | `var(--ink-soft)` |
| 工具信息 | `var(--font-mono)` | 10px | 400 | `var(--ink-mute)` |

## 3. 状态与变体

| 状态 | 视觉处理 | 触发条件 |
|------|---------|---------|
| default | 透明背景, 底部 1px line 分隔 | 行挂载 |
| hover | `bg-soft` 背景高亮 | 鼠标悬停 |
| active/selected | `rgba(255,255,255,0.04)` 背景 | 当前查看的会话 |
| expanded | Chevron 旋转 180°, SessionDetail 显示 | 点击行 |
| collapsed | Chevron 0° | 默认 |

## 4. 动画规格

### 4.1 CSS 过渡

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| 行 hover | background-color | 150ms | ease-in-out |
| V 形旋转 | transform | 160ms | ease |
| 详情展开/收起 | max-height, opacity | 300ms | ease |

### 4.2 GPU 加速

- [x] V 形: `transform: translateZ(0)`
- [x] 行背景过渡: 仅 background-color (无需 GPU 层)

## 5. 组件 API

### 5.1 Props

```typescript
interface SessionRowProps {
  sessionId: string;
}

interface SessionListProps {
  // 通过 store 读取 sessions 数组
}
```

### 5.2 Store 集成

| Store | Selector | 用途 |
|-------|----------|------|
| `useSessionsStore` | `(s) => s.sessions` | 会话列表数据 |
| `useSessionsStore` | `(s) => s.activeSessionId` | 高亮当前活跃行 |

## 6. CSS / BEM 类名结构

```
.session-list                   -- 列表容器 (可滚动)
.session-row                    -- 单行 (flex row)
.session-row__status            -- 左侧状态区 (dot + glyph)
.session-row__info              -- 中间信息区
.session-row__info-name         -- Agent 名称
.session-row__info-status       -- 状态文本
.session-row__tools             -- 工具执行信息 (等宽)
.session-row__chevron           -- 右侧 V 形
.session-row--active            -- 选中行
.session-row--expanded          -- 已展开行
```

## 7. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 内边距左侧 16px 不对称 | 对称内边距 | 左侧多 4px 给状态点留呼吸空间 |
| V 形 160ms ease | 更快/更慢 | 160ms 配合旋转动画的自然感知速度 |
| 等宽字体显示工具信息 | UI 字体 | 工具/命令更适合等宽字体，增强可读性 |
| hover 仅背景色变化 | 边框/阴影变化 | 背景色过渡最轻量，不引起布局重排 |

## 8. 实现验证清单

- [x] 行内边距 11px 12px 11px 16px
- [x] hover 背景 `var(--bg-soft)`
- [x] active 背景 `rgba(255,255,255,0.04)`
- [x] V 形 22×22px (展开), 20×20px (紧凑)
- [x] V 形旋转 160ms ease
- [x] 详情展开 300ms ease
- [x] 行分隔线 `var(--line)`
- [x] CSS 使用 BEM 命名
- [x] `data-testid` 已添加
- [x] `npm run build` 通过
