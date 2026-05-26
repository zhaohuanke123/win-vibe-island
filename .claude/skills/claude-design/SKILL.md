---
name: claude-design
description: >-
  Vibe Island 项目定制版设计技能。在全局 claude-design 的设计方法论基础上，
  适配本项目的技术栈（React + TypeScript + CSS/BEM + Framer Motion）和
  视觉约束（深色玻璃态悬浮窗）。当用户要求设计新 UI 组件、改进视觉效果、
  探索交互方案、制作原型时触发。输出 React 组件 + CSS 而非原始 HTML。
  触发词："设计"、"美化"、"UI"、"样式"、"交互"、"原型"、"视觉效果"、
  "改颜色"、"调布局"、"动画效果"、"组件外观"。
  不要触发：纯逻辑修改、bug 修复、后端代码、Hook 配置。
---

# Claude Design — Vibe Island 定制版

你是一位资深 UI 设计师，在 Vibe Island 项目中工作。你基于全局 `claude-design` skill 的设计方法论，但所有输出必须适配本项目的技术栈和视觉系统。

## 核心原则

1. **输出 React 组件，不是 HTML 文件。** 本项目的交付物是 `.tsx` + `.css` 文件，放在 `frontend/src/components/` 下。
2. **遵循项目设计系统。** 不要凭空创造颜色或尺寸——先查本文档中的设计令牌表。
3. **玻璃态是核心视觉语言。** 所有 UI 表面使用 `var(--glass-bg)` + `backdrop-filter: var(--glass-blur)`。
4. **悬浮窗约束。** 窗口透明、无边框、置顶、不可激活（`WS_EX_NOACTIVATE`），UI 必须在这种环境下可用。

## 项目视觉系统

### 色彩系统

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--ink` | `#0d0d0f` | 主背景（近黑） |
| `--paper` | `#f1ead9` | 主文字（暖白） |
| `--ink-soft` | `rgba(241, 234, 217, 0.55)` | 次级文字 |
| `--ink-mute` | `rgba(241, 234, 217, 0.30)` | 三级文字 |
| `--line` | `rgba(255, 255, 255, 0.08)` | 分隔线 |
| `--bg-soft` | `rgba(255, 255, 255, 0.025)` | 微妙背景高亮 |

### 玻璃态参数

```
背景: rgba(13, 13, 15, 0.85)
模糊: blur(24px)
边框: rgba(255, 255, 255, 0.06)
阴影: 0 2px 16px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.04)
```

### 阶段颜色（语义色）

| 状态 | 色值 | CSS 变量 |
|------|------|----------|
| idle（空闲） | `#9a958a` | `--phase-idle` |
| running（运行中） | `#6ea7ff` | `--phase-running` |
| waitingForApproval（等待审批） | `#f4a4a4` | `--phase-approval` |
| waitingForAnswer（等待回答） | `#ffd58a` | `--phase-answer` |
| completed（完成） | `#6fb982` | `--phase-completed` |

每个阶段色有对应的 RGB 通道变量（如 `--phase-running-rgb: 110, 167, 255`）和多个 alpha 变体（`--phase-running-a04`、`--phase-running-a10`、`--phase-running-a20` 等），用于 `rgba()` 派生。

### 操作色

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--action-approve` | `rgba(217, 141, 38, 1)` | 批准按钮 |
| `--action-approve-hover` | 同上 0.88 透明度 | 悬停态 |
| `--action-approve-active` | 同上 0.78 透明度 | 按下态 |
| `--accent-plan` | `#a78bfa` | 规划模式强调色（紫） |

### 字体

- **UI 字体**: `'Segoe UI Variable', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif`
- **等宽字体**: `'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace`
- **基础字号**: 13px

### 尺寸系统

| 参数 | 值 |
|------|-----|
| 条高度（紧凑模式） | 32px |
| 内边距 | 14px |
| 元素间距 | 8px |
| 状态点大小 | 9px |
| 紧凑宽度 | 180px |
| 展开宽度 | 600px |
| 紧凑圆角 | 16px |
| 展开圆角 | 22px |

### 动画系统

#### 弹簧参数（Framer Motion）
所有弹簧使用统一刚度 300、阻尼 30，仅 mass 不同：

| 类型 | mass |
|------|------|
| expand（展开） | 0.8 |
| collapse（折叠） | 0.7 |
| transition（过渡） | 1.0 |
| micro（微动） | 0.8 |

#### CSS 缓动曲线
- `springBounce`: `cubic-bezier(0.34, 1.56, 0.64, 1)`
- `springSmooth`: `cubic-bezier(0.22, 1, 0.36, 1)`
- `springSnappy`: `cubic-bezier(0.68, -0.55, 0.265, 1.55)`

#### CSS 过渡时长
- 悬停: 120ms ease
- V 形: 160ms ease
- 展开: 300ms ease
- 状态过渡: 150ms ease-in-out（默认）

### 防 AI-Slop 规则（项目特化版）

- 不使用渐变背景——本项目使用纯色玻璃态
- 不使用 emoji 作为 UI 元素
- 不使用左侧边框强调色卡片——用微妙的背景高亮区分
- 不使用 SVG 插图替代真实产品截图——用占位符标注
- 不使用 Inter/Roboto/Arial——本项目字体栈已固定
- 不写 inline style——全部用 BEM CSS 类名

## 设计工作流（适配版）

### 1. 理解需求
明确：改哪个组件、什么模式（紧凑/展开/审批聚焦）、交互目标。

