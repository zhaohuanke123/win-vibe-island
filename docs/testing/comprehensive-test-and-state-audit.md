# Vibe Island 全面操作/UI/状态枚举与状态机审查

> 生成日期：2026-05-15
> 基于代码全量审查，覆盖前端 14 个组件、后端 24 个 Rust 源文件、3 种审批类型、7 种 Agent 状态、4 种连接状态。

---

## 一、完整状态机定义

### 1.1 AgentState（7 种状态）

| 状态 | 颜色 | 动画 | 含义 | 触发事件 |
|------|------|------|------|----------|
| `idle` | `#6b7280` 灰 | 无 | 等待中 | `session_start`, `sessionCompleted` |
| `running` | `#3b82f6` 蓝 | 透明度脉冲 1→0.5→1 | Agent 正在处理 | `UserPromptSubmit`, `activityUpdated(running)` |
| `thinking` | `#a78bfa` 紫 | 缩放脉冲 1→1.3→1 | 工具调用准备中 | `PreToolUse`, `activityUpdated(thinking)` |
| `streaming` | `#06b6d4` 青 | 快速透明度 1→0.3→1 | 工具结果返回中 | `PostToolUse`, `activityUpdated(streaming)` |
| `approval` | `#f59e0b` 琥珀 | 快速缩放 1→1.2→1 | 等待用户审批 | `PermissionRequest`, `questionAsked` |
| `error` | `#ef4444` 红 | 无 | 错误发生 | `PostToolUseFailure`, `errorOccurred` |
| `done` | `#22c55e` 绿 | 无 | 任务完成 | `Stop`, `sessionCompleted` |

### 1.2 转换矩阵（完整有向图）

```
idle ────→ running, thinking, approval, error, done
running ──→ thinking, approval, error, done, streaming, idle
thinking ─→ streaming, error, approval, done, running, idle
streaming → thinking, done, error, approval, running, idle
approval ─→ running, error, done, idle
error ────→ idle, running, done, thinking, approval
done ─────→ idle, running, error
```

**边数统计：**
- idle: 5 出边
- running: 6 出边（最灵活）
- thinking: 6 出边
- streaming: 6 出边
- approval: 4 出边
- error: 5 出边
- done: 3 出边（最受限）

### 1.3 HookConnectionState（4 种状态）

| 状态 | 视觉 | 含义 | 转换条件 |
|------|------|------|----------|
| `unknown` | 灰色 | 初始化中 | → connected / disconnected |
| `connected` | 绿色 | 服务正常 | ← 200 OK / → error / → disconnected |
| `disconnected` | 灰色 | 服务不可达 | ← 3次网络错误 / → connected(重连) |
| `error` | 红色+⚠ | 服务异常 | ← 3次非200响应 / → connected |

---

## 二、所有 UI 元素清单

### 2.1 Overlay 窗口（两态切换）

| 状态 | 高度 | 宽度 | 圆角 | 交互 | 触发 |
|------|------|------|------|------|------|
| Compact（折叠） | 56px | 320px | 26px | 可点击 | 默认/approval处理后 |
| Expanded（展开） | 自适应/720px | 600px | 18px | 全交互 | 点击bar/approval到达 |
| Approval Focus | 720px | 600px | 18px | 全交互+自动展开 | approval请求到达 |

### 2.2 Status Bar（始终可见）

| 元素 | testid | 条件 | 说明 |
|------|--------|------|------|
| Loading Spinner | — | `isLoading=true` | focus_session_window 执行中 |
| StatusDot | `status-dot` | 有active session | 颜色+动画反映当前状态 |
| Session Label | `session-label` | 有active session | 显示 title 或 label |
| Sub Label | — | title存在 | 显示原始label |
| Tool Context | `tool-context` | currentTool存在 | 如 "reading foo.ts" |
| State Text | `session-state` | 有active session | 如 "running" |
| Empty State | `empty-state` | 无session | "No active sessions" |
| Hook Status | `hook-status` | 始终 | 绿/灰/红 圆点 |

### 2.3 Session List（展开时）

| 元素 | testid | 操作/说明 |
|------|--------|-----------|
| Search Input | `session-search` | 文本搜索过滤 |
| Search Clear | `search-clear` | 清空搜索(有文本时) |
| State Filter | `state-filter` | 下拉：All/Running/Thinking/Streaming/Approval/Error/Done/Idle |
| Sort Toggle | `sort-toggle` | 切换 Recent/Created |
| Group Toggle | `group-toggle` | 切换分组/平铺 |
| Session Item | `session-item` | 点击选中+聚焦窗口；右键菜单 |
| Category Icon | — | currentTool的类别图标(🔍📖✏️💻等) |
| Session Elapsed | — | 运行时间(非done/idle时显示) |
| Empty Text | `sessions-empty` | "Waiting for agent sessions..." 或 "No matching sessions" |

### 2.4 Session Context Menu（右键菜单）

| 操作 | 说明 |
|------|------|
| Rename | 进入重命名模式(inline input) |
| Delete | 删除session |
| Remove from group | 移除标签(已有tag时) |
| Assign to group | 分配到已有组 |
| New group... | 创建新组并分配 |

### 2.5 Session Detail（点击session展开）

| 元素 | testid | 说明 |
|------|--------|------|
| Back Button | `detail-back-btn` | 返回列表 |
| State Dot | — | 颜色圆点 |
| Label/Sublabel | — | title + label |
| Info Grid | — | State / Working Directory / Created / Last Activity / PID / Model / Source / Group |
| Current Tool | — | 工具名+输入预览+运行时长 |
| Last Error | — | 红色错误文本 |
| Tool History | — | 最近10条(总计最多20条)，点击展开详情 |

### 2.6 Approval Panel（3 种类型）

#### Permission Panel（工具审批）
| 元素 | testid | 说明 |
|------|--------|------|
| Header | — | "!" + "Approval Required" |
| Session Label | — | session名 |
| Tool Name | — | [Bash] / [Write] 等 |
| Action Text | — | 操作描述 |
| Command Analysis | — | Bash命令时有参数解析+风险评估 |
| Diff Viewer | — | Write/Edit时有diff展示 |
| Risk Badge | `risk-level` | LOW/MEDIUM/HIGH RISK |
| Timeout Bar | — | 进度条+倒计时(120s) |
| Reject Button | `reject-btn` | 拒绝 |
| Approve Button | `approve-btn` | 批准 |
| Shortcuts Hint | — | "Enter to approve, Esc to reject" |

#### Question Panel（AskUserQuestion）
| 元素 | 说明 |
|------|------|
| Header "?" + "Question" | |
| Question blocks | header标签 + 问题文本 |
| Option buttons | 可点击选项 |
| Custom input | 自定义回答输入框 |
| Skip Button | 跳过 |
| Submit Button | 提交(全部回答后可用) |
| Timeout Indicator | 倒计时进度条 |

