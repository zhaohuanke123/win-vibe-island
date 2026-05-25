# DiffViewer 差异查看器 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/flows/master-interaction-flow.html](../artifacts/flows/master-interaction-flow.html)

---

## 1. 目的

DiffViewer 显示 AI Agent 工具执行前后的文件差异。嵌入在 SessionDetail 中，支持语法高亮和并排/统一视图切换。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| 最大高度 | 300px (可滚动) |
| 行高 | 20px |
| 内边距 | 8px |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 背景 | `rgba(0, 0, 0, 0.2)` | — |
| 添加行 | `rgba(111, 185, 130, 0.15)` | — |
| 删除行 | `rgba(244, 164, 164, 0.15)` | — |
| 行号 | `var(--ink-mute)` | — |
| 代码文字 | `var(--font-mono)`, `var(--ink-soft)` | — |

### 2.3 字体

| 元素 | 字体 | 字号 |
|------|------|------|
| 代码内容 | `var(--font-mono)` | 11px |
| 行号 | `var(--font-mono)` | 10px |

## 3. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 最大高度 300px | 无限高度 | 防止单个 diff 撑满整个面板 |
| 自定义 diff 渲染 | 第三方 diff 库 | 减少依赖，匹配项目风格 |

## 4. 实现验证清单

- [x] 等宽字体 `var(--font-mono)` 11px
- [x] 添加行绿底, 删除行红底
- [x] 最大高度 300px, 可滚动
- [x] `npm run build` 通过
