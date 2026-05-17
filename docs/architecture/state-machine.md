# Agent State Machine

> 文件：`frontend/src/shared/state-machine.ts`

## 概述

轻量状态机，将 `docs/states-and-flows.md` 中的状态转换图编码为可验证的转换矩阵。所有 `updateSessionState` 调用都会经过校验，不合法转换记录 WARN 日志（不阻塞 UI）。

## 设计原则

```
安全默认：不阻塞 UI，但让 AI/开发者能 grep 到异常
        ↓
任何状态都能设任何值，但异常转换会写日志
        ↓
矩阵是"设计意图"而非"强制约束"
```

## 状态定义

```
AgentState = "idle" | "running" | "thinking" | "streaming"
           | "approval" | "error" | "done"
```

## 转换矩阵

```
idle    ───→ running, thinking, approval, error, done
running ───→ thinking, approval, error, done, streaming, idle
thinking ──→ streaming, error, approval, done, running, idle
streaming ─→ thinking, done, error, approval, running, idle
approval ──→ running, error, done, idle
error    ───→ idle, running, done, thinking, approval
done     ───→ idle, running, error
```

### 标准流程（Happy Path）

```
idle → running → thinking → streaming ─→ thinking → ... → done
                                  │
                                  └──→ done
```

### 侧分支

```
任意状态 → approval → running (用户响应)
任意状态 → error (工具执行失败)
done    → idle (新会话), running (重试)
```

## API

```typescript
// 检查当前→目标是否合法
canTransition(current: AgentState, next: AgentState): boolean

// 校验 + 返回原因（不写日志）
validateTransition(current: AgentState, next: AgentState):
  { valid: boolean; reason?: string }

// 校验 + 写 WARN 日志 + 返回结果（推荐用于 store）
safeTransition(sessionId: string, current: AgentState, next: AgentState,
  context?: Record<string, unknown>):
  { valid: boolean; reason?: string }
```

## AI 维护规则

### 什么时候需要改矩阵

1. 日志中出现 `[WARN] STORE_OPERATION_ERROR Invalid state transition`
2. 确认这是真实场景下的合法转换（而非 Bug）
3. 在 `TRANSITION_MATRIX` 中对应源状态的数组里加上目标状态

### 加新状态

1. 在 `AgentState` 联合类型中追加
2. 在 `TRANSITION_MATRIX` 中为新状态定义所有合法出边
3. 在所有现有状态的合法出边中加上新状态（如果适用）
4. 在本文档和 `docs/states-and-flows.md` 中更新转换图

## 测试

```bash
cd frontend && npx vitest run --reporter verbose src/__tests__/state-machine.test.ts
```

测试覆盖：
- 每个状态的同状态转换
- 所有已注册的合法转换
- 不合法转换返回 `valid=false + reason`
- 未知状态处理
- 矩阵完整性（每个状态都有定义、至少一条出边、所有目标都是 AgentState）

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `shared/state-machine.ts` | 转换矩阵 + 校验函数 |
| `store/sessions.ts` | `updateSessionState` 调用 `safeTransition` |
| `__tests__/state-machine.test.ts` | 17 项单元测试 |
| `docs/states-and-flows.md` | 完整的 Agent 事件流程文档 |