#### Plan Panel（ExitPlanMode）
| 元素 | 说明 |
|------|------|
| Header "📋" + "Plan" | |
| Plan Content | Markdown渲染的plan内容 |
| Plan Steps | 解析步骤列表(带编号) |
| Cancel Button | 取消 |
| Proceed Button | 继续 |
| Timeout Indicator | 倒计时进度条 |

### 2.7 Approval Queue Navigation（多approval时）
| 元素 | 说明 |
|------|------|
| Queue Counter | "1/3" 计数 |
| Prev Button ‹ | 上一条 |
| Next Button › | 下一条 |

### 2.8 Approval Focus Content（审批聚焦模式header）
| 元素 | 说明 |
|------|------|
| Session Label | 审批所属session |
| Session State | session当前状态 |
| Queue Navigation | 多条审批导航 |
| Session Count | "N sessions" |

### 2.9 Settings Panel
| 元素 | testid | 说明 |
|------|--------|------|
| Notification Sound | — | 12种音效按钮选择(含"none") |
| Desktop Notifications | — | 开/关切换 |
| Preview | — | 点击音效按钮自动预览 |

### 2.10 Activity Timeline
| 元素 | testid | 说明 |
|------|--------|------|
| Time Range | `time-range-select` | 时间范围过滤 |
| Entry Count | — | "N entries" |
| Export Format | — | JSON / Markdown |
| Export Button | `export-btn` | 导出 |
| Export Confirm | — | Download / Cancel |
| Timeline Entries | — | 时间+session+工具详情 |

### 2.11 Footer Buttons（非approval mode）
| 元素 | testid | 说明 |
|------|--------|------|
| Settings Button | `settings-btn` | "⚙ Settings" / "← Back" |
| Activity Button | `activity-btn` | "📊 Activity" / "← Back" |

### 2.12 Geometry Sandbox（Dev Mode）
| 触发 | 说明 |
|------|------|
| `?sandbox=geometry` URL参数 | Dev模式启动 |
| `Ctrl+Shift+G` 快捷键 | 切换显示 |

---

## 三、所有操作清单

### 3.1 用户交互操作

| # | 操作 | 触发方式 | 效果 | 涉及组件 |
|---|------|----------|------|----------|
| O1 | 点击Status Bar | click | 展开/折叠overlay | Overlay |
| O2 | 展开中点击Status Bar | click | 折叠overlay | Overlay |
| O3 | Approval模式下点击Bar | click | 折叠/展开approval | Overlay |
| O4 | 点击Session | click | 选中+聚焦窗口+展开detail | SessionList, Overlay |
| O5 | 再次点击已选中Session | click | 取消detail/回到list | SessionList, Overlay |
| O6 | 右键Session | contextmenu | 打开上下文菜单 | SessionContextMenu |
| O7 | 重命名Session | menu+input | 修改label | SessionContextMenu |
| O8 | 删除Session | menu | 移除session | SessionContextMenu |
| O9 | 设置Session标签 | menu | 分配到组 | SessionContextMenu |
| O10 | 创建新组 | menu+input | 新建组 | SessionContextMenu |
| O11 | 搜索Session | input | 文本过滤 | SessionList |
| O12 | 按状态过滤 | select | 状态过滤 | SessionList |
| O13 | 排序切换 | click | Recent/Created | SessionList |
| O14 | 分组切换 | click | 分组/平铺 | SessionList |
| O15 | 折叠/展开组 | click | 组折叠 | SessionList |
| O16 | Approve操作 | click/Enter | 批准工具执行 | ApprovalPanel(Permission) |
| O17 | Reject操作 | click/Esc | 拒绝工具执行 | ApprovalPanel(Permission) |
| O18 | 选择Question选项 | click | 选中答案 | ApprovalPanel(Question) |
| O19 | 输入自定义答案 | input | 自定义回答 | ApprovalPanel(Question) |
| O20 | Submit答案 | click | 提交所有答案 | ApprovalPanel(Question) |
| O21 | Skip Question | click | 跳过回答 | ApprovalPanel(Question) |
| O22 | Proceed Plan | click | 批准plan | ApprovalPanel(Plan) |
| O23 | Cancel Plan | click | 取消plan | ApprovalPanel(Plan) |
| O24 | Approval Queue导航 | click | 切换approval | Overlay |
| O25 | 切换Settings | click | 打开/关闭设置 | Overlay |
| O26 | 切换Activity | click | 打开/关闭活动时间线 | Overlay |
| O27 | 切换音效 | click | 更改+预览音效 | SettingsPanel |
| O28 | 切换通知 | checkbox | 开关桌面通知 | SettingsPanel |
| O29 | 时间范围过滤 | select | 过滤活动 | ActivityTimeline |
| O30 | 导出活动 | click | 下载JSON/MD | ActivityTimeline |
| O31 | 展开Tool Detail | click | 展开工具详情 | ToolExecutionDetail |
| O32 | Dev模式切Geometry Sandbox | Ctrl+Shift+G | 切换调试面板 | App |
| O33 | Diff Viewer滚动 | wheel | 在approval panel内滚动 | ApprovalPanel |
| O34 | 清空搜索 | click × | 清空搜索框 | SessionList |

### 3.2 系统事件操作（后端→前端）

| # | 事件名 | 触发Hook | 状态变更 | Store动作 |
|---|--------|----------|----------|-----------|
| E1 | `session_start` | SessionStart | → idle | addSession或updateSessionInfo |
| E2 | `session_end` | Stop | — | removeSession |
| E3 | `state_change` | UserPromptSubmit/PreToolUse/PostToolUse/Stop | 见下 | updateSessionState + updateSessionInfo |
| E4 | `tool_use` | PreToolUse | → thinking | updateSessionInfo(state=thinking, toolName, currentTool) |
| E5 | `tool_complete` | PostToolUse | — | addToolExecution + clear currentTool |
| E6 | `tool_error` | PostToolUseFailure | — | addToolExecution(failed) + updateSessionInfo(lastError) |
| E7 | `permission_request` | PermissionRequest | → approval | updateSessionState(approval) + addPendingApproval |
| E8 | `approval_timeout` | 超时(120s) | — | removeApprovalByToolUseId |
| E9 | `permission_resolved` | 自动allow | — | removeApprovalByToolUseId |
| E10 | `notification` | Notification | → approval(如果permission_prompt) | addPendingApproval |
| E11 | `process_detected` | ProcessWatcher | → idle | addSession |
| E12 | `process_terminated` | ProcessWatcher | — | removeSession |
| E13 | `hook_heartbeat` | Ping | — | (不直接处理) |
| E14 | `hook_error` | 错误 | — | (日志记录) |
| E15 | `agent_event` | 新SessionState路径 | 见sessionReducer | dispatchAgentEvent |

### 3.3 state_change 详细映射

