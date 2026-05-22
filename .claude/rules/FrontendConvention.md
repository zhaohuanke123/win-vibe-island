# React/TypeScript 编码规范

本项目前端基于 React 19 + TypeScript + Zustand + Framer Motion，以下是必须遵循的编码约定。

## 命名

- 组件文件：`PascalCase.tsx`（如 `StatusDot.tsx`、`Overlay.tsx`）
- Hook 文件：`camelCase.ts`（如 `useAgentEvents.ts`、`useElapsedTime.ts`）
- Store 文件：`camelCase.ts`（如 `sessions.ts`）
- CSS 类名：BEM 命名（如 `.overlay__bar`、`.status-dot--active`）

## 组件

- 一个文件一个组件
- 使用函数式组件 + hooks，不使用 class 组件
- Props 使用 `interface` 定义，导出类型
- 事件监听器在 `useEffect` 中设置，返回 `UnlistenFn` 清理

## 状态管理

- 使用 Zustand store（`useSessionsStore` 等）
- Store 定义在 `frontend/src/store/` 目录
- 状态变更通过 store action，组件内不直接修改状态

## IPC 调用

- 封装为自定义 hook（如 `useAgentEvents.ts`），组件内不直接调用 `invoke()`
- 事件监听使用 `@tauri-apps/api/event` 的 `listen()`
- 命令调用使用 `@tauri-apps/api/core` 的 `invoke()`

## 动画

- 使用 Framer Motion，参数参考 `docs/architecture/animation-design.md`
- GPU 加速：需要高性能动画的元素添加 `will-change` + `translateZ(0)`
- 使用 `cubic-bezier` 缓动曲线

## TypeScript

- 严格模式开启
- 后端事件的 payload 类型定义在 hook 文件中（如 `SessionStartEvent` interface）
- 与后端共享的类型放在 `frontend/src/shared/` 目录
- 使用 `type` 导入：`import type { ... } from "..."`

## 样式

- CSS 文件与组件同目录
- 使用 BEM 命名规范
- 避免 inline style，优先使用 CSS class
