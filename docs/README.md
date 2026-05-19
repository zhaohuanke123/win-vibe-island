# Vibe Island 文档索引

> 项目根：`/mnt/c/Users/zhk02/Desktop/win-vibe-island`

---

## 入口文档（AI Agent 首次读取）

| 文档 | 说明 |
|------|------|
| [AGENTS.md](../AGENTS.md) | 项目配置、读取顺序、文件导航、Memory 规则 **（入口）** |
| [WORKFLOW.md](../WORKFLOW.md) | 工作流程和 Documentation Gate |
| [architecture.md](../architecture.md) | 架构约束、启动流程、IPC 命令、路由表、已知边界 |

## 架构与设计

| 文档 | 说明 |
|------|------|
| [command-registry-design.md](command-registry-design.md) | 声明式命令注册表设计（TOML 规格 + tldr-pages 工具链） |
| [architecture/state-machine.md](architecture/state-machine.md) | 状态转换矩阵定义与维护规则 |
| [architecture/states-and-flows.md](architecture/states-and-flows.md) | Agent 状态与 UI 流程 |
| [architecture/animation-design.md](architecture/animation-design.md) | 动画系统方案与参数 |
| [architecture/diffviewer-spec.md](architecture/diffviewer-spec.md) | DiffViewer 自适应行为规范 |

## Hook 集成

| 文档 | 说明 |
|------|------|
| [hooks/hooks-setup.md](hooks/hooks-setup.md) | Claude Code Hooks 配置指南 |
| [hooks/claude-settings.example.json](hooks/claude-settings.example.json) | Claude Code settings 配置示例 |

## 测试

| 文档 | 说明 |
|------|------|
| [testing/testing.md](testing/testing.md) | 测试策略 + 三层测试 API + data-testid 速查 |
| [testing/comprehensive-test-and-state-audit.md](testing/comprehensive-test-and-state-audit.md) | 全面测试与状态审计 |

## 设计 PRD & 迁移

| 文档 | 说明 |
|------|------|
| [design/ux-optimization-prd.md](design/ux-optimization-prd.md) | UX 优化 PRD — Firecrawl + writing-plans 体验改善方案 |
| [design/open-island-alignment-prd.md](design/open-island-alignment-prd.md) | Open Island 对标架构升级 PRD — v2.0 路线图 |
| [design/v8-migration-plan.md](design/v8-migration-plan.md) | v8 UI/动画/功能迁移计划（已完成，保留参考） |

## 运维

| 文档 | 说明 |
|------|------|
| [operations/release-process.md](operations/release-process.md) | 发布流程与 checklist |

## 任务与进度

| 文件 | 说明 |
|------|------|
| [task.json](../task.json) | 任务定义、依赖、文档引用 |
| [progress.txt](../progress.txt) | 开发历史、文档更新、测试证据 |

## 归档文档

以下文档已移至 `docs/archive/`，保留参考但不再活跃使用：

- `archive/TASK.md` — 早期任务定义
- `archive/PLAN_PHASE2.md` — Phase 2 计划
- `archive/cc-experience-improvement.md` — Claude Code 体验改进方案
- `archive/research-dynamic-island-animation.md` — Dynamic Island 动画调研
- `archive/research-windows-window-management.md` — Windows 窗口管理调研