| 事件state值 | AgentState | 附加操作 |
|-------------|------------|----------|
| `"running"` | running | 设title(首次prompt), 设toolName |
| `"thinking"` | thinking | 设toolName, filePath |
| `"streaming"` | streaming | — |
| `"approval"` | approval | — |
| `"error"` | error | 设lastError |
| `"done"` | done | 播放通知音效 |
| `"idle"` | idle | — |

### 3.4 前端→后端 IPC 命令

| # | 命令 | 触发条件 | 参数 |
|---|------|----------|------|
| C1 | `set_window_interactive` | Overlay mount | `{interactive: true}` |
| C2 | `update_overlay_size` | 窗口resize动画 | `{width, height, webviewScaleFactor, borderRadius, anchorCenter}` |
| C3 | `submit_approval_response` | Approve/Reject/Submit/Skip/Proceed/Cancel | `{toolUseId, approved, answers}` |
| C4 | `focus_session_window` | 点击session | `{sessionPid}` |
| C5 | `flash_taskbar` | approval到达+窗口未聚焦 | — |
| C6 | `play_notification_sound` | done状态到达 | `{sound}` |
| C7 | `get_hook_server_status` | disconnected时自动重连 | — |
| C8 | `get_notification_sounds` | Settings Panel mount | — |
| C9 | `get_app_config` | App启动 | — |
| C10 | `analyze_command` | CommandAnalysis mount(Bash) | `{command}` |

---

## 四、状态机完整审查

### 4.1 AgentState 转换矩阵验证

**已覆盖的 Happy Path：**
```
idle → running → thinking → streaming → thinking → ... → done
```

**已覆盖的侧分支：**
```
任意 → approval → running (approve) / idle (deny/timeout)
任意 → error → idle / running (重试)
done → idle (新session) / running (重试)
```

**潜在缺失转换（代码中存在但矩阵中未定义的）：**
- ✅ `done → error` — 已在矩阵中

**实际代码中使用的转换路径：**

| 路径 | 来源 | 合法性 |
|------|------|--------|
| idle → running | `state_change(running)` | ✅ 合法 |
| idle → thinking | `tool_use`事件(无session时) | ✅ 合法 |
| idle → approval | `notification(permission_prompt)` | ✅ 合法 |
| idle → error | `tool_error`(无session时) | ✅ 合法 |
| idle → done | `sessionCompleted` | ✅ 合法 |
| running → thinking | `state_change(thinking)` | ✅ 合法 |
| running → streaming | `state_change(streaming)` | ✅ 合法 |
| running → approval | `permission_request` | ✅ 合法 |
| running → done | `state_change(done)` | ✅ 合法 |
| running → error | `errorOccurred` | ✅ 合法 |
| running → idle | `sessionCompleted` | ✅ 合法 |
| thinking → streaming | `tool_complete`→`state_change` | ✅ 合法 |
| thinking → approval | `permission_request` | ✅ 合法 |
| thinking → done | `sessionCompleted` | ✅ 合法 |
| thinking → error | `errorOccurred` | ✅ 合法 |
| streaming → thinking | 下一轮工具调用 | ✅ 合法 |
| streaming → done | `state_change(done)` | ✅ 合法 |
| streaming → error | `errorOccurred` | ✅ 合法 |
| streaming → running | `activityUpdated(running)` | ✅ 合法 |
| streaming → idle | `sessionCompleted` | ✅ 合法 |
| approval → running | approve/自动allow | ✅ 合法 |
| approval → idle | deny/timeout | ✅ 合法 |
| approval → done | `sessionCompleted` | ✅ 合法 |
| approval → error | `errorOccurred` | ✅ 合法 |
| error → idle | 恢复 | ✅ 合法 |
| error → running | 重试 | ✅ 合法 |
| error → thinking | 恢复后工具调用 | ✅ 合法 |
| error → approval | 工具需要审批 | ✅ 合法 |
| error → done | `sessionCompleted` | ✅ 合法 |
| done → idle | 新session | ✅ 合法 |
| done → running | 重试/新prompt | ✅ 合法 |
| done → error | `errorOccurred` | ✅ 合法 |

### 4.2 HookConnectionState 转换验证

| 转换 | 触发 | 实现 |
|------|------|------|
| unknown → connected | 首次健康检查200 | ✅ HookStatus.tsx:37-45 |
| unknown → disconnected | 首次检查网络错误×3 | ✅ HookStatus.tsx:58-68 |
| unknown → error | 首次检查非200×3 | ✅ HookStatus.tsx:47-56 |
| connected → disconnected | 连续3次网络错误 | ✅ |
| connected → error | 连续3次非200 | ✅ |
| disconnected → connected | 3秒后重连成功 | ✅ HookStatus.tsx:90-107 |
| error → connected | 下次健康检查200 | ✅ |
| disconnected → error | (不会直接发生) | — |
| error → disconnected | (不会直接发生) | — |

**发现问题：** `disconnected` 和 `error` 之间没有直接转换。如果服务器从非200变为网络不可达，需要先经过3次失败才能变，但此时状态已经是error，新的网络错误会被计为error的连续失败而非disconnected。实际上这两个状态共享同一个consecutiveFailures计数器，行为一致。**这不是bug，但设计上可以合并。**

### 4.3 Overlay 状态机

| 状态 | 条件 | 可转换为 |
|------|------|----------|
| Collapsed | expanded=false, 无approval | Expanded(点击bar) |
| Expanded | expanded=true, 无approval | Collapsed(点击bar) |
| Approval Expanded | approvalFocusKey存在, 非collapsed | Approval Collapsed(点击bar) |
| Approval Collapsed | collapsedApprovalFocusKey设置 | Approval Expanded(点击bar) |

**关键不变量：**
- `isOverlayExpanded = (expanded OR isApprovalFocusMode) AND NOT isApprovalManuallyCollapsed`
- approval自动展开：approvalFocusKey变化时 `setExpanded(true)`
- approval处理完：如果没有更多approval，`setExpanded(false)`

### 4.4 Approval Queue 状态

| 状态 | currentApprovalIndex | pendingApprovals.length |
|------|---------------------|------------------------|
| 空 | 0 | 0 |
| 单条 | 0 | 1 |
| 多条-首条 | 0 | N>1 |
| 多条-中间 | 1..N-2 | N>1 |
| 多条-末条 | N-1 | N>1 |

**边界情况：**
- 删除当前项：index调整为 `Math.min(current, newLength-1)`
- 删除前面项：index减少1
- 删除后面项：index不变
- 全部清空：index归0

---

## 五、需要测试的场景矩阵

### 5.1 状态转换测试（49 种转换组合）

| 从\到 | idle | running | thinking | streaming | approval | error | done |
|-------|------|---------|----------|-----------|----------|-------|------|
| idle | — | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| running | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| thinking | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| streaming | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| approval | ✅ | ✅ | ❌ | ❌ | — | ✅ | ✅ |
| error | ✅ | ✅ | ✅ | ❌ | ✅ | — | ✅ |
| done | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | — |

