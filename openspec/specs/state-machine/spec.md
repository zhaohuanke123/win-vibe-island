# State Machine Specification

## Purpose

定义 AI 编程助手会话的状态枚举、合法转换、风险等级判定，以及新增状态的维护流程。
这是前端 `frontend/src/shared/state-machine.ts` 中 `TRANSITION_MATRIX` 与 `safeTransition()` 的行为真相源。
所有 `updateSessionState` 调用必须 (MUST)经过 `safeTransition()` 校验，保证 UI 状态始终可达且自洽。

实现参考：`frontend/src/shared/state-machine.ts`、`docs/architecture/states-and-flows.md`。

## Requirements

### Requirement: Agent State Enumeration

系统必须 (MUST)定义恰好 7 个 AgentState，每个状态有唯一的颜色与触发事件：

| 状态 | 颜色 | 触发事件 |
|------|------|----------|
| `idle` | 灰 `#6b7280` | 会话启动完成、等待输入 |
| `thinking` | 紫 `#a78bfa` | PreToolUse |
| `running` | 蓝 `#3b82f6` | UserPromptSubmit |
| `streaming` | 青 `#06b6d4` | PostToolUse |
| `approval` | 琥珀 `#f59e0b` | PermissionRequest |
| `error` | 红 `#ef4444` | PostToolUseFailure |
| `done` | 绿 `#22c55e` | Stop |

#### Scenario: 未知状态值

- **WHEN** 后端或适配器发射一个不在 7 个 AgentState 中的状态字符串
- **THEN** 前端不得崩溃，应记录 WARN 日志并降级到 `idle` 作为安全默认

### Requirement: Legal State Transitions

`TRANSITION_MATRIX` 必须 (MUST)枚举全部合法转换。合法路径：

```
idle → running (UserPromptSubmit)
running → thinking (PreToolUse)
thinking → streaming (PostToolUse)
streaming → thinking（循环执行工具）
streaming → idle (Stop)
running → approval (PermissionRequest)
approval → running（approve / deny）
running → error (PostToolUseFailure)
running → done (Stop)
```

#### Scenario: 合法转换

- **WHEN** `safeTransition(current, next)` 的 `(current, next)` 在 TRANSITION_MATRIX 中存在
- **THEN** 返回 next 并更新 UI

#### Scenario: 非法转换的安全降级

- **WHEN** `safeTransition(current, next)` 的 `(current, next)` 不在 TRANSITION_MATRIX 中
- **THEN** 记录 WARN 日志（包含 current 与 next），不抛异常、不阻塞 UI，状态保持 current 或按安全策略降级

### Requirement: Tool Risk Classification

每个工具调用必须 (MUST)分类为 high / medium / low 风险等级，用于审批与日志策略：

| 工具 | high | medium | low |
|------|------|--------|-----|
| Bash | rm、sudo、格式化 | git、curl、apt | echo、ls、cat |
| Write | 系统文件、配置 | 项目源码 | 临时文件 |
| Edit | 系统配置 | 核心逻辑 | 注释、文档 |

#### Scenario: 高风险工具触发

- **WHEN** PermissionRequest 涉及 high 风险工具（如 `rm`、写系统配置）
- **THEN** 必须 (MUST)进入 `approval` 状态并提示用户，不得自动放行

### Requirement: Adding a New State

新增 AgentState 必须 (MUST)同步更新以下 6 处，任何一处缺失都视为实现不完整：

1. `AgentState` 联合类型
2. `TRANSITION_MATRIX` 的合法转入/转出
3. `StatusDot` 的颜色与动画
4. Zustand store 的 `stateColors` 映射
5. `docs/architecture/states-and-flows.md` 文档
6. `safeTransition()` 相关测试

#### Scenario: 新增状态缺少矩阵更新

- **WHEN** 新状态加入 `AgentState` 类型但未更新 `TRANSITION_MATRIX`
- **THEN** 任何转入/转出该状态的尝试都会走非法转换降级路径，记 WARN 并阻塞状态切换，`npm run build` 后测试应失败

### Requirement: Hook Event to State Mapping

7 种 Hook 事件必须 (MUST)映射到上述 AgentState：PreToolUse→`thinking`、UserPromptSubmit→`running`、PostToolUse→`streaming`、PermissionRequest→`approval`、PostToolUseFailure→`error`、Stop→`done`、会话启动完成→`idle`。

#### Scenario: Stop 事件

- **WHEN** 收到 Stop 事件且当前状态为 `streaming` / `running` / `thinking`
- **THEN** 状态转换为 `done`（或按矩阵降级到 `idle`），UI 显示完成色

### Requirement: Stop Phase Permanence

`Stop` 事件将 session 转入 `completed` 后，后续延迟任务（如 title 刷新、清理）MUST NOT (MUST NOT) 将状态回退到 `running` 或其他非完成态。
涉及延迟回调的状态发射 MUST (MUST) 接受显式的 phase 参数，调用方按当前真实状态传入，不得硬编码 `Running`。

#### Scenario: Stop 后延迟 title 刷新

- **WHEN** `handle_stop` 将 session 设为 `completed`，随后（约 200ms）延迟任务调用 `try_refresh_title`
- **THEN** `try_refresh_title` MUST (MUST) 传入 `Some(SessionPhase::Completed)`，发射的 `state_change` 保持 `completed`，前端 MUST NOT (MUST NOT) 观察到回退到 `running` 的闪烁
