# Vibe Island UX 优化 PRD

> 基于 Firecrawl（搜索引擎）和 writing-plans（PRD/实施计划）两个 Hermes skill 的使用体验分析，
> 结合同类工具调研，制定 Vibe Island 悬浮窗用户体验优化方案。

**版本：** v0.2  
**日期：** 2026-05-15  
**状态：** 需求初审

---

## 一、背景

Vibe Island 39 个任务全部完成，核心功能（HTTP Hooks、审批流、Diff 预览、多 Session、动画）已稳定。当前阶段进入 **"常态使用打磨"** —— 不是加新功能，而是优化 Agent 工作流中使用 Vibe Island 的真实体验。

用户日常使用 Hermes 的两个高频 Skill：

### 1. Firecrawl — 搜索 Skill

```
search → scrape → map+crawl → interact
```

**工作流特征：**
- 多步递进（不是一次查询）
- 需要看搜索结果→选 URL→读内容→提取信息→反馈 credit
- 执行时间长（search 秒级、crawl 分钟级）
- 每次消耗 credits（关注用量）

**用户在 Vibe Island 中的期待：**
- 看到 agent 正在 "searching (3/8 results)" 而非模糊的 "running"
- 知道进度 —— 第几步、还剩多少
- 了解消耗 —— 本次花了多少 credits

### 2. writing-plans — 写计划 Skill

```
读 task.json → 检查依赖 → Documentation Gate → 写 task → commit
```

**工作流特征：**
- 严格的 Documentation Gate（先读文档再写代码）
- TDD 三步循环（写失败测试→写最小代码→通过测试）
- Bite-sized tasks（每个 task 2-5 分钟）
- 频繁 git commit

**用户在 Vibe Island 中的期待：**
- 看到当前 task 编号和标题（如 "Task 17: Fix Approval Panel Height"）
- 看到 gate 状态（blocked / passed / writing）
- 看到 test 结果（FAIL→PASS 转换）

---

## 二、现状问题分析

### 问题 1：Session 状态过于粗粒度

| 当前 | 问题 |
|------|------|
| `running` | "agent 在跑" — 但不知道在搜索还是写代码还是跑测试 |
| `thinking` | "agent 在想" — 但不知道在搜索知识库还是读文档 |

**Firecrawl 搜索时：** 始终显示 `running`，用户不知道搜完了没有、找到几个结果。  
**writing-plans 写 PRD 时：** 也显示 `running`，和搜索无法区分。

### 问题 2：Session 列表缺少上下文信息

当前 Session 列表显示：label（项目名）+ state dot。缺少：
- 当前在做什么（tool name / task title）
- 运行了多久
- 是否有待处理（approval pending）

这在**多 Session 并行**场景下尤其痛苦——用户开着 Claude Code 写代码 + 另一个 Claude Code 做调研，两个 session 都显示蓝色 `running`，分不清谁在做什么。

### 问题 3：Approval 通知发现性不足

- 当前：Overlay 展开显示橙色 approval dot
- 痛点：用户切到其他窗口时看不到 overlay（虽然置顶但透明度高）
- 调研参考：Reddit r/ClaudeCode 用户反馈 "kept missing 'needs me' moments"
- 移动审批系统 dev.to 文章：核心价值是 "stops staring at a screen for 5 minutes"

### 问题 4：Search/Scrape 无进度反馈

Firecrawl 的 `search --scrape` 需要几秒到几十秒。hook 只反馈 `PreToolUse` 和 `PostToolUse`，中间是黑洞。

### 问题 5：Writing-plans Gate 无可视化

Documentation Gate 是 writing-plans 的核心约束（文档不过不写代码），但 Vibe Island 没有展示 gate 状态。Executor 子 agent 是否 blocked 不可见。

---

## 三、竞品 / 同类参考

### RustyIsland（GitHub）
- **同类型：** Tauri + React 实现的 Dynamic Island 风格系统监控
- **借鉴：** 实时数据显示（CPU/内存/网络）— 系统监控需要精确数字，Agent 监控同样需要
- **差异：** 不是 AI agent 场景，但悬浮窗交互模式可参考

### Claude Code Companion Overlay（Reddit 社区）
- **痛点验证：** 用户明确说 "kept missing approval moments"
- **期望：** 跨 session 的通知聚合
- **教训：** 通知必须比当前方案更显眼

### Mobile Approval System（dev.to）
- **核心洞察：** "最好的开发工具是让你不用盯着屏幕的那个"
- **场景：** 桌面审批→移动端推送
- **借鉴：** 审批不一定在 overlay 里，可以走系统通知

---

## 四、优化方案

### Phase 1：信息密度提升（优先级 P0）

**1.1 Tool Context on Session Bar**

Session 胶囊从 `[● project-name]` 变为：

```
[🔵 running] vibe-island
  └─ searching "AI agent overlay desktop UX"... (3/8 results)
```

```
[🔵 running] vibe-island  
  └─ Task 17: Fix Approval Panel Height — writing test
```

**实现路径：**
- 后端 `tool_use` 事件已包含 `toolName` 和 `input`
- 前端 `Session` 类型已有 `currentTool` 字段
- 需要：在 Session bar 下方或 tooltip 里显示 `currentTool.toolName + 摘要`

**1.2 Session 运行时长**

每个 session 旁显示已运行时间：

```
[🔵 running] vibe-island · 3m42s
  └─ searching...
```

**实现路径：**
- 前端 `session.createdAt` + `setInterval` 即可
- 不依赖后端变更

**1.3 多 Session 视觉区分**

为不同 tool category 使用不同 icon/颜色：

| Tool Category | Icon | 颜色 |
|--------------|------|------|
| 搜索 (search/scrape) | 🔍 | cyan |
| 文件读写 (read/write/edit) | 📝 | blue |
| 终端 (bash/shell) | 💻 | purple |
| 审批等待 | ⏳ | amber |
| Test 运行 | 🧪 | green |

