# Vibe Island (氛围岛)

Windows 桌面悬浮 Overlay 应用，监控 AI 编程助手会话（Claude Code、Codex、自定义 agent 等）并显示其状态。基于 Tauri 2.0（Rust + React）构建。

## 编程语言

Rust + TypeScript，注释使用中文。

## 新对话读取顺序

```
1. CLAUDE.md            ← 项目配置和导航入口（当前文件）
2. WORKFLOW.md           ← 工作流程和 Documentation Gate
3. architecture.md       ← 架构约束 + 模块详情
4. task.json             ← 任务列表、依赖、文档引用
5. progress.txt          ← 当前进度、测试证据
6. 源码和测试            ← 仅在 Documentation Gate 通过后
```

需要查阅具体模块时，先看 `docs/README.md` 索引定位目标文档。

## Memory 优先级

Memory 只能提醒 agent 读取本文件，不能替代项目状态文件。

```text
用户最新明确指令
> task.json / progress.txt
> CLAUDE.md / WORKFLOW.md / architecture.md
> skill instructions
> memory hints
```

## 规则

- [Rust 编码规范](.claude/rules/RustConvention.md)
- [React/TypeScript 编码规范](.claude/rules/FrontendConvention.md)
- [Tauri IPC 规范](.claude/rules/TauriIPCConvention.md)
- [架构约束](.claude/rules/ArchitectureConstraints.md)
- [错误处理规范](.claude/rules/ErrorHandlingConvention.md)
