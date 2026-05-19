---
name: frontend-dev
description: |
  前端 UI 开发。包含组件开发流程、样式规范、Zustand 状态集成和 IPC 对接。
  触发条件：
  - 用户要修改或新增 UI 组件
  - "改UI"、"加个组件"、"调样式"、"改布局"、"前端开发"
  - 修改 Overlay、Panel、Session 相关的显示
  - CSS 样式调整、动画效果
  - Zustand store 数据和 UI 的对接
  不要触发：纯后端逻辑、Hook 配置、状态机规则定义
---

# 前端 UI 开发

**参考文档**：`docs/architecture/animation-design.md`、`docs/architecture/states-and-flows.md`

## 目录结构

```
frontend/src/
├── components/        ← UI 组件（PascalCase.tsx）
├── hooks/             ← 自定义 Hooks（useAgentEvents 等）
├── store/             ← Zustand 状态
│   ├── sessions.ts    ← 会话、审批、hook 状态
│   ├── config.ts      ← UI 配置
│   └── timeline.ts    ← 时间线
├── shared/            ← 跨层共享（AppError, state-machine, session-reducer）
├── client/            ← Logger + ErrorBoundary
├── config/            ← 动画参数配置
└── __tests__/         ← 前端测试
```

## 现有组件

| 组件 | 职责 |
|------|------|
| `Pill.tsx` | 主容器，动态岛外框 |
| `NotchRow.tsx` | 顶部 notch 栏 |
| `Overlay.tsx` | 展开面板容器 |
| `StatusDot.tsx` | 状态指示点动画 |
| `BarsGlyph.tsx` | 活动指示条 |
| `SessionList.tsx` | 会话列表 |
| `SessionRow.tsx` | 单个会话行 |
| `ApprovalPanel.tsx` | 审批请求面板 |
| `HookStatus.tsx` | Hook 连接状态 |
| `SettingsPanel.tsx` | 设置面板 |
| `ControlCenter.tsx` | 控制中心窗口 |
| `DiffViewer.tsx` | Diff 差异查看器 |
| `CommandAnalysis.tsx` | 命令分析展示 |
| `JumpToast.tsx` | 跳转提示 |

## 新增组件流程

1. 在 `frontend/src/components/` 创建 `PascalCase.tsx`
2. 同目录创建 `PascalCase.css`，使用 BEM 命名（如 `.approval-panel__btn--active`）
3. 如需 IPC 调用，在 `hooks/` 中创建或复用 hook
4. 如需读写状态，通过 `useSessionsStore` 等 Zustand store
5. 添加 `data-testid` 供测试使用
6. 在 `__tests__/components/` 添加测试

## 修改现有组件

1. 先确认 Documentation Gate 通过
2. 确认组件的 data-testid 不被其他测试依赖
3. 修改后运行 `npm run build` 验证编译
4. 如涉及动画参数，参考 [[animation]] skill
5. 如涉及状态变化，参考 [[state-machine]] skill

## UI 配置变更（需双向同步）

修改 UI 尺寸、颜色、动画参数时，必须同时改两个文件的默认值：

| 改什么 | Rust 文件 | 前端文件 |
|--------|----------|---------|
| 状态颜色 | `src-tauri/src/config/types.rs` → `StateColors` | `frontend/src/store/config.ts` → `DEFAULT_CONFIG.ui.stateColors` |
| 弹簧参数 | 同上 → `SpringConfig` | 同上 → `spring` |
| 动画时长 | 同上 → `AnimationConfig` | 同上 → `animation` |
| UI 尺寸 | 同上 → `UiDimensions` | 同上 → `dimensions` |
| Overlay 尺寸 | 同上 → `OverlayConfigDefaults` | 同上 → `overlay` |

改完后运行 `cargo check && npm run build` 验证。

## 样式规范

- CSS 文件与组件同目录
- BEM 命名：`.block__element--modifier`
- 不使用 inline style
- 动画使用 Framer Motion，不直接操作 CSS animation
- GPU 加速：动画元素加 `will-change` + `translateZ(0)`

## Zustand Store 使用

```typescript
import { useSessionsStore } from "../store/sessions";

function MyComponent() {
  const sessions = useSessionsStore((s) => s.sessions);
  const activeId = useSessionsStore((s) => s.activeSessionId);
  // ...
}
```

Store 状态变更通过 store action，组件内不直接修改状态。

## IPC 对接

组件内不直接调用 `invoke()`，通过 hook 封装：

```typescript
// hooks/useAgentEvents.ts 中
const result = await invoke<string>("some_command", { param });

// 组件中使用
import { useAgentEvents } from "../hooks/useAgentEvents";
```

## 关联 Skills

- [[animation]] — 动画参数和窗口同步
- [[state-machine]] — 状态颜色和动画效果
- [[tauri-command]] — 新增 IPC 命令
- [[tauri-event]] — 新增后端事件
- [[testing]] — 组件测试

## 检查清单

- [ ] 组件文件 PascalCase.tsx
- [ ] CSS 使用 BEM 命名
- [ ] data-testid 已添加
- [ ] IPC 调用封装为 hook
- [ ] 状态通过 Zustand store 管理
- [ ] `npm run build` 通过
- [ ] 有对应测试
