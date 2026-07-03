# Design System Specification

## Purpose

定义 Vibe Island 视觉与动画的行为契约：玻璃态样式、GPU 加速、Framer Motion 弹簧参数范围、CSS 命名。
与 `config-sync` 规格互补 —— 本规格管「视觉/动画规则」，`config-sync` 管「Rust↔前端默认值同步」。

实现参考：`frontend/src/components/`（CSS）、`frontend/src/config/animation.ts`、`frontend/src/index.css`、`docs/architecture/animation-design.md`。

## Requirements

### Requirement: Glass Styling

UI 表面 MUST (MUST) 用玻璃态：背景取自 `var(--glass-bg)`、模糊取自 `var(--glass-blur)`（`backdrop-filter`）；不得硬编码 RGBA 值。

#### Scenario: 新增面板背景

- **WHEN** 新组件需要半透明背景
- **THEN** MUST 用 `var(--glass-bg)` + `backdrop-filter: var(--glass-blur)`，不得写死 `rgba(...)`

### Requirement: GPU Acceleration for Animated Elements

需要高性能动画的元素 MUST (MUST) 添加 `will-change` + `translateZ(0)` 触发 GPU 合成层。

#### Scenario: StatusDot 脉动动画

- **WHEN** `StatusDot` 执行高频脉冲动画
- **THEN** CSS MUST 含 `will-change` 与 `translateZ(0)`，避免主线程重绘卡顿

### Requirement: Framer Motion Spring Parameter Range

Framer Motion 弹簧参数 MUST (MUST) 落在：`stiffness` 200-300、`damping` 20-30、`mass` 1（展开/收缩默认 300/25）；动画时长 MUST (MUST) 控制在 200-500ms。具体默认值的 Rust↔前端同步见 `config-sync` 规格。

#### Scenario: 弹簧参数超出范围

- **WHEN** 开发者把展开动画设为 `stiffness: 50`
- **THEN** 视为偏离设计契约（过软），MUST 调整回 200-300 范围或有明确设计理由

### Requirement: CSS BEM Naming

CSS 类名 MUST (MUST) 用 BEM 命名（`.block__element--modifier`，如 `.overlay__bar`、`.status-dot--active`）。组件 CSS 文件 MUST (MUST) 与组件同目录。SHOULD (SHOULD) 避免 inline style。

#### Scenario: 新增组件样式

- **WHEN** 给 `ApprovalPanel` 加一个活跃按钮样式
- **THEN** 类名 MUST 如 `.approval-panel__btn--active`，不得用 `.activeButton` 或 inline style