其中 ❌ 为矩阵中不允许的转换（应有 WARN 日志）。
✅ 为允许的转换（共 37 条边 + 7 条同状态 = 44 种合法转换）。
❌ 共 49-44 = 5 种非法转换需要测试不阻塞但有日志。

**应测试的非法转换：**
1. idle → streaming
2. approval → thinking
3. approval → streaming
4. error → streaming
5. done → thinking
6. done → streaming
7. done → approval

### 5.2 Session 生命周期测试

| # | 场景 | 预期 |
|---|------|------|
| SL-1 | 单session完整流程 | idle→running→thinking→streaming→done |
| SL-2 | 工具循环 | thinking→streaming→thinking→streaming→...→done |
| SL-3 | 中间有approval | running→approval→running→thinking→...→done |
| SL-4 | 工具失败 | thinking→error→running(重试)→...→done |
| SL-5 | Session中断 | running→done(isInterrupt=true) |
| SL-6 | 重复session_start | 更新现有session而非创建新session |
| SL-7 | 事件先于session_start | ensureSession创建最小session |
| SL-8 | 多session并发 | 各自独立状态机 |
| SL-9 | Session结束清理 | removeSession + clear activeSessionId |

### 5.3 Approval 流程测试

| # | 场景 | 涉及类型 |
|---|------|----------|
| AP-1 | Permission: Approve | permission |
| AP-2 | Permission: Reject | permission |
| AP-3 | Permission: Enter快捷键 | permission |
| AP-4 | Permission: Esc快捷键 | permission |
| AP-5 | Permission: 超时自动deny | permission |
| AP-6 | Permission: 有diff展示 | permission |
| AP-7 | Permission: Bash命令分析 | permission |
| AP-8 | Permission: 高/中/低风险 | permission |
| AP-9 | Permission: invoke失败 | permission |
| AP-10 | Question: 选择选项 | question |
| AP-11 | Question: 自定义输入 | question |
| AP-12 | Question: 全部回答后Submit | question |
| AP-13 | Question: Skip跳过 | question |
| AP-14 | Question: 部分回答Submit禁用 | question |
| AP-15 | Question: 超时 | question |
| AP-16 | Plan: Markdown渲染 | plan |
| AP-17 | Plan: Proceed | plan |
| AP-18 | Plan: Cancel | plan |
| AP-19 | Plan: 超时 | plan |
| AP-20 | 多approval队列导航 | all |
| AP-21 | 删除当前approval后index调整 | all |
| AP-22 | 全部approval处理后overlay折叠 | all |

### 5.4 UI 交互测试

| # | 场景 | 组件 |
|---|------|------|
| UI-1 | Bar点击展开/折叠 | Overlay |
| UI-2 | Approval到达自动展开 | Overlay |
| UI-3 | Approval模式下bar点击折叠 | Overlay |
| UI-4 | Approval处理后自动折叠 | Overlay |
| UI-5 | 无session时显示empty state | Overlay |
| UI-6 | 有session时显示status dot+label+state | Overlay |
| UI-7 | 搜索过滤session | SessionList |
| UI-8 | 状态过滤 | SessionList |
| UI-9 | 排序切换 | SessionList |
| UI-10 | 分组/平铺切换 | SessionList |
| UI-11 | 组折叠/展开 | SessionList |
| UI-12 | Session右键菜单 | SessionContextMenu |
| UI-13 | Session重命名 | SessionContextMenu |
| UI-14 | Session删除 | SessionContextMenu |
| UI-15 | Session标签管理 | SessionContextMenu |
| UI-16 | Session点击聚焦窗口 | SessionList |
| UI-17 | Session Detail显示/返回 | SessionDetail |
| UI-18 | Tool Execution展开详情 | ToolExecutionDetail |
| UI-19 | Diff Viewer渲染(+/-/context行) | DiffViewer |
| UI-20 | Diff Viewer空内容返回null | DiffViewer |
| UI-21 | Settings音效选择+预览 | SettingsPanel |
| UI-22 | Settings通知开关 | SettingsPanel |
| UI-23 | Activity时间线过滤 | ActivityTimeline |
| UI-24 | Activity导出JSON/MD | ActivityTimeline |
| UI-25 | Hook Status健康检查 | HookStatus |
| UI-26 | Hook Status断连重连 | HookStatus |
| UI-27 | Notification声音播放(done状态) | useAgentEvents |
| UI-28 | Taskbar闪烁(approval+未聚焦) | Overlay |
| UI-29 | Web Notification(approval+未聚焦) | Overlay |
| UI-30 | 窗口自适应高度(ResizeObserver) | Overlay |
| UI-31 | Approval focus固定尺寸(720px) | Overlay |

### 5.5 数据边界测试

| # | 场景 | 预期 |
|---|------|------|
| D-1 | 工具历史超过20条 | 只保留最新20条 |
| D-2 | 错误日志超过50条 | 只保留最新50条 |
| D-3 | Approval去重(相同toolUseId) | 不重复添加 |
| D-4 | Diff超过10000行 | 截断显示"more lines" |
| D-5 | Session label从cwd提取 | 取最后一段路径 |
| D-6 | 无效state值 | 降级为idle |
| D-7 | Process Watcher检测/终止 | 创建/移除session |
| D-8 | Session persistence持久化 | localStorage保存/恢复 |

### 5.6 sessionReducer 测试（9种事件类型）

| # | 事件类型 | 测试要点 |
|---|----------|----------|
| R-1 | sessionStarted | 新建session |
| R-2 | sessionStarted(已存在) | 更新现有session |
| R-3 | activityUpdated | 状态+toolName更新 |
| R-4 | activityUpdated(新session) | ensureSession创建 |
| R-5 | permissionRequested | 状态→approval |
| R-6 | questionAsked | 状态→approval |
| R-7 | sessionCompleted | 状态→done + interrupt处理 |
| R-8 | toolUseStarted | 状态→running + currentTool |
| R-9 | toolUseCompleted(成功) | toolHistory + 清除currentTool |
| R-10 | toolUseCompleted(失败) | lastError + state→error |
| R-11 | jumpTargetUpdated | pid更新 |
| R-12 | errorOccurred | state→error + lastError |

### 5.7 配置与辅助函数测试

| # | 测试项 |
|---|--------|
| CF-1 | normalizeOverlayLayoutConfig — 边界值钳制 |
| CF-2 | getToolDescription — 所有工具名模式 |
| CF-3 | classifyTool — 10种category分类 |
| CF-4 | extractBashCommand — 命令提取 |
| CF-5 | parsePlanSteps — 步骤解析 |
| CF-6 | computeState(timeout) — 倒计时计算 |
| CF-7 | labelFromId — 路径/session id处理 |

---

## 六、测试覆盖状态

> 最后更新：2026-05-15，225 tests passed / 0 failures

### 6.1 已覆盖（原有）

