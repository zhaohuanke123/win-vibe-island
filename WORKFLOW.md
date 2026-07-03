# Development Workflow

完整工作流程指南，AI 自驱动开发时遵循此流程。

**任务生命周期走 OpenSpec**：`/opsx:propose → /opsx:apply → /opsx:sync → /opsx:archive`。
行为真相源是 `openspec/specs/`；活跃工作项在 `openspec/changes/`。

---

## 现状 → OpenSpec 映射

本项目已从自造的 task 状态机迁移到 OpenSpec。原概念对照：

| 原概念 | OpenSpec 对应 | 处置 |
|---|---|---|
| `Task.json`（id/status/deps/passes） | `openspec/changes/<name>/tasks.md`（`- [ ]`/`- [x]`） | 替换 |
| `requirement_ref` / `design_ref` 字段 | `proposal.md`（what & why）+ `design.md`（how） | 替换 |
| Documentation Gate（文档先行） | spec-first：spec/delta 在 propose 阶段写；`applyRequires` 强制 tasks.md 先存在 | 哲学保留，机制替换 |
| `architecture.md` Key Constraints | `openspec/specs/<capability>/spec.md` 的 Requirements + Scenarios | 抽取为规格（4 个核心，增量补齐） |
| `task-commands.js`（next/plan/validate） | `openspec list / status` + archive 完成校验 | 退役 |
| `doc-gate.js`（CI 门禁） | propose→apply 顺序 + archive 校验 | 退役 |
| `.claude/hooks/doc-gate.sh`（per-edit 门禁） | 改写：检查 `openspec/changes/` 有活跃 change，否则 block | 改写 |
| `config-sync.js` / `release.js` | — | 保留（域内确定性门禁，正交） |
| 13 个领域 skill / `.claude/rules/` | — | 保留（参考知识 + 写作约束，正交） |
| `progress.txt` | change 归档 + git history | 冻结到 `docs/history/` |
| Orchestrator/Executor/Verifier 多 agent | `opsx:apply`（实现）+ `opsx:archive`（校验）+ worktree 隔离 | 映射 |

---

## OpenSpec 生命周期

```
/opsx:propose  →  /opsx:apply  →  /opsx:sync  →  /opsx:archive
   写 spec/delta      按 tasks.md 实现     delta 合并回主规格   校验完成并归档
   写 proposal        勾选完成项            （ADDED/MODIFIED     移到 changes/archive/
   写 tasks.md        （worktree 隔离）      /REMOVED）           可选先跑 config-sync
```

- **propose**：新建 `openspec/changes/<name>/`，按依赖序写 proposal.md → delta specs（`## ADDED/MODIFIED Requirements`）→ design.md（可选）→ tasks.md。`applyRequires` 默认要求 tasks.md 就绪。
- **apply**：按 tasks.md 步骤实现，每步勾选 `- [x]`。复杂 change 用 `EnterWorktree` 隔离。
- **sync**：把 change 的 delta specs 合并回 `openspec/specs/<capability>/spec.md`。
- **archive**：校验 artifact 与 task 完成度，移到 `openspec/changes/archive/YYYY-MM-DD-<name>/`。归档前应跑 `node scripts/config-sync.js --strict` 作为域内门禁。

### 工作模式

| 用户说 | 模式 | 动作 |
|---|---|---|
| 继续、下一个任务、开发 | 推进生命周期 | `/opsx:propose` 或 `/opsx:apply`（看活跃 change） |
| 状态、进度 | 查询 | `openspec list` / `openspec status --change <name>` |
| 新增需求、我想做、提议 | 新 change | `/opsx:propose` |
| 实现、apply、开始做 | 实现 | `/opsx:apply` |
| 归档、收尾 | 收尾 | `/opsx:archive` |
| 探索、想想、调研方案 | 思考搭子 | `/opsx:explore`（调研、澄清，不写应用代码） |
| 配置同步、config-sync | 域内门禁 | `node scripts/config-sync.js --strict` |
| 发布、release、版本号 | 发布 | `node scripts/release.js check` |
| 跑一下防线、检查一下 | 全检 | config-sync --strict + cargo check + npm run build + openspec validate |

---

## Spec-first Gate（原 Documentation Gate）

**源码修改前必须通过**。哲学不变（"无规格不写码"），但基准从 `task.json` 换成活跃 change。

机制：
- **CLI 校验**：propose 阶段写的 spec delta 必须含 `## ADDED/MODIFIED/REMOVED Requirements` 块，每个 Requirement 至少一个 `#### Scenario:`（WHEN/THEN），并含 RFC 2119 关键词（MUST/SHALL）。`openspec validate` 强制。
- **PreToolUse hook**（`.claude/hooks/doc-gate.sh`）：编辑 `frontend/src/*` 或 `src-tauri/src/*` 时，若 `openspec/changes/` 下无含 `tasks.md` 的活跃 change（且无 bypass），block。
- **bypass**（迁移期 / 紧急热修）：根目录 `.doc-gate-bypass` 哨兵文件，或在活跃 change 的 `proposal.md` 写 `[DOC-GATE-BYPASS] <reason>`。

