# [组件名称] 设计规格

> **Status**: draft | approved | implemented
> **日期**: YYYY-MM-DD
> **关联产物**: [链接到 ../artifacts/ 下的原型文件]

---

## 1. 目的

- 解决什么用户问题？
- 在组件树中的位置（父组件是谁、替代/扩展现有哪个组件）？
- 与哪些现有组件交互？

## 2. 视觉规格

### 2.1 布局与尺寸

| 模式 | 宽度 | 高度 | 内边距 | 圆角 |
|------|------|------|--------|------|
| compact | --px | --px | --px | --px |
| expanded | --px | --px | --px | --px |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 背景 | `var(--ink)` | `#0d0d0f` |
| 主文字 | `var(--paper)` | `#f1ead9` |
| 次级文字 | `var(--ink-soft)` | `rgba(241,234,217,0.55)` |
| 分隔线 | `var(--line)` | `rgba(255,255,255,0.08)` |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 | 颜色 |
|------|------|------|------|------|

### 2.4 玻璃态参数

| 属性 | 值 |
|------|-----|
| backdrop-filter | `var(--glass-blur)` — `blur(24px)` |
| background | `var(--glass-bg)` — `rgba(13, 13, 15, 0.85)` |
| border | `var(--glass-border)` — `rgba(255, 255, 255, 0.06)` |
| box-shadow | `var(--glass-shadow)` |

## 3. 状态与变体

| 状态 | 视觉处理 | 触发条件 |
|------|---------|---------|
| default | — | 组件挂载，无特殊条件 |
| hover | — | 光标进入可交互区域 |
| active/pressed | — | mousedown |
| disabled | — | — |

## 4. 动画规格

### 4.1 Framer Motion 弹簧

| 过渡 | stiffness | damping | mass | 约时长 |
|------|-----------|---------|------|--------|
| enter | 300 | 30 | 0.8 | ~300ms |
| exit | 300 | 30 | 0.7 | ~250ms |

### 4.2 CSS 过渡

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| hover | opacity, transform | 120ms | ease |

### 4.3 GPU 加速

- [ ] 动画元素声明 `will-change`
- [ ] 动画元素添加 `translateZ(0)` 提升合成层

## 5. 组件 API

### 5.1 Props

```typescript
interface ComponentNameProps {
  // 列出所有 prop：名称、类型、说明
}
```

### 5.2 Store 集成

| Store | Selector | 用途 |
|-------|----------|------|
| `useSessionsStore` | `(s) => s.sessions` | 读取会话列表 |

### 5.3 IPC 调用

| 命令 | 调用时机 | 参数 |
|------|---------|------|

## 6. 加载、空数据、错误状态

| 状态 | 视觉处理 |
|------|---------|
| 加载中 | — |
| 空数据 | — |
| 错误 | — |

## 7. CSS / BEM 类名结构

```
.component-name                      -- 根元素
.component-name__element             -- 子元素
.component-name__element--modifier   -- 变体
```

## 8. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| — | — | — |

## 9. 实现验证清单

标记实现完成前逐项检查：

- [ ] 颜色与规格 2.2 匹配
- [ ] 尺寸与规格 2.1 匹配（compact 和 expanded 两个模式）
- [ ] 所有状态已实现（规格 3）
- [ ] 弹簧参数与规格 4.1 匹配
- [ ] CSS 使用 BEM 命名（无 inline style）
- [ ] Store 集成与规格 5.2 匹配
- [ ] IPC 调用与规格 5.3 匹配
- [ ] 交互元素有 `data-testid` 属性
- [ ] `node scripts/check-design-compliance.js` 通过 (exit 0)
- [ ] `node scripts/check-design-compliance.js` 通过 (exit 0)
- [ ] `npm run build` 通过
- [ ] 若修改了配置值，Rust 和前端两端已同步