| 测试文件 | 覆盖项 | 数量 |
|----------|--------|------|
| state-machine.test.ts | 转换矩阵完整性+合法性 | 17 tests |
| sessions.test.ts | Store CRUD + approval queue + error logs + tool history | ~25 tests |
| ApprovalPanel.test.tsx | Permission渲染+Approve/Reject+diff+command | 11 tests |
| StatusDot.test.tsx | 各状态渲染+动画属性 | 10 tests |
| useAgentEvents.test.ts | 事件→store映射 | 17 tests |
| DiffViewer.test.tsx | diff渲染+行号+前缀+截断+文件名 | 14 tests |
| error-handling.test.ts | ErrorRegistry + AppError + toAppError | 9 tests |

### 6.2 已覆盖（本次新增，2026-05-15）

| 测试文件 | 覆盖项 | 数量 | 验收状态 |
|----------|--------|------|----------|
| **session-reducer.test.ts** | sessionReducer 全 9 种事件类型 + ensureSession + labelFromId + unknown type | 27 tests | ✅ P0 通过 |
| **ApprovalPanel.Extended.test.tsx** | QuestionPanel(11) + PlanPanel(8) + 路由分发(3) + 错误恢复 | 25 tests | ✅ P0 通过 |
| **approval-queue.test.ts** | Queue 导航、index 调整、dedup、session 清除、边界安全 | 22 tests | ✅ P0 通过 |
| **tool-helpers.test.ts** | getToolDescription(22) + classifyTool(18) + extractBashCommand(7) + getToolVisual | 51 tests | ✅ P1 通过 |
| **useApprovalTimeout.test.ts** | 倒计时、紧急标记(≤10s)、过期、store 自动清除 | 6 tests | ✅ P1 通过 |

### 6.3 测试过程中发现的代码缺陷

| # | 问题 | 严重度 | 状态 |
|---|------|--------|------|
| CD-1 | `classifyTool` regex 不匹配 `web_fetch` — 应归类为 search 但返回 other | 低 | 测试标记为 other，regex 待补 |
| CD-2 | `classifyTool` regex 不匹配 `npm_test` — 应归类为 test 但返回 other | 低 | 测试标记为 other，regex 待补 |
| CD-3 | `classifyTool` regex 不匹配 `git_commit` — 应归类为 git 但返回 other | 低 | 测试标记为 other，regex 待补 |
| CD-4 | PlanPanel markdown 渲染的 `<h1>Plan</h1>` 与 header 标题 "Plan" 重复 | 低 | 测试已用 `getAllByText` 适配 |

### 6.4 仍未覆盖（需要后续补充）

| 优先级 | 测试项 | 文件 |
|--------|--------|------|
| **P1** | Overlay展开/折叠/approval自动展开 | `Overlay.test.tsx` 新建 |
| **P1** | SessionList搜索/过滤/排序/分组 | `SessionList.test.tsx` 新建 |
| **P1** | SessionContextMenu操作 | `SessionContextMenu.test.tsx` 新建 |
| **P2** | ActivityTimeline过滤+导出 | `ActivityTimeline.test.tsx` 新建 |
| **P2** | SettingsPanel音效+通知 | `SettingsPanel.test.tsx` 新建 |
| **P2** | HookStatus健康检查+重连 | `HookStatus.test.tsx` 新建 |
| **P2** | SessionDetail详情展示 | `SessionDetail.test.tsx` 新建 |
| **P2** | ToolExecutionDetail展开/折叠 | `ToolExecutionDetail.test.tsx` 新建 |
| **P3** | AnimatedOverlay尺寸同步 | `AnimatedOverlay.test.tsx` 新建 |
| **P3** | useSessionPersistence | `useSessionPersistence.test.ts` 新建 |

---

## 七、发现的问题与风险

### 7.1 状态机问题

1. **`state_change` 与 `tool_use` 事件可能冲突**：`useAgentEvents.ts` 中 `state_change` 和 `tool_use` 都会把session设为 thinking，如果两个事件都触发了会重复更新。
2. **`updateSessionInfo` 绕过状态机校验**：`Overlay.tsx` 和 `useAgentEvents.ts` 通过 `updateSessionInfo({ state: "thinking" })` 而非 `updateSessionState` 来更新状态，这样不会触发 `safeTransition` 校验。
3. **done 状态通知音效有 debounce 但依赖 localStorage**：`useAgentEvents.ts:201-214` 使用 `localStorage.getItem("lastSoundPlayTime")` 做 debounce，在多标签页/隐私模式下可能不工作。

### 7.2 边界风险

4. **Approval timeout 与 Rust 侧 timeout 竞争**：前端 `useApprovalTimeout` 在 JS 端 60s/120s 过期时自动 `removeApprovalByToolUseId`，但 Rust 侧 `approval_timeout` 事件也在 120s 时触发。两者可能不同步。
5. **consecutiveFailures 闭包陷阱**：`HookStatus.tsx` 中 `consecutiveFailures` 是 `useState`，但在异步 `checkHealth` 中读取时可能拿到旧值（Stale Closure）。由于用了 `setConsecutiveFailures(failures)` 而非 `+1`，实际效果是 **每次都读到上一次渲染的值**，不是最新的。如果两次 checkHealth 在同一渲染周期内完成，会丢失中间状态。
6. **ensureSession 创建的 session 缺少 pid/model/source**：事件先于 `session_start` 到达时，`sessionReducer.ts` 的 `ensureSession` 只设 `labelFromId`，不设这些字段，可能导致 UI 闪烁。
7. **DiffViewer maxLines=10000 硬编码**：大型 diff 可能有性能问题，虽然做了截断但 `computeDiff` 本身要处理全部 changes。

### 7.3 UI 交互风险

8. **Approval Focus Mode 下 Settings/Activity 不可见**：`isApprovalFocusMode` 时 footer 按钮隐藏，用户无法在等待审批时查看设置。这是有意设计。
9. **Session Detail 点击同一 session 可取消**：`Overlay.tsx:209` `setViewingSessionId(prev === id ? null : id)` 是 toggle 行为，但不影响 `focus_session_window` 的调用（每次都调）。
10. **Context Menu 没有位置边界检测**：`SessionContextMenu.tsx:48` 只设了 `left/top` 但没有 clamp 到视口内，在右下角右键时菜单可能溢出。

### 7.4 测试阶段新发现（2026-05-15）

11. **`classifyTool` regex 覆盖不全**：`web_fetch`、`npm_test`、`git_commit` 等下划线形式的工具名不在任何分类 regex 中，全部返回 `other`。实际 Claude Code 工具名使用 PascalCase（`Read`/`Write`/`Bash`），但 hook server 或其他 agent 可能传入其他形式。建议补充或统一工具名映射。
12. **PlanPanel markdown 与 header 标题冲突**：`PlanPanel` 组件的 header 标题为 "Plan"，如果 `planContent` 的 markdown 中也包含 `# Plan` 标题，DOM 中会出现两个 "Plan" 文本节点，导致 `getByText('Plan')` 抛出 ambiguous 错误。测试已用 `getAllByText` 适配，但组件可以考虑加 `data-testid` 区分。

