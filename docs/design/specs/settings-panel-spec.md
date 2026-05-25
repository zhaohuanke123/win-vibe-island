# SettingsPanel 设置面板 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

SettingsPanel 提供用户配置界面，内嵌在 Overlay 展开面板中。支持切换：状态指示器样式、密度、Hook/Pipe 服务器端口、外观偏好。通过点击 PanelHead 的齿轮图标进入。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| 面板宽度 | 自适应 (600px 容器内) |
| 内边距 | 14px |
| 设置项间距 | 12px |
| 标签字号 | 11px |
| 控件高度 | 28px |
| Toggle 开关 | 36×20px |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 标签文字 | `var(--ink-soft)` | `rgba(241, 234, 217, 0.55)` |
| 描述文字 | `var(--ink-mute)` | `rgba(241, 234, 217, 0.30)` |
| 输入框背景 | `rgba(255, 255, 255, 0.04)` | — |
| 输入框边框 | `var(--line)` | — |
| 输入框 focus | `rgba(255, 255, 255, 0.12)` | — |
| Toggle active | `var(--phase-running)` | `#6ea7ff` |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 | 颜色 |
|------|------|------|------|------|
| 设置项标签 | `var(--font-ui)` | 11px | 500 | `var(--ink-soft)` |
| 设置值/输入 | `var(--font-mono)` | 11px | 400 | `var(--paper)` |

## 3. 状态与变体

| 状态 | 视觉处理 | 触发条件 |
|------|---------|---------|
| visible | 面板内容切换到设置 | 点击齿轮图标 |
| hidden | 面板显示会话列表 | 默认 / 返回 |

## 4. 动画规格

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| 内容切换 | opacity, transform | 200ms | ease |

## 5. 组件 API

无外部 props。通过 `useConfigStore` 读写配置。

## 6. CSS / BEM 类名结构

```
.settings-panel                 -- 根容器
.settings-panel__group          -- 设置分组
.settings-panel__item           -- 单设置项
.settings-panel__item-label     -- 标签
.settings-panel__item-control   -- 控件区
```

## 7. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 内嵌而非独立窗口 | 独立窗口 | 设置项少，内嵌减少窗口管理复杂度 |
| 齿轮图标入口 | 独立按钮 | 齿轮是设置通用符号，省空间 |

## 8. 实现验证清单

- [x] 面板内边距 14px, 设置项间距 12px
- [x] 输入框背景/边框/focus 颜色匹配
- [x] Toggle active 色 `var(--phase-running)`
- [x] 内容切换 200ms ease
- [x] CSS 使用 BEM 命名
- [x] `data-testid` 已添加
- [x] `npm run build` 通过