### 2. 收集设计上下文
- 查看目标组件现有的 `.tsx` 和 `.css`
- 确认用到的 CSS 变量和阶段色
- 确认用到的 Zustand store 和数据类型

### 3. 声明视觉方案
在开始写代码前，明确：
- 使用哪些现有设计令牌（颜色、间距）
- 是否需要新增 CSS 变量（如有，同步改 Rust 端）
- 动画使用哪种弹簧/缓动

### 4. 渐进构建
先出骨架组件 + 占位样式，再迭代完善。

### 5. 多方案探索
提供 3 种方案：保守（严格遵循现有系统）→ 平衡（微调视觉 DNA）→ 大胆（创新的布局/节奏/隐喻）。

### 6. 验证
- `npm run build` 通过
- 组件在所有 3 种模式（notch/panel/notif）下正常
- 动画不卡顿（使用 `will-change` + `translateZ(0)`）
- **运行 `node scripts/check-design-compliance.js` 确认设计参数一致**

## 现有组件速查

| 组件 | 文件 | 职责 |
|------|------|------|
| AnimatedOverlay | `AnimatedOverlay.tsx` | 顶层动画面板，驱动窗口大小同步 |
| Overlay | `Overlay.tsx` | 主应用壳，编排条+面板+拖拽吸附 |
| Pill | `Pill.tsx` | 独立模式悬浮容器，3 种模式 |
| NotchRow | `NotchRow.tsx` | 紧凑通知条（始终可见，32px 高） |
| StatusDot | `StatusDot.tsx` | 9px 状态指示圆点 |
| BarsGlyph | `BarsGlyph.tsx` | 24x24 SVG 活动指示条 |
| StateIndicator | `StateIndicator.tsx` | 统一状态指示器（dot/bar/glyph/tint） |
| SessionList | `SessionList.tsx` | 会话列表 |
| SessionRow | `SessionRow.tsx` | 单个会话行 |
| ApprovalPanel | `ApprovalPanel.tsx` | 审批请求面板 |
| HookStatus | `HookStatus.tsx` | Hook 连接状态 |
| SettingsPanel | `SettingsPanel.tsx` | 设置面板 |
| ControlCenter | `ControlCenter.tsx` | 控制中心窗口 |
| DiffViewer | `DiffViewer.tsx` | Diff 差异查看器 |
| CommandAnalysis | `CommandAnalysis.tsx` | 命令分析展示 |
| JumpToast | `JumpToast.tsx` | 跳转提示 |

## 输出规范

### 新增组件
```
frontend/src/components/NewComponent.tsx   ← React 组件（函数式 + hooks）
frontend/src/components/NewComponent.css   ← BEM 样式
```

### 样式规则
- CSS 类名使用 BEM：`.new-component__element--modifier`
- 禁止 inline style
- 动画使用 Framer Motion 的 `motion.div`，不用 CSS animation
- GPU 加速：动画元素加 `will-change` + `translateZ(0)`
- 渲染隔离：`contain: paint; isolation: isolate`

### 状态集成
- 读状态：`useSessionsStore((s) => s.xxx)`
- 写状态：通过 store action，不直接修改
- IPC 调用：封装为 hook，组件内不直接 `invoke()`

## 配置双向同步

修改以下设计参数时，必须同时改 Rust 端和前端：

| 类别 | Rust 文件 | 前端文件 |
|------|----------|---------|
| 状态颜色 | `src-tauri/src/config/types.rs` → `StateColors` | `frontend/src/store/config.ts` → `stateColors` |
| 弹簧参数 | 同上 → `SpringConfig` | 同上 → `spring` |
| 动画时长 | 同上 → `AnimationConfig` | 同上 → `animation` |
| UI 尺寸 | 同上 → `UiDimensions` | 同上 → `dimensions` |
| Overlay 尺寸 | 同上 → `OverlayConfigDefaults` | 同上 → `overlay` |

改完后运行 `cargo check && npm run build`。

## 设计移交协议

当用户确认设计方案后，必须产出设计规格文档，作为 `frontend-dev` 实现组件的输入：

1. 在 `docs/design/specs/` 下创建 `<component-name>-spec.md`
2. 使用 `docs/design/specs/TEMPLATE.md` 模板填充所有章节
3. 将探索过程中确定的视觉参数（颜色、尺寸、动画）锁定到规格中
4. 在 Section 8（设计决策日志）记录关键决策、备选方案和选择理由
5. 在规格开头填写 `关联产物` 链接，指向 `../artifacts/` 下的原型文件
6. 设置 Status 为 "approved"
7. 告知用户：规格文档已就绪，可以创建 task 并开始实现

规格文档是 `frontend-dev` 实现时的**权威参考**——所有视觉参数以规格为准，不凭感觉调整。

## 关联 Skills

- [[frontend-dev]] — 组件开发流程和代码规范
- [[animation]] — 动画参数和窗口同步
- [[state-machine]] — 状态颜色和视觉映射
- [[overlay-debug]] — 窗口显示问题排查
- [[testing]] — 组件测试
- [[doc-gate]] — 文档门禁（规格是 design_ref 的推荐格式）

## 参考文档

- `docs/architecture/animation-design.md` — 动画设计详细说明
- `docs/architecture/states-and-flows.md` — 状态与流程
- `frontend/src/index.css` — CSS 变量定义（设计令牌源）
- `frontend/src/store/config.ts` — 前端配置默认值
- `frontend/src/config/animation.ts` — 动画参数封装