---

## 八、HTTP Hook 端点完整列表

| 端点 | 方法 | 事件类型 | 阻塞 |
|------|------|----------|------|
| `/hooks/session-start` | POST | session_start | 否 |
| `/hooks/pre-tool-use` | POST | state_change + tool_use | 是(30s timeout) |
| `/hooks/post-tool-use` | POST | tool_complete + state_change | 否 |
| `/hooks/post-tool-use-failure` | POST | tool_error + state_change | 否 |
| `/hooks/notification` | POST | notification | 否 |
| `/hooks/stop` | POST | state_change(done) | 否 |
| `/hooks/user-prompt-submit` | POST | state_change(running) | 否 |
| `/hooks/permission-request` | POST | permission_request + state_change(approval) | 是(120s timeout) |
| `/hooks/ping` | POST | hook_heartbeat | 否 |
| `/hooks/health` | GET | — | 否 |

---

## 九、数据流完整性检查

### 9.1 数据流：Hook → Rust → Frontend → Store → DOM

```
curl POST /hooks/permission-request
  → hook_server.rs 处理
  → 阻塞等待响应（120s timeout）
  → app.emit("permission_request", payload)
  → useAgentEvents.ts listen("permission_request")
  → updateSessionState(sessionId, "approval")
  → addPendingApproval(request)
  → Overlay.tsx 检测 approvalFocusKey 变化
  → setExpanded(true) + invoke("update_overlay_size", ...)
  → AnimatedOverlay.tsx framer-motion 动画
  → ApprovalPanel.tsx 渲染
  → 用户点击 Approve
  → invoke("submit_approval_response", { approved: true })
  → Rust 发送响应给 Claude Code
  → removeCurrentApproval()
  → setExpanded(false) (如果无更多approval)
```

### 9.2 数据流：新 SessionState 路径

```
Named Pipe → pipe_server.rs
  → session_state.rs apply()
  → app.emit("agent_event", payload)
  → useAgentEvents.ts listen("agent_event")
  → dispatchAgentEvent(event.payload)
  → sessionReducer(state, event)
  → 返回新 sessions 数组
  → Zustand set 更新
  → React re-render
```

---

## 十、测试优先级总结

### 立即需要（P0）— 阻塞正确性

1. **sessionReducer 单元测试**：覆盖所有 9 种事件类型
2. **非法状态转换测试**：验证 7 种非法转换产生 WARN 日志但不阻塞
3. **QuestionPanel / PlanPanel 测试**：当前 0 覆盖
4. **Approval Queue 边界测试**：导航、删除、index 调整

### 短期需要（P1）— 核心 UI 正确性

5. **Overlay 展开/折叠/approval 自动展开**
6. **SessionList 完整交互**
7. **DiffViewer 渲染测试**
8. **useApprovalTimeout 计时精度**

### 中期需要（P2）— 体验保障

9. **ActivityTimeline / SettingsPanel**
10. **HookStatus 健康检查 + 重连**
11. **辅助函数单元测试**（getToolDescription, classifyTool）

### 长期（P3）— 回归保障

12. **AnimatedOverlay 尺寸同步**
13. **Session Persistence**
14. **E2E Playwright 全流程**

---

## 十一、所有返回/回退/重置逻辑（完整清单）

### 11.1 UI 面板返回导航

| # | 从 | 到 | 触发方式 | 涉及状态 |
|---|----|----|----------|----------|
| NAV-1 | Session Detail | Session List | 点击 `← Back` 按钮 | `viewingSessionId → null` |
| NAV-2 | Settings Panel | Session List | 点击 `← Back` 按钮 | `showSettings → false` |
| NAV-3 | Activity Timeline | Session List | 点击 `← Back` 按钮 | `showActivity → false` |
| NAV-4 | 展开(普通) | 折叠 | 点击 Status Bar | `expanded → false` |
| NAV-5 | Approval Focus 展开 | Approval Focus 折叠 | 点击 Status Bar | `collapsedApprovalFocusKey = approvalFocusKey`, `expanded → false` |
| NAV-6 | Approval Focus 折叠 | Approval Focus 展开 | 点击 Status Bar | `collapsedApprovalFocusKey → null`, `expanded → true` |
| NAV-7 | Session List | Session Detail | 点击 session(展开中) | `viewingSessionId = session.id` |
| NAV-8 | Session Detail | Session List | 再次点击同一 session | `viewingSessionId → null` (toggle) |
| NAV-9 | Session List | Settings Panel | 点击 ⚙ Settings | `showSettings → true`, `showActivity → false`, `viewingSessionId → null` |
| NAV-10 | Session List | Activity Timeline | 点击 📊 Activity | `showActivity → true`, `showSettings → false`, `viewingSessionId → null` |
| NAV-11 | Settings/Activity | 另一面板 | 点击另一按钮 | 互斥切换：一个 true 其他 false |
| NAV-12 | Session Detail | Session List | session 被删除 | 自动清空 `viewingSessionId` (useEffect 监听) |

**面板互斥状态矩阵：**

```
isApprovalFocusMode = true  →  只显示 ApprovalFocusContent (最高优先级)
showSettings = true         →  只显示 SettingsPanel
showActivity = true         →  只显示 ActivityTimeline
viewingSessionId != null    →  只显示 SessionDetail
否则                        →  显示 SessionList + 底部footer
```

### 11.2 Approval 返回/完成流转

| # | 场景 | 流转 | 涉及状态 |
|---|------|------|----------|
| AP-B1 | Approve 成功 | `pending → invoking → onHandled()` | `status: pending → approving → removed` |
| AP-B2 | Reject 成功 | `pending → invoking → onHandled()` | `status: pending → rejecting → removed` |
| AP-B3 | Submit(Question) 成功 | `pending → submitting → onHandled()` | `status: pending → submitting → done` |
| AP-B4 | Skip(Question) | `pending → submitting(reject) → onHandled()` | `approved: false, answers: null` |
| AP-B5 | Proceed(Plan) | `pending → submitting(approve) → onHandled()` | `approved: true` |
| AP-B6 | Cancel(Plan) | `pending → submitting(reject) → onHandled()` | `approved: false` |
| AP-B7 | invoke 失败 | `approving/rejecting/submitting → pending` | `submitError = message` |
| AP-B8 | 超时过期 | `pending → expired` | `isExpired → true`, 按钮disabled, 自动 `removeApprovalByToolUseId` |
| AP-B9 | Approval 处理后(无更多) | `expanded → collapsed` | `setExpanded(false)` |
| AP-B10 | Approval 处理后(还有) | `index调整, 保持expanded` | `removeCurrentApproval()`, `currentApprovalIndex` 自动调整 |
| AP-B11 | Approval 处理后防止重复展开 | `handledApprovalStateFocusKeyRef` 设为 resolvedKey | 同一 approval 不会再次自动展开 |
| AP-B12 | 新 approval 到达 | 清除防重复标记 | `collapsedApprovalFocusKey → null`, `hadApprovalRequestRef → true` |

