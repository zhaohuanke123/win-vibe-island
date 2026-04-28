# Claude Code 体验改进计划

## 问题分析

### 1. Hook 机制管理不完善
- **现状**：只有 start/stop，没有状态监控
- **问题**：
  - Hook server 崩溃后无自动恢复
  - 无健康检查 UI
  - 无连接状态显示
  - 无错误日志展示

### 2. 消息状态不及时
- **现状**：只有 `idle/running/approval/done` 四种状态
- **问题**：
  - 缺少 `thinking`、`streaming`、`error` 等细粒度状态
  - 无工具执行进度
  - 无耗时显示
  - 状态切换无动画过渡

### 3. Session 管理不清晰
- **现状**：简单列表，只有 label + state
- **问题**：
  - 无分组（按项目/时间）
  - 无搜索、排序
  - 无历史记录
  - 多 session 难以区分
  - 无 session 详情面板

### 4. 显示消息简陋
- **现状**：只显示 toolName 和 filePath
- **问题**：
  - 无具体操作内容
  - 无错误信息展示
  - 无响应内容预览
  - 无工具执行历史

---

## 改进方案

### Phase 1: Hook 机制完善 (优先级: Critical)

#### Task 32: Hook Server 健康监控
- 添加心跳检测机制
- 前端显示连接状态（已连接/断开/错误）
- 自动重连逻辑
- 错误日志面板

#### Task 33: Hook 事件增强
- 新增 `thinking` 状态（Claude 思考中）
- 新增 `error` 状态（工具执行失败）
- 新增 `streaming` 状态（流式响应中）
- 添加工具执行耗时统计

### Phase 2: Session 管理优化 (优先级: High)

#### Task 34: Session 详情面板
- 点击 session 展开详情
- 显示完整 cwd 路径
- 显示 session 创建时间
- 显示最近活动时间
- 显示工具执行历史（最近 10 条）

#### Task 35: Session 分组与搜索
- 按项目（cwd）分组
- 按状态筛选（running/idle/approval）
- 搜索框（按 label 搜索）
- 排序选项（最近活动/创建时间）

#### Task 36: Session 持久化
- 保存 session 历史到本地
- 重启后恢复 session 列表
- 清理过期 session（7 天无活动）

### Phase 3: 消息显示增强 (优先级: Medium)

#### Task 37: 工具执行详情
- 显示工具输入参数（可折叠）
- 显示工具输出摘要
- 显示执行耗时
- 错误信息高亮显示

#### Task 38: 活动时间线
- 记录所有工具调用
- 时间线视图展示
- 点击可查看详情
- 支持导出日志

---

## 技术方案

### 状态扩展
```typescript
type AgentState = 
  | "idle"        // 空闲等待
  | "thinking"    // 思考中（收到 prompt，未开始工具）
  | "running"     // 执行工具中
  | "streaming"   // 流式响应中
  | "approval"    // 等待审批
  | "error"       // 错误状态
  | "done";       // 完成

interface Session {
  id: string;
  label: string;
  cwd: string;
  state: AgentState;
  pid?: number;
  createdAt: number;
  lastActivity: number;
  
  // 当前工具信息
  currentTool?: {
    name: string;
    input: Record<string, unknown>;
    startTime: number;
  };
  
  // 工具历史
  toolHistory: ToolExecution[];
  
  // 错误信息
  lastError?: string;
}

interface ToolExecution {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  duration?: number;
  error?: string;
  timestamp: number;
}
```

### Hook Server 增强
```rust
// 新增心跳端点
POST /hooks/heartbeat
// 返回服务器状态

// 新增工具进度事件
POST /hooks/tool-progress
// 工具执行进度更新
```

### 前端组件结构
```
Overlay
├── StatusBar (连接状态 + 错误提示)
├── SessionBar (当前 session 概览)
├── SessionList (session 列表)
│   ├── SessionGroup (按项目分组)
│   └── SessionItem (单个 session)
├── SessionDetail (session 详情面板)
│   ├── SessionInfo (基本信息)
│   ├── ToolHistory (工具历史)
│   └── ErrorLog (错误日志)
└── ApprovalPanel (审批面板)
```
