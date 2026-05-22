---
name: state-machine
description: |
  Agent 状态机维护。包含 7 种 AgentState、合法转换矩阵、风险等级判定和新状态添加规则。
  触发条件：
  - 用户要添加或修改 Agent 状态
  - "状态转换"、"AgentState"、"状态机"、"TRANSITION_MATRIX"
  - 状态转换不合法或状态显示异常
  - 需要了解风险等级判定逻辑
  不要触发：与状态机无关的 UI 调整、纯 Win32 窗口问题
---

# Agent 状态机

状态转换有代码级约束：`frontend/src/shared/state-machine.ts` → `TRANSITION_MATRIX`。所有 `updateSessionState` 调用经过 `safeTransition()` 校验，不合法转换记录 WARN 日志但不阻塞 UI。

**参考文档**：`docs/architecture/states-and-flows.md`

## 7 种 AgentState

| 状态 | 颜色 | 动画 | 触发 |
|------|------|------|------|
| `idle` | 灰 `#6b7280` | 无 | 会话启动完成、等待输入 |
| `thinking` | 紫 `#a78bfa` | 缩放脉冲 | PreToolUse |
| `running` | 蓝 `#3b82f6` | 透明度脉冲 | UserPromptSubmit |
| `streaming` | 青 `#06b6d4` | 快速透明度脉冲 | PostToolUse |
| `approval` | 琥珀 `#f59e0b` | 快速缩放脉冲 | PermissionRequest |
| `error` | 红 `#ef4444` | 无 | PostToolUseFailure |
| `done` | 绿 `#22c55e` | 无 | Stop |

## 状态转换路径

```
idle → running (UserPromptSubmit)
running → thinking (PreToolUse)
thinking → streaming (PostToolUse)
streaming → thinking (循环执行工具)
streaming → idle (Stop)
running → approval (PermissionRequest)
approval → running (approve/deny)
running → error (PostToolUseFailure)
running → done (Stop)
```

不合法转换会记录 WARN 日志但不阻塞 UI（安全默认策略）。

## 风险等级判定

| 工具 | 高风险 | 中风险 | 低风险 |
|------|--------|--------|--------|
| Bash | rm、sudo、格式化 | git、curl、apt | echo、ls、cat |
| Write | 系统文件、配置 | 项目源码 | 临时文件 |
| Edit | 系统配置 | 核心逻辑 | 注释、文档 |

## 新增状态的维护规则

1. 在 `AgentState` 联合类型中添加新状态
2. 在 `TRANSITION_MATRIX` 中定义合法的转入/转出
3. 在 `StatusDot` 中添加对应颜色和动画
4. 在 Zustand store 的 `stateColors` 中添加映射
5. 更新 `states-and-flows.md` 文档
6. 运行测试确认 `safeTransition()` 新矩阵正确

## Rust→Frontend 事件

| 事件名 | 用途 |
|--------|------|
| `session_start` | 新会话开始 |
| `session_end` | 会话结束 |
| `state_change` | Agent 状态变更 |
| `permission_request` | 审批请求 |
| `permission_response` | 审批响应 |
| `hook_health` | Hook 健康状态 |
| `test_reset` | 测试重置 |
| `session_renamed` | 会话重命名 |
| `agent_detected` | Agent 类型检测 |

## 检查清单

- [ ] 新状态已加入 AgentState 类型
- [ ] TRANSITION_MATRIX 已更新
- [ ] StatusDot 颜色和动画已配置
- [ ] Zustand store stateColors 已同步
- [ ] 文档已更新
- [ ] `npm run build` 通过
