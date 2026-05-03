# Vibe Island 状态与流程文档

本文档总结项目的所有操作状态、显示状态和流程图。

---

## 一、Agent 会话状态 (AgentState)

### 状态定义

| 状态 | 颜色 | 动画效果 | 触发场景 |
|------|------|----------|----------|
| `idle` | 灰色 `#6b7280` | 无动画 | 会话启动完成、等待用户输入 |
| `thinking` | 紫色 `#a78bfa` | 缩放脉冲 (1→1.3→1) | PreToolUse hook 触发，Agent 准备执行工具 |
| `running` | 蓝色 `#3b82f6` | 透明度脉冲 (1→0.5→1) | UserPromptSubmit hook 触发，用户提交 prompt |
| `streaming` | 青色 `#06b6d4` | 快速透明度脉冲 (1→0.3→1) | PostToolUse hook 触发，工具执行完成 |
| `approval` | 琥珀色 `#f59e0b` | 快速缩放脉冲 (1→1.2→1) | PermissionRequest hook 或 notification(permission_prompt) |
| `error` | 红色 `#ef4444` | 无动画 | PostToolUseFailure hook 触发 |
| `done` | 绿色 `#22c55e` | 无动画 | Stop hook 触发，Agent 完成响应 |

### 状态转换图

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌─────────┐                                     │
              │  idle   │◄────────────────────────────────────┤
              └────┬────┘                                     │
                   │                                          │
    UserPromptSubmit│                                          │Stop
                   │                                          │
                   ▼                                          │
              ┌─────────┐                                     │
              │ running │                                     │
              └────┬────┘                                     │
                   │                                          │
       PreToolUse │                                          │
                   │                                          │
                   ▼                                          │
              ┌─────────┐                                     │
              │thinking │                                     │
              └────┬────┘                                     │
                   │                                          │
      PostToolUse │                                          │
                   │                                          │
                   ▼                                          │
             ┌──────────┐                                     │
             │streaming │─────────────────────────────────────┘
             └────┬─────┘
                  │
                  │ (循环执行工具)
                  │
                  ▼
            ┌───────────┐
            │  thinking │◄───┐
            └─────┬─────┘    │
                  │          │
                  │          │
                  └──────────┘


        PermissionRequest
              │
              ▼
         ┌─────────┐
         │approval │────(approve/deny)────► running
         └────┬────┘
              │
              │ timeout (120s)
              │
              ▼
           deny


        PostToolUseFailure
              │
              ▼
         ┌─────────┐
         │  error  │
         └─────────┘
```

---

## 二、Hook Server 连接状态 (HookConnectionState)

| 状态 | 显示 | 触发条件 |
|------|------|----------|
| `connected` | 绿色圆点 | 健康检查成功 |
| `disconnected` | 灰色圆点 | 连续 3 次健康检查失败 |
| `error` | 红色圆点 + ⚠ | 服务器返回错误状态码 |
| `unknown` | 默认状态 | 初始化中 |

### 健康检查流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Hook Server 健康检查                      │
│                     (每 5 秒执行一次)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    GET /hooks/health
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         成功 (200)      失败 (非200)      网络错误
              │               │               │
              ▼               ▼               ▼
     state: connected   失败计数 +1      失败计数 +1
     更新 heartbeat         │               │
              │         ┌───┴───┐       ┌───┴───┐
              │         │       │       │       │
              │    计数 < 3   计数 >= 3  计数 < 3  计数 >= 3
              │         │       │       │       │
              │         │       ▼       │       ▼
              │         │  state: error │  state: disconnected
              │         │               │
              └─────────┴───────────────┘
                        │
                        ▼
                  重置失败计数
```

---

## 三、Hook 事件流程

### 3.1 完整会话生命周期

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Claude Code 会话生命周期                        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ SessionStart │ ──────────────────────────────────────────────────────────►
│   hook       │   事件: session_start
└──────────────┘   状态: idle
      │            数据: { session_id, label, cwd, source, model }
      │
      ▼
┌───────────────────┐
│ UserPromptSubmit  │ ─────────────────────────────────────────────────────►
│      hook         │   事件: state_change
└───────────────────┘   状态: running
      │                 数据: { session_id, state: "running", prompt }
      │
      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              工具执行循环                                  │
