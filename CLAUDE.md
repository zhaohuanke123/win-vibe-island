# Vibe Island (氛围岛)

Windows 桌面悬浮 Overlay 应用，监控 AI 编程助手会话（Claude Code、Codex 等）并显示其状态。基于 Tauri 2.0（Rust + React）构建。

---

## 开发流程

本项目使用 Harness Engineering 架构，文档先行作为运行时门禁。

### 新对话读取顺序

```
1. 本文件（CLAUDE.md）    ← 项目配置和导航入口（当前文件）
2. WORKFLOW.md            ← 工作流程和 Documentation Gate
3. architecture.md        ← 架构约束
4. task.json              ← 任务列表、依赖、文档引用
5. progress.txt           ← 当前进度、测试证据、跳过文档记录
6. 源码和测试             ← 仅在 Documentation Gate 通过后读取和修改
```

### Documentation Gate

任何 bug、功能、行为变更都不能直接改源码。编码前必须：

1. 读取 `WORKFLOW.md`、`task.json` 和 `progress.txt`。
2. 找到当前任务的 `requirement_ref` 和 `design_ref`，或定位对应的文档。
3. 如果文档已定义正确行为但代码不符，先在 `progress.txt` 记录实现 bug，再修代码。
4. 如果用户请求的是新行为或变更，先更新相关文档，再修代码。
5. 如果用户明确确认跳过文档，必须在 `progress.txt` 记录跳过原因、风险和待补文档。

任务只有在 docs/code/tests 一致后才能标记完成。

---

## Memory 规则

Memory 只能提醒 agent 读取本文件，不能替代项目状态文件。

如果 memory 与项目文件冲突，按以下优先级处理：

```text
用户最新明确指令
> task.json / progress.txt
> CLAUDE.md / WORKFLOW.md / architecture.md
> skill instructions
> memory hints
```

---

## 文件导航

| 文件 | 用途 | 何时读取 |
|------|------|----------|
| [WORKFLOW.md](WORKFLOW.md) | 工作流程指南（Orchestrator） | 需要执行任务时 |
| [executor.md](executor.md) | Executor 子代理指令 | spawn executor 时 |
| [verifier.md](verifier.md) | Verifier 子代理指令 | spawn verifier 时 |
| [architecture.md](architecture.md) | 架构约束 | 编码前 |
| [task.json](task.json) | 任务定义、依赖、文档引用 | 需要知道做什么时 |
| [progress.txt](progress.txt) | 开发历史、文档更新、测试证据 | 需要了解上下文时 |
| [DESIGN.md](DESIGN.md) | 设计文档，Win32 API 用法 | 需要了解 Win32 API 用法时 |
| [docs/hooks-setup.md](docs/hooks-setup.md) | Claude Code Hooks 配置指南 | 配置 hooks 时 |
| [docs/testing.md](docs/testing.md) | 测试 API 文档和测试流程 | 测试时 |

---

## 目录结构

```
/
├── CLAUDE.md              ← 本文件 - 项目配置和导航入口
├── WORKFLOW.md            ← 工作流程指南和 Documentation Gate
├── executor.md            ← Executor 子代理指令
├── verifier.md            ← Verifier 子代理指令
├── architecture.md        ← 架构约束
├── task.json              ← 任务定义与文档引用
├── progress.txt           ← 开发历史、文档更新、测试证据
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
├── tests/                 ← 测试
│   ├── e2e/               ← Playwright E2E 测试
│   └── scripts/hook/      ← Hook server 回归测试脚本
└── docs/                  ← 文档
```

---

## 开发命令

```bash
# Start dev server (Tauri + Vite hot reload)
cd src-tauri && cargo tauri dev

# Build for production
cd src-tauri && cargo tauri build

# Frontend only (without Tauri)
cd frontend && npm run dev

# Lint frontend
cd frontend && npm run lint

# Build frontend only
cd frontend && npm run build
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
