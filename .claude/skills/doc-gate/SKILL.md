---
name: doc-gate
description: |
  Documentation Gate 流程和文件导航。定义源码修改前的必经检查步骤，以及项目文件的读取时机。
  触发条件：
  - 需要修改源码（bug fix、feature、behavior change）
  - "Documentation Gate"、"doc gate"、"文档门禁"
  - 用户问"应该先看什么文件"、"工作流程是什么"
  - 新对话开始时确定上下文
  不要触发：纯分析/只读请求（不涉及源码修改）
---

# Documentation Gate

本项目使用 Harness Engineering 架构，文档先行作为运行时门禁。任何 bug、功能、行为变更都不能直接改源码。

## 新对话读取顺序

```
1. CLAUDE.md            ← 项目配置和导航入口
2. WORKFLOW.md           ← 工作流程和 Documentation Gate
3. architecture.md       ← 架构约束 + 模块详情
4. task.json             ← 任务列表、依赖、文档引用
5. progress.txt          ← 当前进度、测试证据
6. 源码和测试            ← 仅在 Gate 通过后
```

需要查阅具体模块时，先看对应文档：
- 动画 → `docs/architecture/animation-design.md`
- 状态流程 → `docs/architecture/states-and-flows.md`
- Hook 配置 → `docs/hooks/hooks-setup.md`
- 测试 → `docs/testing/testing.md`
- 命令解析 → `docs/command-registry-design.md`

## Gate 检查流程

编码前**必须**通过：

1. 读取 `WORKFLOW.md`、`task.json` 和 `progress.txt`。
2. 找到当前任务的 `requirement_ref` 和 `design_ref`，或定位对应的文档。
3. 如果文档已定义正确行为但代码不符 → 先在 `progress.txt` 记录为 implementation bug，再修代码。
4. 如果用户请求的是新行为或变更 → 先更新相关文档，再修代码。
5. 如果用户明确确认跳过文档 → 在 `progress.txt` 记录跳过原因、风险和待补文档。

### 通过条件

| 检查项 | 通过标准 |
|--------|----------|
| 任务文档引用 | 有 `requirement_ref` 和 `design_ref`，或等价文档 |
| 行为定义 | 预期行为已写入文档 |
| 文档更新 | 行为变化时文档已先更新 |
| 跳过记录 | 用户确认跳过时 `progress.txt` 记录了原因和风险 |

### 未通过时

1. 不进入源码实现。
2. 先更新相关文档或记录显式跳过。
3. 在 `progress.txt` 记录 Gate 状态。

## Memory 优先级

```text
用户最新明确指令
> task.json / progress.txt
> CLAUDE.md / WORKFLOW.md / architecture.md
> skill instructions
> memory hints
```

任务只有在 docs/code/tests 一致后才能标记完成。
