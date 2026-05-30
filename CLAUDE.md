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

## 指令路由

收到指令后，先匹配下表关键词；命中则读取对应 Skill 文件获取详细流程，未命中则在当前对话中处理。

| 用户意图关键词 | Skill | 说明 |
|---|---|---|
| 动画、弹簧参数、stiffness、damping、窗口尺寸同步、StatusDot、BarsGlyph | animation | 动画系统参数和窗口同步 |
| 状态机、状态转换、AgentState、TRANSITION_MATRIX、风险等级 | state-machine | 7 种状态和转换矩阵 |
| Hook 配置、Claude Code 集成、hook 不工作、session_start 没触发 | hook-integration | Hook 配置和故障排查 |
| 测试、npm test、cargo test、data-testid、Test Bridge、测试 hook、curl hook | testing | 测试策略和工具 |
| 事件流、数据流、adapter、session_state、pipe_server | session-flow | Agent 事件处理链路 |
| 新增 IPC、添加 invoke、加个命令、前后端通信 | tauri-command | 新增 Tauri 命令流程 |
| 新增 emit、后端通知前端、添加事件监听 | tauri-event | 新增 Tauri 事件流程 |
| 命令解析、command spec、TOML 规格、扩展注册表 | command-spec | Bash 命令解析规格 |
| overlay 问题、悬浮窗、点击穿透、DPI、窗口调试 | overlay-debug | Overlay 调试辅助 |
| 改UI、加个组件、调样式、改布局、前端开发、CSS | frontend-dev | 前端组件开发和样式 |
| 启动应用、cargo tauri dev、运行、构建打包 | run | 启动和运行 Tauri 应用 |
| Documentation Gate、文档门禁、先看什么文件、工作流程 | doc-gate | Gate 流程和文件导航 |
| 继续、下一个任务、开发、任务选择、任务状态、批次规划 | barricade | 防线脚本调用流程 |
| 配置同步、config-sync、设计合规、Rust前端同步、design-tokens | barricade | 配置双向同步检查 |
| 发布、release、版本号、changelog、打 tag | barricade | 发布护航脚本 |
| 跑一下防线、检查一下、验证一下 | barricade | 运行全部防线脚本 |

### 只读执行模式

当用户明确要求"不改代码"、"不修改代码"、"只给方案"等只读意图时，匹配到的 Skill 仍应被使用，但需将只读约束传递，使其仅输出方案/步骤/分析，不执行任何文件写入或代码修改操作。

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