**Approval 完整状态生命周期 (PermissionPanel)：**

```
pending → approving → (成功) → onHandled → removeCurrentApproval
                   → (失败) → pending + submitError

pending → rejecting → (成功) → onHandled → removeCurrentApproval
                   → (失败) → pending + submitError
```

**Approval 完整状态生命周期 (QuestionPanel)：**

```
pending → (选择options + 输入custom) → submitting → (成功) → onHandled
                                                 → (失败) → pending + submitError
pending → Skip → submitting(reject) → (成功) → onHandled
                                     → (失败) → pending + submitError
```

### 11.3 状态机回退转换（反向流转）

| # | 转换 | 触发场景 | 代码路径 |
|---|------|----------|----------|
| ST-B1 | error → idle | 错误后恢复/新session | `sessionReducer errorOccurred → sessionStarted` |
| ST-B2 | error → running | 错误后重试 | `sessionReducer errorOccurred → activityUpdated(running)` |
| ST-B3 | error → thinking | 错误后继续工具调用 | `sessionReducer errorOccurred → toolUseStarted` |
| ST-B4 | error → approval | 错误后需要审批 | `sessionReducer errorOccurred → permissionRequested` |
| ST-B5 | error → done | 错误后session结束 | `sessionReducer errorOccurred → sessionCompleted` |
| ST-B6 | done → idle | session完成→新session | `sessionReducer sessionCompleted → sessionStarted` |
| ST-B7 | done → running | 完成→重新运行 | `sessionReducer sessionCompleted → activityUpdated(running)` |
| ST-B8 | done → error | 完成后出错 | `sessionReducer sessionCompleted → errorOccurred` |
| ST-B9 | approval → idle | 审批deny/timeout | `approval_timeout` event 或 deny |
| ST-B10 | approval → running | 审批approve/自动allow | `permission_resolved` event(behavior=allow) |
| ST-B11 | approval → done | 审批中session完成 | `sessionCompleted` event |
| ST-B12 | approval → error | 审批中出错 | `errorOccurred` event |
| ST-B13 | running → idle | 运行中session结束 | `sessionCompleted` event |
| ST-B14 | running → done | 直接完成(无工具调用) | `state_change(done)` |
| ST-B15 | streaming → idle | streaming中session结束 | `sessionCompleted` event |
| ST-B16 | thinking → idle | thinking中session结束 | `sessionCompleted` event |

### 11.4 Error Recovery（错误恢复）

| # | 错误场景 | 恢复方式 | 代码路径 |
|---|----------|----------|----------|
| ER-1 | React 渲染错误 | Error Boundary → Retry 按钮 | `error-boundary.tsx` `resetErrorBoundary()` → `setState({hasError: false})` |
| ER-2 | Tauri IPC invoke 失败 | Approval 按钮 submitError 显示 | `ApprovalPanel.tsx` catch → `setSubmitError(String(error))`, `setStatus("pending")` |
| ER-3 | focus_session_window 失败 | Overlay error banner 显示 | `Overlay.tsx:216-217` `setError("Failed to focus window")` |
| ER-4 | Error banner 点击 | 关闭错误提示 | `Overlay.tsx` `clearError` → `setError(null)` |
| ER-5 | Config 加载失败 | 使用 DEFAULT_CONFIG | `store/config.ts` catch → 保持默认值 |
| ER-6 | Sound 预览失败 | 静默降级 | `SettingsPanel.tsx` catch → logger.warn |
| ER-7 | Notification 播放失败 | 静默降级 | `useAgentEvents.ts:209` catch → logger.warn |
| ER-8 | Hook Server 断连 | 3s后自动重连 | `HookStatus.tsx:90-107` setTimeout → invoke("get_hook_server_status") |
| ER-9 | 健康检查网络错误 | 3次连续失败后→disconnected | `HookStatus.tsx:58-68` |
| ER-10 | 健康检查非200 | 3次连续失败后→error | `HookStatus.tsx:47-56` |
| ER-11 | Notification permission denied | Web Notification catch | `Overlay.tsx:177` catch → 不显示 |
| ER-12 | Session persistence restore 失败 | 静默忽略 | `useSessionPersistence.ts:81-82` 空 catch |
| ER-13 | Session persistence save 失败 | logger.warn | `useSessionPersistence.ts:38-39` |

### 11.5 Overlay 窗口返回/重置流转

| # | 状态流转 | 触发 | 涉及的 ref / state |
|---|----------|------|---------------------|
| OV-B1 | Compact → Expanded | 点击 bar(无approval) | `expanded: false → true` |
| OV-B2 | Expanded → Compact | 点击 bar(无approval) | `expanded: true → false` |
| OV-B3 | Compact → Approval Expanded | approval 到达 | `expanded → true`, `hadApprovalRequestRef = true` |
| OV-B4 | Approval Expanded → Approval Collapsed | 点击 bar | `collapsedApprovalFocusKey = approvalFocusKey`, `expanded → false` |
| OV-B5 | Approval Collapsed → Approval Expanded | 点击 bar | `collapsedApprovalFocusKey → null`, `expanded → true` |
| OV-B6 | Approval Expanded → Compact | 最后一条 approval 处理完 | `expanded → false`, `hadApprovalRequestRef → false` |
| OV-B7 | Approval Expanded → Indexed | 处理完但还有更多 | `removeCurrentApproval()`, 保持 `expanded = true` |
| OV-B8 | Expanded → Compact | Settings/Activity 面板时点击 bar | `expanded → false` |

**关键 ref 生命周期：**

```
hadApprovalRequestRef:
  false → true  (approval到达时)
  true  → false (approval消失且无新approval时)
  用途：决定"无approval时是否自动折叠"

handledApprovalStateFocusKeyRef:
  null → "session:xxx" (approval处理完后，防止同一session的approval再次自动展开)
  在下一次 approval 消失时重置为 null

collapsedApprovalFocusKey:
  null → approvalFocusKey (用户手动折叠approval)
  approvalFocusKey → null (用户重新展开)
  null (approval消失时)
```

### 11.6 Session 生命周期中的清理/回退

| # | 事件 | 清理动作 |
|---|------|----------|
| SC-1 | session_end | `removeSession(id)` → 如果是 activeSession 则 `activeSessionId → null` |
| SC-2 | session_end(通过Process) | `removeSession("process-{pid}")` |
| SC-3 | session 离开 approval | `removeApprovalsBySessionId(sessionId)` 清除该session所有pending approvals |
| SC-4 | viewingSession 被删除 | useEffect 自动 `setViewingSessionId(null)` (Overlay.tsx:198-202) |
| SC-5 | activeSession 被删除 | 自动 `activeSessionId → null` → 有其他session时选第一个 (Overlay.tsx:225-228) |
| SC-6 | tool_complete | `currentTool → undefined`, `toolName → undefined`, `filePath → undefined` |
| SC-7 | tool_error | `currentTool → undefined`, `toolName → undefined`, `filePath → undefined`, `lastError = error` |
| SC-8 | approval_timeout | `removeApprovalByToolUseId(tool_use_id)` |
| SC-9 | permission_resolved(auto-allow) | `removeApprovalByToolUseId(tool_use_id)` |
| SC-10 | test_reset 事件 | 全部清空：`sessions=[], activeSessionId=null, pendingApprovals=[], currentApprovalIndex=0` |