│                                                                           │
│   ┌─────────────┐                                                        │
│   │ PreToolUse  │ ──────────────────────────────────────────────────────► │
│   │    hook     │   事件: state_change + tool_use                        │
│   └──────┬──────┘   状态: thinking                                       │
│          │          数据: { session_id, state: "thinking", tool_name,    │
│          │                   tool_input }                                │
│          │                                                               │
│          ▼                                                               │
│   ┌──────────────┐                                                       │
│   │ PostToolUse  │ ─────────────────────────────────────────────────────► │
│   │    hook      │   事件: tool_complete + state_change                  │
│   └──────┬───────┘   状态: streaming                                     │
│          │          数据: { session_id, tool_name, duration_ms }         │
│          │                                                               │
│          │          ┌─────────────────────────────────────┐              │
│          │          │ 继续执行下一个工具？                  │              │
│          │          └─────────────────────────────────────┘              │
│          │                    │                    │                     │
│          │                   是                   否                     │
│          │                    │                    │                     │
│          │                    ▼                    ▼                     │
│          │            返回 PreToolUse         继续到 Stop                │
│          │                                                               │
└──────────┼───────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────┐
│    Stop      │ ──────────────────────────────────────────────────────────►
│    hook      │   事件: state_change
└──────────────┘   状态: done
                   数据: { session_id, state: "done", reason }
```

### 3.2 权限请求流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           权限请求流程                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐
│ PermissionRequest │ ────────────────────────────────────────────────────►
│      hook         │   事件: permission_request + state_change
└─────────┬─────────┘   状态: approval
          │             数据: { session_id, tool_use_id, tool_name, action,
          │                      risk_level, diff, permission_suggestions }
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         等待用户响应 (最长 120s)                          │
│                                                                         │
│   ┌─────────────────┐              ┌─────────────────┐                  │
│   │    Approve      │              │     Deny        │                  │
│   │   (用户批准)     │              │   (用户拒绝)     │                  │
│   └────────┬────────┘              └────────┬────────┘                  │
│            │                                │                           │
│            ▼                                ▼                           │
│   behavior: "allow"                 behavior: "deny"                    │
│            │                                │                           │
│            └────────────────┬───────────────┘                           │
│                             │                                           │
│                             ▼                                           │
│                    发送响应给 Claude Code                                │
│                    事件: state_change → running                          │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      超时 (120 秒无响应)                          │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                             ▼                                           │
│                    事件: approval_timeout                                │
│                    自动 deny                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 错误处理流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           错误处理流程                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────┐
│ PostToolUseFailure    │ ────────────────────────────────────────────────►
│        hook           │   事件: tool_error + state_change
└───────────┬───────────┘   状态: error
            │               数据: { session_id, tool_name, error, duration_ms,
            │                        is_interrupt }
            │
            ▼
     记录到 error_logs
            │
            ▼
     发送 hook_error 事件
```

---

## 四、Process Watcher 状态

### 监控的进程

| 进程名 | agent_type |
|--------|------------|
| `claude.exe` / `claude` | claude |
| `codex.exe` / `codex` | codex |
| `aider.exe` / `aider` | aider |
| `cursor.exe` / `cursor` | cursor |
| `copilot-agent.exe` / `copilot-agent` | copilot-agent |
| `node.exe` (含 claude/codex 参数) | claude / codex |

### 进程监控流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Process Watcher 流程                             │
│                        (每 5 秒轮询一次)                                  │
└─────────────────────────────────────────────────────────────────────────┘

                              │
                              ▼
                 ┌────────────────────────┐
                 │  CreateToolhelp32Snapshot  │
                 │    枚举所有进程           │
                 └────────────┬───────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │   遍历进程列表           │
                 │   检查是否为已知 Agent   │
                 └────────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         新进程检测       进程已记录       进程已终止
              │               │               │
              ▼               │               ▼
     事件: process_detected   │      事件: process_terminated
     创建新 Session           │      移除 Session
                              │
                              └───────────────┘
```

---

## 五、前端 UI 状态

### 5.1 Overlay 窗口状态

| 状态 | 窗口高度 | 交互模式 | 触发条件 |
|------|----------|----------|----------|
| 折叠 (collapsed) | 60px | 点击穿透 | 默认状态 |
| 展开 (expanded) | 600px | 可交互 | 点击 bar / 收到 approval 请求 |

### 5.2 Session 数据结构

```typescript
interface Session {
  id: string;                    // 会话唯一标识
  label: string;                 // 显示名称 (项目名)
  cwd: string;                   // 工作目录
  state: AgentState;             // 当前状态
  pid?: number;                  // 进程 ID
  createdAt: number;             // 创建时间
  lastActivity: number;          // 最后活动时间

  // 当前工具信息
  currentTool?: {
    name: string;                // 工具名称
    input: Record<string, unknown>;  // 工具输入
    startTime: number;           // 开始时间
  };

  // 显示用的工具名称和文件路径
  toolName?: string;
  filePath?: string;

  // 工具历史（最近 20 条）
  toolHistory: ToolExecution[];

  // 错误信息
  lastError?: string;

