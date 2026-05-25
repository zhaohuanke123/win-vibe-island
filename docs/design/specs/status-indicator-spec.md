# StatusDot + BarsGlyph 状态指示器 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/canvases/visual-system-canvas.html](../artifacts/canvases/visual-system-canvas.html)

---

## 1. 目的

StatusDot 和 BarsGlyph 是 Vibe Island 的两种核心状态指示器。StatusDot 是 9px 圆点，通过颜色和脉冲动画传达 Agent 状态。BarsGlyph 是 24×24 SVG，通过条高动画和模式切换传达更丰富的状态信息。

两者由 StateIndicator 统一管理，用户可配置选择 dot / bar / glyph / tint 四种变体。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | StatusDot | BarsGlyph |
|------|-----------|-----------|
| 尺寸 | 9×9px | 24×24px |
| 形状 | 圆形 (border-radius: 50%) | 3 条竖线 (rect) |
| 条宽 | — | 2.5px |
| 条圆角 | — | 1.25px |
| 条 x 位置 | — | 5.25, 10.75, 16.25 |

### 2.2 状态颜色映射

| Agent 状态 | StatusDot 颜色 | BarsGlyph 颜色 | CSS 变量 |
|------------|---------------|----------------|----------|
| idle | `#9a958a` | `#9a958a` | `var(--phase-idle)` |
| running | `#6ea7ff` | `#6ea7ff` | `var(--phase-running)` |
| waitingForApproval | `#f4a4a4` | `#f4a4a4` | `var(--phase-approval)` |
| waitingForAnswer | `#ffd58a` | `#ffd58a` | `var(--phase-answer)` |
| completed | `#6fb982` | `#6fb982` | `var(--phase-completed)` |

## 3. 状态与变体

### 3.1 StatusDot 状态

| 状态 | CSS 类名 | 动画 | 视觉处理 |
|------|---------|------|---------|
| idle | `.status-dot--idle` | 无 | 纯色圆点 |
| running | `.status-dot--running` | pulse 1s 周期 | 透明度 1→0.5→1, 发光阴影 |
| approval | `.status-dot--approval` | pulse 0.6s 周期 | 较快脉冲 |
| answer | `.status-dot--answer` | pulse 1.2s 周期 | 较慢脉冲 |
| done | `.status-dot--done` | 无 | 纯色 + 发光阴影 |

### 3.2 BarsGlyph 模式

| 模式 | 视觉处理 | 触发条件 |
|------|---------|---------|
| idle | 条高 [3, 5, 3], 中间条 CSS 呼吸 2.8s | 无活跃 Agent |
| running | SMIL animate 条高循环, 错开 0/0.15/0.30s, 0.9s 周期 | Agent running |
| waiting | 外部条高 10, 中间隐藏, 交叉脉冲 1.8s | 等待审批/回答 |
| done | 对勾 SVG path, stroke-dasharray 描边动画 0.4s | Agent 完成 |

### 3.3 StateIndicator 变体

| 变体 | 对应组件 | 视觉 |
|------|---------|------|
| dot | StatusDot | 9px 圆点 |
| glyph | BarsGlyph | 24×24 SVG |
| bar | 内联色条 | 32×6px 圆角色条 |
| tint | 标签 | 带背景色的文字标签 |

## 4. 动画规格

### 4.1 StatusDot 动画

| 状态 | 动画类型 | 属性 | 时长 | 缓动 |
|------|---------|------|------|------|
| running | CSS pulse | opacity + box-shadow | 1000ms | ease-in-out infinite |
| approval | CSS pulse | opacity + box-shadow | 600ms | ease-in-out infinite |
| answer | CSS pulse | opacity + box-shadow | 1200ms | ease-in-out infinite |

### 4.2 BarsGlyph 动画

| 模式 | 技术 | 参数 |
|------|------|------|
| idle (呼吸) | CSS animation | 中间条 opacity 变化, 2.8s |
| running (跳动) | SMIL `<animate>` | 条高 [4,12,4]→[6,14,6]→[4,10,4], 0.9s, staggered |
| waiting (脉冲) | CSS animation | 外部条交叉 opacity pulse, 1.8s, 中间透明度 0 |
| done (描边) | CSS stroke-dasharray | 对勾路径描边绘制, 0.4s |

### 4.3 GPU 加速

- [x] StatusDot: `transform: translateZ(0)` 提升合成层
- [x] BarsGlyph SVG: 内联 SVG 自动硬件加速
- [x] 动画元素声明 `will-change: opacity`

## 5. 组件 API

### 5.1 Props

```typescript
// StatusDot
interface StatusDotProps {
  phase: AgentPhase;  // idle | running | waitingForApproval | waitingForAnswer | completed
}

// BarsGlyph
interface BarsGlyphProps {
  phase: AgentPhase;
}

// StateIndicator
interface StateIndicatorProps {
  kind: 'dot' | 'glyph' | 'bar' | 'tint';
  phase: AgentPhase;
}
```

### 5.2 Store 集成

| Store | Selector | 用途 |
|-------|----------|------|
| `useSessionsStore` | Agent 的 phase 字段 | 决定颜色和动画模式 |
| `useConfigStore` | `(s) => s.stateIndicator` | 选择指示器变体 |

## 6. CSS / BEM 类名结构

```
.status-dot                  -- 根元素 (9×9px circle)
.status-dot--idle            -- idle 修饰符
.status-dot--running         -- running 修饰符
.status-dot--approval        -- approval 修饰符
.status-dot--answer          -- answer 修饰符
.status-dot--done            -- done 修饰符
```

## 7. 设计决策日志

| 决策 | 备选方案 | 选择理由 |
|------|---------|---------|
| dot + glyph 双指示器 | 仅一种 | dot 简洁适合空间受限, glyph 信息更丰富适合偏好视觉的用户 |
| SMIL 动画 (glyph) | CSS animation / JS | SMIL 在 SVG 内声明，性能好、与组件生命周期解耦 |
| 四种变体可配置 | 固定一种 | 不同用户偏好不同，可配置增加灵活性 |
| 脉冲周期随状态变化 | 统一周期 | approval 快脉冲 (0.6s) 增加紧迫感，idle 无动画省资源 |

## 8. 实现验证清单

- [x] StatusDot 9×9px, border-radius 50%
- [x] 五种状态颜色与 CSS 变量匹配
- [x] running pulse 1s / approval pulse 0.6s / answer pulse 1.2s
- [x] BarsGlyph running SMIL 0.9s staggered
- [x] BarsGlyph done 对勾描边 0.4s
- [x] GPU 加速声明
- [x] CSS 使用 BEM 命名
- [x] `data-testid` 已添加
- [x] `npm run build` 通过
