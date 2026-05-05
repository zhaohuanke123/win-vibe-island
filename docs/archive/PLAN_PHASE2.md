# Vibe Island 后续开发计划

## 当前实现 vs DESIGN.md 对比

### ✅ 已完成

| DESIGN.md 要求 | 实现状态 | 文件 |
|---------------|---------|------|
| Tauri 2.0 工程骨架 | ✅ | `src-tauri/` |
| Win32 Overlay 窗口属性 | ✅ | `overlay.rs` - WS_EX_LAYERED \| WS_EX_TRANSPARENT \| WS_EX_TOPMOST \| WS_EX_NOACTIVATE |
| 系统托盘图标 + 右键菜单 | ✅ | `lib.rs` |
| Named Pipe Server | ✅ | `pipe_server.rs` |
| 进程轮询 (Process Watcher) | ✅ | `process_watcher.rs` |
| 跨应用窗口聚焦 | ✅ | `window_focus.rs` |
| 前端状态指示动画 | ✅ | `StatusDot.tsx`, `Overlay.tsx` |
| Agent SDK (Node.js + Python) | ✅ | `agent-sdk/` |
| DPI & Multi-Monitor | ✅ | `overlay.rs` |
| Approval Panel | ✅ | `ApprovalPanel.tsx` |

### ❌ 未实现

| DESIGN.md 要求 | 描述 | 优先级 |
|---------------|------|--------|
| **PTY Hook** | ConPTY 输出解析，检测 agent 状态变化 | 高 |
| **Diff 渲染** | ApprovalPanel 中显示代码变更预览 | 中 |
| **SessionList 组件** | 多对话列表（当前只有简单列表） | 中 |
| **state.rs** | 全局状态聚合模块 | 低 |

---

## Phase 2 开发计划

### Task 11: PTY Hook - ConPTY 输出解析

**描述**: 监听 ConPTY (Windows Pseudo Terminal) 输出，解析 Claude Code / Codex CLI 的输出文本，检测状态变化。

**步骤**:
1. 研究 Windows ConPTY API (`CreatePseudoConsole`, `ResizePseudoConsole`)
2. 实现 PTY 输出捕获（Hook 到现有 agent 进程的 ConPTY）
3. 定义输出解析规则：
   - `"Do you want to proceed"` → Approval 状态
   - `"✓ Task complete"` → Done 状态
   - `"Working..."` / `"Thinking..."` → Running 状态
4. 与 Named Pipe 事件合并（优先级：Named Pipe > PTY Hook > 进程轮询）
5. 添加 IPC 命令控制 PTY 监听

**文件**:
- `src-tauri/src/pty_hook.rs` (new)
- `src-tauri/src/lib.rs`
- `src-tauri/src/commands.rs`

**技术挑战**:
- ConPTY API 复杂，需要 `windows` crate 的 `Win32_System_Console` feature
- 需要注入到已运行的 agent 进程，或启动时 Attach

---

### Task 12: Diff 渲染 - Approval Panel 增强

**描述**: 在 ApprovalPanel 中显示代码变更预览，类似 GitHub PR diff view。

**步骤**:
1. 添加 `diff` 字段到 ApprovalRequest 类型
2. 实现简单的 diff 解析（unified diff format）
3. 创建 `DiffViewer` 组件，显示 +/- 行
4. 添加语法高亮（可选，使用 `react-syntax-highlighter`）
5. 样式：删除行红色背景，添加行绿色背景

**文件**:
- `frontend/src/components/DiffViewer.tsx` (new)
- `frontend/src/components/ApprovalPanel.tsx`
- `frontend/src/store/sessions.ts`

---

### Task 13: SessionList 组件重构

**描述**: 将当前的简单 session 列表重构为独立组件，支持分组、搜索、排序。

**步骤**:
1. 提取 `SessionList.tsx` 组件
2. 添加分组功能（按项目/按时间）
3. 添加搜索过滤
4. 添加排序选项（最近活跃、名称、状态）
5. 优化滚动性能（虚拟列表）

**文件**:
- `frontend/src/components/SessionList.tsx` (new)
- `frontend/src/components/Overlay.tsx`

---

### Task 14: 全局状态聚合 (state.rs)

**描述**: 创建统一的状态管理模块，聚合来自多个来源的状态（Named Pipe + PTY + 进程轮询）。

**步骤**:
1. 创建 `state.rs` 模块
2. 定义 `AppState` 结构，包含所有 sessions
3. 实现状态合并逻辑（优先级处理）
4. 添加状态变化事件发射
5. 替换当前分散的状态管理

**文件**:
- `src-tauri/src/state.rs` (new)
- `src-tauri/src/lib.rs`

---

## 执行顺序

```
[Task 11] → [Task 12 + Task 13] → [Task 14]
  PTY Hook      UI 增强           状态聚合
```

Task 11 是独立的，可以单独执行。
Task 12 和 Task 13 可以并行执行（无文件冲突）。
Task 14 依赖 Task 11 完成。

---

## 下一步行动

是否开始执行 Task 11 (PTY Hook)？