  // Model 信息
  model?: string;
  source?: string;
}
```

### 5.3 ApprovalRequest 数据结构

```typescript
interface ApprovalRequest {
  toolUseId: string;             // 工具使用 ID (用于响应)
  sessionId: string;             // 会话 ID
  sessionLabel: string;          // 会话显示名称
  toolName?: string;             // 工具名称
  action: string;                // 操作描述
  riskLevel: "low" | "medium" | "high";  // 风险等级
  timestamp: number;             // 时间戳
  diff?: DiffData;               // Write/Edit 的 diff 数据
}
```

---

## 六、风险等级判定

### 风险等级矩阵

| 工具 | 风险等级 | 判定条件 |
|------|----------|----------|
| `Bash` | **high** | 包含 `rm`, `rmdir`, `del`, `format`, `shutdown`, `reboot`, `sudo`, `su`, `chmod`, `chown`, `mkfs`, `dd` |
| `Bash` | medium | 普通命令 |
| `Write` | **high** | 文件路径包含 `.env`, `config`, `secret`, `credential`, `password`, `key` |
| `Write` | medium | 普通文件 |
| `Edit` | **high** | 文件路径包含 `.env`, `config`, `secret`, `credential`, `password`, `key` |
| `Edit` | medium | 普通文件 |
| `TodoWrite` | medium | 默认 |
| `Task` | medium | 默认 |
| `Agent` | medium | 默认 |
| `Read` | low | 只读操作 |
| `Glob` | low | 只读操作 |
| `Grep` | low | 只读操作 |
| `LS` | low | 只读操作 |
| 其他 | medium | 默认 |

---

## 七、事件汇总表

### Rust → Frontend 事件

| 事件名 | 触发时机 | 数据字段 |
|--------|----------|----------|
| `session_start` | SessionStart hook | `session_id`, `label`, `cwd`, `source`, `model`, `agent_type` |
| `session_end` | SessionEnd hook | `session_id` |
| `state_change` | 状态变更 | `session_id`, `state`, `tool_name?`, `tool_input?`, `message?`, `prompt?`, `reason?` |
| `tool_use` | PreToolUse hook | `session_id`, `tool_name`, `file_path?` |
| `tool_complete` | PostToolUse hook | `session_id`, `tool_name?`, `duration_ms?`, `tool_response?` |
| `tool_error` | PostToolUseFailure hook | `session_id`, `tool_name?`, `error?`, `duration_ms?`, `is_interrupt?` |
| `permission_request` | PermissionRequest hook | `session_id`, `tool_use_id`, `tool_name`, `action`, `risk_level`, `diff?`, `permission_suggestions?` |
| `approval_timeout` | 权限请求超时 | `tool_use_id`, `session_id` |
| `notification` | Notification hook | `session_id`, `message?`, `notification_type?` |
| `hook_heartbeat` | Ping hook | `timestamp` |
| `hook_error` | 错误发生 | `timestamp`, `error_type`, `message`, `details?` |
| `process_detected` | 检测到新进程 | `process: { pid, name, command_line, detected_at, is_agent, agent_type }` |
| `process_terminated` | 进程终止 | `pid`, `name`, `agent_type?` |

### Frontend → Rust IPC 命令

| 命令 | 用途 | 参数 |
|------|------|------|
| `set_window_size` | 调整窗口大小 | `width`, `height`, `skipCenter` |
| `set_window_interactive` | 设置交互模式 | `interactive` |
| `focus_session_window` | 聚焦会话窗口 | `sessionPid` |
| `get_hook_server_status` | 获取 Hook Server 状态 | - |
| `submit_approval_response` | 提交权限响应 | `tool_use_id`, `approved` |

---

## 八、HTTP Hook 端点

| 端点 | 方法 | 对应事件 |
|------|------|----------|
| `/hooks/session-start` | POST | SessionStart |
| `/hooks/pre-tool-use` | POST | PreToolUse |
| `/hooks/post-tool-use` | POST | PostToolUse |
| `/hooks/post-tool-use-failure` | POST | PostToolUseFailure |
| `/hooks/notification` | POST | Notification |
| `/hooks/stop` | POST | Stop |
| `/hooks/user-prompt-submit` | POST | UserPromptSubmit |
| `/hooks/permission-request` | POST | PermissionRequest (阻塞等待响应) |
| `/hooks/ping` | POST | 心跳更新 |
| `/hooks/health` | GET | 健康状态查询 |

---

## 九、配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `HOOK_SERVER_PORT` | 7878 | Hook Server 监听端口 |
| `APPROVAL_TIMEOUT_SECS` | 120 | 权限请求超时时间 |
| `MAX_ERROR_LOGS` | 100 | 最大错误日志条数 |
| `poll_interval_ms` | 5000 | Process Watcher 轮询间隔 |
| `BAR_HEIGHT` | 60px | 折叠状态窗口高度 |
| `EXPANDED_HEIGHT` | 600px | 展开状态窗口高度 |
| `WINDOW_WIDTH` | 420px | 窗口宽度 |
