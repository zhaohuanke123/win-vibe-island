# ApprovalPanel 审批面板 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/flows/master-interaction-flow.html](../artifacts/flows/master-interaction-flow.html), [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

ApprovalPanel 显示 AI Agent 的工具执行审批请求。当 Agent 状态为 waitingForApproval 时：
- Overlay 自动切换到 approval-focus 模式 (600×720px)
- 审批面板在展开面板中突出显示
- 用户可以 Approve 或 Reject 请求

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| 面板宽度 | 自适应 (600px 容器内) |
| 内边距 | 14px |
| 按钮间距 | 8px |
| 按钮高度 | 28px |
| 按钮圆角 | 8px |

### 2.2 颜色

| 元素 | CSS 变量 | 十六进制后备 |
|------|---------|-------------|
| 面板背景 | 透明 (继承容器) | — |
| 审批项背景 | `var(--bg-soft)` | `rgba(255, 255, 255, 0.025)` |
| 审批项边框 | `var(--line)` | `rgba(255, 255, 255, 0.08)` |
| 工具名称 | `var(--paper)` | `#f1ead9` |
| 工具参数 | `var(--font-mono)`, `var(--ink-soft)` | — |
| **批准按钮** | `var(--action-approve)` | `rgba(217, 141, 38, 1)` |
| 批准按钮 hover | 0.88 透明度 | — |
| 批准按钮 active | 0.78 透明度 | — |
| 批准按钮边框 | `rgba(217, 141, 38, 0.42)` | — |
| **拒绝按钮** | `var(--ink-soft)` | `rgba(241, 234, 217, 0.55)` |
| 拒绝按钮 hover | `rgba(255, 255, 255, 0.08)` | — |

### 2.3 字体

| 元素 | 字体 | 字号 | 字重 | 颜色 |
|------|------|------|------|------|
| 标题 "Approval Required" | `var(--font-ui)` | 12px | 600 | `var(--phase-approval)` |
| 工具名称 | `var(--font-ui)` | 12px | 500 | `var(--paper)` |
| 工具参数 | `var(--font-mono)` | 10px | 400 | `var(--ink-mute)` |
| 按钮文字 | `var(--font-ui)` | 11px | 500 | 见按钮颜色 |

## 3. 状态与变体

| 状态 | 视觉处理 | 触发条件 |
|------|---------|---------|
| default | 审批项列表 + 操作按钮 | 有 pending approval |
| loading | 按钮禁用 + spinner | 等待审批响应 |
| approved | 绿色对勾 + 消失动画 | 用户点击 Approve |
| rejected | 红色叉号 + 消失动画 | 用户点击 Reject |
| timeout | 自动拒绝 + 提示信息 | 审批超时 |
| empty queue | 不显示 (或显示 "No pending approvals") | 无审批项 |

## 4. 动画规格

### 4.1 Framer Motion 弹簧

| 过渡 | stiffness | damping | mass | 约时长 |
|------|-----------|---------|------|--------|
| 审批面板出现 | 300 | 30 | 0.8 | ~300ms |
| 审批项消失 | 300 | 30 | 0.7 | ~250ms |

### 4.2 CSS 过渡

| 元素 | 属性 | 时长 | 缓动 |
|------|------|------|------|
| 按钮 hover | background-color, opacity | 120ms | ease |
| 按钮 press | opacity | 80ms | ease |
| 审批上下文展开 | max-height | 200ms | ease |

### 4.3 GPU 加速

- [x] 按钮: `transform: translateZ(0)`
- [x] 审批清单: `will-change: transform`

## 5. 组件 API

### 5.1 Props

```typescript
interface ApprovalPanelProps {
  // 通过 store 读取审批数据
}
```

### 5.2 Store 集成

| Store | Selector | 用途 |
|-------|----------|------|
| `useSessionsStore` | `(s) => s.approvalRequests` | 待审批队列 |
| `useSessionsStore` | `(s) => s.respondApproval` | 发送审批响应 |

### 5.3 IPC 调用

| 命令 | 调用时机 | 参数 |
|------|---------|------|
| `respond_approval` | 点击 Approve/Reject | `{ tool_use_id, approved: boolean }` |

## 6. CSS / BEM 类名结构

```
.approval-panel                     -- 根容器
.approval-panel__item               -- 单个审批项
.approval-panel__item-header        -- 审批项头部 (工具名)
.approval-panel__item-body          -- 审批项内容 (参数)
.approval-panel__item-context       -- 审批上下文 (文件路径等)
.approval-panel__actions            -- 按钮组
.approval-panel__btn                -- 按钮
.approval-panel__btn--approve       -- 批准按钮
.approval-panel__btn--reject        -- 拒绝按钮
.approval-panel__btn--loading       -- 按钮加载中
.approval-panel__status             -- 审批结果状态
.approval-panel--empty              -- 无审批项
```

## 7. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| 批准/拒绝并排 | 上下排列 | 并排更紧凑，两个按钮水平空间足够 |
| 批准按钮琥珀色 | 绿色 | 琥珀色更中性，不像绿色暗示"正确"，审批是中性判断 |
| 关联审批通过 tool_use_id | 按 session 匹配 | 一个 session 可能有多个并发审批，精确匹配 |
| 审批超时自动拒绝 | 超时自动批准 / 不做处理 | 安全优先：默认拒绝避免未授权操作 |

## 8. 实现验证清单

- [x] 审批项背景 `var(--bg-soft)`, 边框 `var(--line)`
- [x] 批准按钮颜色 `var(--action-approve)`, 边框 `rgba(217,141,38,0.42)`
- [x] 按钮 hover 120ms ease
- [x] 审批出现 spring expand (300/30/0.8)
- [x] `respond_approval` 通过 `tool_use_id` 匹配
- [x] 超时处理已实现
- [x] CSS 使用 BEM 命名
- [x] `data-testid` 已添加
- [x] `npm run build` 通过