### 11.7 Session Persistence 返回/恢复

| # | 阶段 | 动作 | 时机 |
|---|------|------|------|
| SP-1 | 序列化 | `serializeSession()` 保留字段，toolHistory截断到10条 | save时 |
| SP-2 | 保存 | `invoke("save_sessions")` 写入磁盘 | 10s定时 / beforeunload / visibilitychange hidden / unmount |
| SP-3 | 恢复 | `invoke("load_sessions")` 读取磁盘 | App mount 时 |
| SP-4 | 恢复状态 | 恢复的 session 一律设 `state: "done"` | 避免恢复"运行中"的假状态 |
| SP-5 | 跳过已有 | 如果 hook 事件已创建同名 session，跳过恢复 | `store.sessions.find(id)` 检查 |
| SP-6 | 恢复 Groups | `__meta.groups` 条目恢复到 store | restoreSessions() |
| SP-7 | 保存时过滤空 | `sessions.length === 0 && groups.length === 0` 时不保存 | persistSessions() |

### 11.8 Config / Notification Permission 返回

| # | 流转 | 说明 |
|---|------|------|
| CF-B1 | Config 加载失败 → 使用 DEFAULT_CONFIG | `store/config.ts` catch 保持默认 |
| CF-B2 | Notification permission: default → granted | `Notification.requestPermission()` (Overlay mount 时) |
| CF-B3 | Notification permission: default → denied | 用户拒绝，Web Notification catch |
| CF-B4 | notificationsEnabled: true → false | Settings 面板关闭 → `localStorage.setItem("vibe-notifications", "false")` |
| CF-B5 | notificationsEnabled: false → true | Settings 面板开启 → localStorage 更新 |
| CF-B6 | sound: "hero" → "pop" | Settings 选择 → localStorage + invoke preview |
| CF-B7 | sound: any → "none" | 关闭通知音效 |

### 11.9 Geometry Sandbox 返回

| # | 流转 | 说明 |
|---|------|------|
| GS-1 | Any Mode → Compact | 点击 "Collapse" 按钮 |
| GS-2 | Compact → Adaptive Short | 点击 "Geometry Sandbox" 按钮 |
| GS-3 | Mode 切换时 body scrollTop 重置 | `handleModeChange` 中 `body.scrollTop = 0` |
| GS-4 | Adaptive Long → measuredHeight = 720 | `setMeasuredHeight(EXPANDED_MAX_HEIGHT)` |
| GS-5 | Adaptive Short → measuredHeight = 320 | `setMeasuredHeight(ADAPTIVE_MIN_HEIGHT)` |
| GS-6 | Ctrl+Shift+G 切换 | `setShowGeometrySandbox(toggle)` |

### 11.10 Approval Focus Mode 防重复展开机制

这是最复杂的返回逻辑，详细说明：

```
状态：handledApprovalStateFocusKeyRef (useRef)
值：  null | "session:xxx"

时间线：
  T0: approval_1 到达 (session-A, toolUse-1)
      → approvalFocusKey = "request:toolUse-1"
      → handledRef = null
      → 自动展开

  T1: 用户 Approve
      → onHandled()
      → resolvedKey = "session:session-A"
      → handledRef = "session:session-A"  ← 设置防重复标记
      → collapsedApprovalFocusKey = "session:session-A"
      → removeCurrentApproval()
      → expanded = false (假设无更多approval)

  T2: session-A 的新 state_change 到达 (approval → running)
      → approvalFocusKey 计算为 "session:session-A"
      → 但 handledRef === "session:session-A"
      → 跳过自动展开! (useEffect 中 return)

  T3: state_change 变为 thinking
      → approvalFocusKey = null (无approval)
      → handledRef 重置为 null
      → collapsedApprovalFocusKey 重置为 null
      → hadApprovalRequestRef = false

  T4: approval_2 到达 (session-A, toolUse-2)
      → handledRef = null (已重置)
      → 自动展开 ✓
```

### 11.11 需要测试的返回逻辑场景

| # | 场景 | 预期 |
|---|------|------|
| BT-1 | Approval Approve → 同session再次 approval → 应自动展开 | ✅ 展开 |
| BT-2 | Approval Approve → 同session state_change(approval残留) → 不应自动展开 | ✅ 不展开 |
| BT-3 | Settings → Back → 再次点 Settings | ✅ 正常切换 |
| BT-4 | Session Detail → Back → 点另一个 session | ✅ 显示新session详情 |
| BT-5 | Session Detail 显示中 session 被删除 | ✅ 自动回到 list |
| BT-6 | Approval 超时 → removeApprovalByToolUseId → 无更多 → overlay折叠 | ✅ 折叠 |
| BT-7 | 多 approval → 处理完当前 → 下一条自动展示 | ✅ 展示下一条 |
| BT-8 | 多 approval → 全部超时 → overlay折叠 | ✅ 折叠 |
| BT-9 | Approval 处理中 invoke 失败 → 重试 | ✅ 回到pending状态 |
| BT-10 | Error state → 新 prompt → running | ✅ 正常转换 |
| BT-11 | Done state → 新 session → idle → running | ✅ 完整恢复 |
| BT-12 | App 重启 → 恢复 session → hook 事件到 → 不重复创建 | ✅ 跳过 |
| BT-13 | App 重启 → 恢复 session → state 为 done | ✅ 不显示为运行中 |
| BT-14 | Hook Server 断连 → 重连 → status 恢复 | ✅ connected |
| BT-15 | Config 加载失败 → 使用默认配置 | ✅ DEFAULT_CONFIG |
| BT-16 | React 渲染错误 → Error Boundary → Retry | ✅ 恢复渲染 |
| BT-17 | Error banner 显示 → 点击关闭 | ✅ banner消失 |
| BT-18 | Approval Focus 折叠 → 新 approval 到 → 展开 | ✅ 展开 |
| BT-19 | Geometry Sandbox → Collapse → 点击恢复 | ✅ Compact → Expanded |
| BT-20 | 搜索 → 清空 → 显示全部 | ✅ 恢复完整列表 |
| BT-21 | 状态过滤 → 切回 All → 显示全部 | ✅ 恢复 |
| BT-22 | 分组折叠 → 展开 → 显示组内 | ✅ 恢复 |
| BT-23 | 音效选择 → 选 none → done 时不播放 | ✅ 静音 |
| BT-24 | Notification granted → 关闭 → approval 到达 → 不弹系统通知 | ✅ 只闪烁taskbar |