未通过时：不进入源码实现；先 `/opsx:propose` 建一个含 tasks.md 的 change。

---

## 多代理与 worktree 编排

OpenSpec 的 apply 步骤可选用多代理 + worktree 隔离（能力不变，生命周期映射）：

```
/opsx:apply（协调）
  ├── 读 openspec/changes/<name>/tasks.md
  ├── EnterWorktree（隔离实现，避免冲突）
  ├── spawn executor 子代理（.claude/agents/executor.md）按 tasks.md 实现
  ├── spawn verifier 子代理（.claude/agents/verifier.md）独立校验 docs/code/tests 一致性
  ├── ExitWorktree（合并回主分支）
  └── 可选 spawn security-reviewer（.claude/agents/security-reviewer.md）审 Hook/Pipe/Adapter 边界
```

四种角色（agent 定义在 `.claude/agents/`）：
- **planner** — 只读分析，把 change 拆成有文件所有权的实现计划
- **executor** — 在 worktree 中按 tasks.md 写代码（跑 lint + build，不跑 test）
- **verifier** — 独立验证，写测试用例，检查 docs/code/tests 一致性
- **security-reviewer** — 审 Hook/Pipe/Adapter 安全边界（注入、反序列化、认证绕过）

---

## Memory Is Routing, Not State

Memory 只能提醒 agent 读取本 workflow，不能替代运行时文件。

Source of truth:

```text
用户最新明确指令
> openspec/specs/ / openspec/changes/
> CLAUDE.md / WORKFLOW.md / architecture.md
> skill instructions
> memory hints
```

执行状态以 `openspec/specs/`（持久规格）和 `openspec/changes/`（活跃工作）为准：
- memory 说任务完成，但对应 change 未 `/opsx:archive` → 任务未完成。
- memory 说可以直接改源码，但 spec-first gate 未通过 → 先过 gate。

---

## Guardrails

1. **Spec 先行** — bug、功能、行为变更必须先有一个含 tasks.md 的 OpenSpec change（spec-first gate）
2. **Repo 文件优先于 memory** — memory 只是路由提示，不能覆盖规格、change、需求或设计
3. **架构优先** — 编码前必须读取 `architecture.md` 与 `openspec/config.yaml` 的 context/rules
4. **Worktree 隔离** — 复杂 change 在独立 worktree 中执行
5. **验证先于归档** — `/opsx:archive` 前应跑 verifier + `config-sync.js --strict`
6. **阻塞不伪造** — 无法完成时报告阻塞，不勾选 tasks.md 的完成项
7. **清理 Worktree** — 完成后 ExitWorktree
8. **域内门禁不可绕过** — `config-sync.js` / `release.js` 的 exit 1 必须停下修复

---

## 项目特定约束

### Tauri 项目约束

1. **Rust 后端修改**：
   - 修改 `src-tauri/src/` 下的文件
   - 运行 `cargo check` 验证编译
   - 新 IPC 命令需要在 `lib.rs` 中注册

2. **React 前端修改**：
   - 修改 `frontend/src/` 下的文件
   - 运行 `npm run build` 验证构建
   - 新组件需要正确的 CSS 样式

3. **IPC 通信**：
   - 后端 → 前端：使用 `app_handle.emit("event_name", payload)`
   - 前端 → 后端：使用 `invoke("command_name", args)`

4. **Win32 API**：
   - 所有 Win32 调用必须在 `#[cfg(target_os = "windows")]` 块中
   - 为非 Windows 平台提供 stub 实现

### 设计文件夹

| 目录 | 内容 |
|------|------|
| `docs/design/specs/` | 设计规格文档 — 实现组件时的权威视觉/交互参考 |
| `docs/design/artifacts/prototypes/` | 交互原型 HTML 文件 |
| `docs/design/artifacts/flows/` | 交互流程图 / 屏幕序列 |
| `docs/design/artifacts/canvases/` | 视觉探索画布 / 线框图 |

设计规格文档（`specs/`）是 `design.md` 的推荐视觉/交互参考来源。规格模板见 `docs/design/specs/TEMPLATE.md`。

---

## 子代理指令文件

| 文件 | 用途 |
|------|------|
| `.claude/agents/planner.md` | planner 子代理指令（只读分析、实现计划） |
| `.claude/agents/executor.md` | executor 子代理指令（worktree 实现） |
| `.claude/agents/verifier.md` | verifier 子代理指令（独立验证） |
| `.claude/agents/security-reviewer.md` | security-reviewer 子代理指令（安全边界审查） |

这些 agent 在 `/opsx:apply` 的多代理编排中通过 Agent tool / workflow `agent()` 调用。