**实现路径：**
- 需要新增 `toolCategory` 映射逻辑（前端根据 `toolName` 归类）
- 不依赖后端变更

### Phase 2：审批通知增强（优先级 P0）

**2.1 Windows 系统通知**

当 approval 到达且 Vibe Island 窗口不在焦点时，发 Windows Toast Notification：

> **Claude Code 需要你的审批**  
> vibe-island — Write file `src/commands.rs`  
> [Approve] [Reject]

**实现路径：**
- Tauri 2.0 有 notification plugin
- 前端检测 `document.hasFocus()` 判断是否需要推送
- 用户可在 Settings 关闭此通知

**2.2 任务栏闪烁**

当有 pending approval 且窗口最小化/不可见时，任务栏图标闪烁。

**实现路径：**
- Tauri `Window::request_user_attention()` 

### Phase 3：进度可视化（优先级 P1）

**3.1 Search/Scrape 进度条**

Firecrawl `search --scrape` 时，hook 只能知道开始和结束。需要中间态：

**方案 A（推荐）：** Named Pipe 进度上报  
Firecrawl CLI 没有内置进度回调，但可以在 Agent SDK 层面 hook：
- Node.js SDK 包装 `firecrawl search` 子进程
- 解析 stdout 的逐行输出（火焰 emoji + 进度文本）
- 通过 Named Pipe 推送到 Vibe Island

**方案 B（简单）：** 预估时间 + 旋转动画  
根据历史数据估算各操作耗时，显示预估进度条。不精确但有心理反馈。

**3.2 Gate 状态指示**

writing-plans 执行时，显示当前 gate 状态：

```
[🔵 running] writing-plans
  └─ 📋 Documentation Gate: checking architecture.md...
```

```
[🔵 running] writing-plans
  └─ 📋 Gate PASSED → writing plan
```

**实现路径：**
- 需要 Agent SDK 发送 gate 状态事件
- 或在 hook server 解析 `PreToolUse` 的 `tool_input` 中识别 "read_file architecture.md" 等 gate 文件

### Phase 4：Firecrawl Credit 用量（优先级 P2）

**4.1 用量显示**

在 session detail 或 tooltip 中显示本次搜索的 credit 消耗：

```
[🔵 running] research-project · 12m05s
  └─ 🔍 searched "Tauri overlay" — 5 results, used 2 credits
```

**实现路径：**
- Agent SDK 解析 Firecrawl CLI 输出或 API 返回的 credit 信息
- 通过 Named Pipe 上传到 Vibe Island

### Phase 5：Writing-plans Task 跟踪（优先级 P2）

**5.1 Task 状态条**

当 writing-plans 执行时，在 session 详情中显示任务进度：

```
Task 17/39: Fix Approval Panel Window Height
  ├── [✓] Read architecture.md
  ├── [✓] Read task.json  
  ├── [⏳] Write failing test
  ├── [ ] Make test pass
  └── [ ] Commit
```

**实现路径：**
- Agent SDK 从 task.json 解析当前 task
- 通过 Named Pipe 同步进度到 Vibe Island
- 或 hook server 解析 `PostToolUse` / `PreToolUse` 推断进度

---

## 五、技术可行性

| 优化项 | 前端改动 | 后端改动 | Agent SDK 改动 | 风险 |
|--------|---------|---------|---------------|------|
| 1.1 Tool Context | 小（显示已有字段） | 无 | 无 | 低 |
| 1.2 运行时长 | 极小（前端计算） | 无 | 无 | 低 |
| 1.3 多 Session 图标 | 中（tool→category 映射） | 无 | 无 | 低 |
| 2.1 系统通知 | 中（notification API） | Tauri plugin | 无 | 低 |
| 2.2 任务栏闪烁 | 极小 | Window API | 无 | 低 |
| 3.1 进度条 | 中（进度条组件） | 可能需要新事件 | 需要（解析 CLI 输出） | 中 |
| 3.2 Gate 状态 | 小 | 可能需要新事件 | 需要（发送 gate 事件） | 中 |
| 4.1 Credit 用量 | 小 | 可能需要新事件 | 需要（解析用量） | 中 |
| 5.1 Task 跟踪 | 中（task 进度组件） | 可能需要新事件 | 需要（task 状态上报） | 高 |

**建议分期：**
- **Sprint 1（本周）：** Phase 1 + Phase 2 — 前端为主，即可明显改善体验
- **Sprint 2（下周）：** Phase 3 — 需要 SDK 配合，但影响最大（搜索进度是高频痛点）
- **Sprint 3（后续）：** Phase 4 + Phase 5 — 锦上添花

---

## 六、验收标准

### Sprint 1
- [ ] Session bar 显示当前 tool 名称和简短描述
- [ ] Session bar 显示运行时长
- [ ] 不同 tool category 使用不同颜色/图标
- [ ] 非焦点时有 approval 时弹出系统通知
- [ ] 有 pending approval 时任务栏图标闪烁

### Sprint 2
- [ ] Search 操作显示进度（结果计数 / 预估时间）
- [ ] Documentation Gate 状态在 session 详情可见

### Sprint 3
- [ ] Firecrawl credit 用量可见
- [ ] writing-plans task 进度在 session 详情中可见

---

## 七、关联文档

- `architecture.md` — 架构约束和 Session/ToolExecution 数据模型
- `WORKFLOW.md` — Orchestrator + Executor + Verifier 工作流
- `docs/states-and-flows.md` — Agent 状态与 UI 流程
- `docs/animation-design.md` — 动画系统方案
- `docs/testing.md` — 测试策略（新组件需要测试覆盖）
