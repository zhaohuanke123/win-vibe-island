---
name: barricade
description: |
  确定性检查点脚本（config-sync、release）调用流程，以及 OpenSpec 任务生命周期入口。
  触发条件：
  - "配置同步"、"config-sync"、"设计合规"、"design-tokens" → config-sync.js
  - "发布"、"release"、"版本号"、"打 tag" → release.js
  - "跑一下防线"、"检查一下"、"验证" → config-sync.js --strict + cargo check + npm run build + openspec validate
  - "继续"、"下一个任务"、"开发" → /opsx:propose + /opsx:apply（任务生命周期已迁移到 OpenSpec）
  - "状态"、"进度" → openspec list / openspec status
  不要触发：纯 OpenSpec change 创建/实现/归档（直接用 /opsx:* 命令）
---

# 确定性检查点

## 角色定位

任务生命周期（提议 → 实现 → 校验 → 归档）已迁移到 **OpenSpec**（见 `/opsx:propose`、`/opsx:apply`、`/opsx:archive`）。
本 skill 只保留**域内确定性门禁**——那些用 JS 脚本精确判定、不依赖 LLM 判断的不变量检查。

三层架构仍然成立：
- 🟢 **Operator (Claude Code)** — 动态编排：走 OpenSpec 生命周期 + worktree 隔离
- 🟡 **Checkpoints (JS 脚本)** — 确定性门禁：exit code 1 = BLOCKED，必须停下
- 🔴 **Safety Net (GitHub Actions CI)** — PR 合入前在干净容器里再跑一遍

**关键原则：** Exit Code 1 = 必须停下修复，不能绕过。

## 保留的检查点脚本

| 脚本 | 职责 | 命令 |
|------|------|------|
| `scripts/config-sync.js` | Rust↔Frontend 双配置不变量（5 阶段） | `--json` / `--strict` |
| `scripts/release.js` | 发布护航（版本同步 + 预检） | `check` / `bump` / `changelog` / `tag` |

> `scripts/task-commands.js` 与 `scripts/doc-gate.js` 已**退役**：任务生命周期改由 OpenSpec 的 `openspec list / status / archive` 承担，文档先行改由 spec-first（propose 阶段写 spec/delta + applyRequires 强制 tasks.md 先存在）承担。

## 指令路由

### 用户说"配置同步"、"config-sync"、"设计合规"

```bash
node scripts/config-sync.js              # 常规输出
node scripts/config-sync.js --json       # JSON 输出
node scripts/config-sync.js --strict     # CI 严格模式（警告也算失败）
```

守护的不变量见 `openspec/specs/config-sync/spec.md`：5 类配置（状态色 / 弹簧 / 动画 / UI 尺寸 / Overlay 尺寸）在 `src-tauri/src/config/types.rs` 与 `frontend/src/store/config.ts` 双端默认值必须一致。

### 用户说"发布"、"release"、"版本号"

```bash
node scripts/release.js check          # 预发布检查（含 config-sync + build + cargo check）
node scripts/release.js bump patch     # 升版本号
node scripts/release.js tag            # 打 tag
```

### 用户说"跑一下防线"、"检查一下"、"验证一下"

```bash
node scripts/config-sync.js --strict   # 双配置不变量
cargo check --manifest-path src-tauri/Cargo.toml
npm --prefix frontend run build
openspec validate                       # 规格 + change artifact 校验
```

任一失败则停下修复。

### 用户说"继续"、"下一个任务"、"开发"、"状态"、"进度"

任务生命周期走 OpenSpec，**不再**调用 task-commands.js：

- 下一个工作项 → `/opsx:propose`（新 change）或 `openspec list`（看活跃 change）
- 实现活跃 change → `/opsx:apply`
- 归档完成的 change → `/opsx:archive`
- 看进度 → `openspec list` / `openspec status --change <name>`

## 退出码约定

| 退出码 | 含义 | Claude Code 行为 |
|--------|------|------------------|
| 0 | PASS | 继续执行下一步 |
| 1 | BLOCKED / FAIL | **必须停下**，修复后重跑 |
| 2 | ERROR | 脚本自身出错，报告给用户 |

## 与 OpenSpec 的关系

- OpenSpec 管**任务生命周期**（what to do next、artifact 完整性、归档校验）
- 本 skill 管**域内确定性不变量**（配置一致性、版本同步）
- 两者正交：一个 change 在 `/opsx:archive` 前应跑一遍 `config-sync.js --strict` 作为域内门禁
