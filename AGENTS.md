# Vibe Island (氛围岛) 导航

> 这是项目的导航入口。新对话时 AI 首先读取此文件，然后按需读取其他文件。

---

## 这是什么

Windows 桌面悬浮 Overlay 应用，监控 AI 编程助手会话（Claude Code、Codex 等）并显示其状态。基于 Tauri 2.0（Rust + React）构建。

---

## 快速开始

新对话时，按顺序读取：

```
1. 本文件（AGENTS.md）     ← 导航入口（当前文件）
2. architecture.md         ← 架构约束（技术栈、目录、禁止事项）
3. task.json               ← 任务列表（要做什么）
4. progress.txt            ← 当前进度（已完成什么）
```

**按需读取**：
- 执行任务时 → `WORKFLOW.md`（工作流程指南）
- 项目特定指令 → `CLAUDE.md`（如存在）

---

## 文件导航

| 文件 | 用途 | 何时读取 |
|------|------|----------|
| [WORKFLOW.md](WORKFLOW.md) | 工作流程指南（Orchestrator） | 需要执行任务时 |
| [architecture.md](architecture.md) | 架构约束 | 编码前 |
| [task.json](task.json) | 任务定义 | 需要知道做什么时 |
| [progress.txt](progress.txt) | 开发历史 | 需要了解上下文时 |
| [CLAUDE.md](CLAUDE.md) | 项目特定指令 | 如存在则读取 |
| [DESIGN.md](DESIGN.md) | 设计文档 | 需要了解 Win32 API 用法时 |

---

## 目录结构

```
/
├── AGENTS.md              ← 本文件 - 导航入口
├── WORKFLOW.md            ← 工作流程指南
├── architecture.md        ← 架构约束
├── task.json              ← 任务定义
├── progress.txt           ← 开发历史
├── CLAUDE.md              ← 项目特定指令
├── DESIGN.md              ← 设计文档
├── src-tauri/             ← Rust 后端
│   └── src/
│       ├── lib.rs         ← Tauri 构建器
│       ├── commands.rs    ← IPC 命令
│       ├── events.rs      ← 事件发射
│       ├── hook_server.rs ← HTTP Hook 服务器
│       ├── pipe_server.rs ← Named Pipe 服务器
│       ├── overlay.rs     ← Win32 Overlay 窗口
│       ├── window_focus.rs← 窗口焦点管理
│       └── process_watcher.rs ← 进程监控
├── frontend/              ← React 前端
│   └── src/
│       ├── components/    ← UI 组件
│       ├── hooks/         ← React Hooks
│       └── store/         ← Zustand 状态
├── agent-sdk/             ← Agent SDK
│   ├── node/              ← Node.js SDK
│   └── python/            ← Python SDK
└── docs/                  ← 文档
```

---

## 关键约定

### 命名规范

- Rust 文件使用 snake_case
- React 组件使用 PascalCase.tsx
- CSS 类使用 BEM 命名（`.overlay__bar`）

### 技术栈

- **后端**: Rust + Tauri 2.0 + `windows` crate
- **前端**: React 19 + TypeScript + Zustand + Vite
- **IPC**: Tauri commands (同步) + Tauri events (异步)

### 禁止事项

从 `architecture.md` 的 Key Design Decisions 章节提取：
- HWND 句柄必须序列化为字符串传递
- 所有 Win32 代码必须使用 `#[cfg(target_os = "windows")]` 条件编译
- 不要删除 `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE` 窗口样式

---

## 项目状态

**当前进度：24 / 38 任务完成**

- Phase 1 (核心功能): 19 个任务已完成
- Phase 2 (Hook 集成): Task 32 完成
- Phase 3 (动画系统): Tasks 24, 25, 26, 28 完成
- 待完成: Tasks 27, 29, 30, 31, 33-38

---

## 下一步

- **了解架构** → 读取 [architecture.md](architecture.md)
- **查看任务** → 读取 [task.json](task.json)
- **执行开发** → 读取 [WORKFLOW.md](WORKFLOW.md)
- **查看进度** → 读取 [progress.txt](progress.txt)
