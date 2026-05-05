# Claude Code 体验改进计划

> 本文档按当前代码实现更新。Task 32 和 Task 33 已完成；后续体验改进集中在 session 详情、分组、持久化和工具详情。

---

## 当前实现状态

### 已完成

- Hook server 健康监控：
  - `GET /hooks/health`
  - `POST /hooks/ping`
  - `get_hook_health`
  - `get_hook_errors`
  - `clear_hook_errors`
  - 前端 `HookStatus.tsx` 每 5 秒轮询 health
- Hook 事件增强：
  - `idle`
  - `thinking`
  - `running`
  - `streaming`
  - `approval`
  - `error`
  - `done`
- 工具事件：
  - `tool_use`
  - `tool_complete`
  - `tool_error`
- 工具历史基础结构：
  - `Session.toolHistory`
  - `ToolExecution.duration`
  - `ToolExecution.error`
- 审批：
  - `PermissionRequest` 真阻塞审批
  - `ApprovalPanel`
  - `DiffViewer`

### 仍待完成

- Session 详情面板
- Session 分组与搜索
- Session 持久化
- 工具执行详情
- 活动时间线
- ErrorLog 组件挂载
- HookConfigStatusPanel 组件挂载

---

## 剩余问题

### 1. Session 管理仍然偏轻量

当前 UI 主要展示 label、state、当前工具和最近活动时间。

缺口：

- 无分组（按项目/时间）
- 无搜索、排序
- 无历史恢复
- 无完整 cwd、model、source 展示
- 无 session 详情面板

### 2. 工具执行展示仍不完整

当前 store 已保存基础 `toolHistory`，但 UI 只展示当前工具的简单信息。

缺口：

- 工具输入参数没有详情面板
- 工具输出摘要未展示
- 错误日志组件未挂载
- 没有活动时间线
- 没有导出日志

### 3. Hook 配置状态 UI 未挂载

`HookConfigStatus.tsx` 已实现检查、安装、卸载和模式切换逻辑，但当前 `App.tsx` 只渲染 `Overlay`，`Overlay` 也未挂载该组件。

---

## 后续改进方案

### Phase 2: Session 管理优化

#### Task 34: Session 详情面板

- 点击 session 展开详情
- 显示完整 cwd 路径
- 显示 session 创建时间
- 显示最近活动时间
- 显示 model/source
- 显示工具执行历史（最近 20 条，与当前 store 一致）

#### Task 35: Session 分组与搜索

- 按项目 cwd 分组
- 按状态筛选
- 按 label/cwd 搜索
- 按最近活动/创建时间排序
- 分组折叠

#### Task 36: Session 持久化

- 定义本地 session 持久化格式
- 添加后端 `save_sessions` / `load_sessions`
- 应用启动时恢复历史 sessions
- 清理过期 session

### Phase 3: 消息显示增强

#### Task 37: 工具执行详情

- 展示工具输入参数
- 展示输出摘要
- 展示执行耗时
- 错误高亮
- 支持折叠/展开

#### Task 38: 活动时间线

- 记录所有工具调用
- 时间线视图展示
- 点击条目查看详情
- 支持 JSON/Markdown 导出

---

## 当前技术结构

### 状态模型

```typescript
type AgentState =
  | "idle"
  | "thinking"
  | "running"
  | "streaming"
  | "approval"
  | "error"
  | "done";

interface Session {
  id: string;
  label: string;
  cwd: string;
  state: AgentState;
  pid?: number;
  createdAt: number;
  lastActivity: number;
  currentTool?: {
    name: string;
    input: Record<string, unknown>;
    startTime: number;
  };
  toolName?: string;
  filePath?: string;
  toolHistory: ToolExecution[];
  lastError?: string;
  model?: string;
  source?: string;
}

interface ToolExecution {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  outputSummary?: string;
  duration?: number;
  error?: string;
  timestamp: number;
  status: "pending" | "running" | "success" | "failed";
}
```

### Hook Server 状态端点

```text
GET  /hooks/health
POST /hooks/ping
```

### 当前前端组件结构

```text
App
└── Overlay
    ├── HookStatus
    ├── StatusDot
    ├── ApprovalPanel
    │   └── DiffViewer
    └── Session list
```

### 已存在但未挂载组件

```text
HookConfigStatusPanel
ErrorLog
```
