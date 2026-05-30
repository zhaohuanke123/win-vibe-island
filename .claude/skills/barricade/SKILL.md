---
name: barricade
description: |
  Cyborg 防线脚本调用流程。当用户说"继续"、"下一个任务"、"状态"、"跑一下防线"、
  "配置同步"、"发布"、"检查"等指令时，调用对应的 JS 防线脚本。
  触发条件：
  - "继续"、"下一个任务"、"开发" → task-commands.js next + doc-gate + config-sync
  - "状态"、"进度" → task-commands.js status
  - "跑一下防线"、"检查一下"、"验证" → config-sync.js + doc-gate.js
  - "配置同步"、"config-sync"、"设计合规" → config-sync.js
  - "文档门禁"、"doc-gate" → doc-gate.js
  - "发布"、"release"、"版本号" → release.js check
  - "批次规划"、"并行任务" → task-commands.js plan
---

# Cyborg 防线脚本

## 核心理念

Vibe Island 采用 **Cyborg 工作流**三层架构：
- 🟢 **Operator (Claude Code)** — 动态编排：读取任务、进入 worktree、编写代码
- 🟡 **Barricade (4 个 JS 脚本)** — 确定性防线：exit code 1 = BLOCKED，必须停下
- 🔴 **Safety Net (GitHub Actions CI)** — PR 合入前在干净容器里再跑一遍

**关键原则：** Exit Code 1 = 必须停下修复，不能绕过。

## 脚本清单

| 脚本 | 职责 | 命令 |
|------|------|------|
| `scripts/task-commands.js` | 任务数据分析（纯输出） | `status` / `next` / `plan` / `validate <id>` |
| `scripts/doc-gate.js` | 文档门禁 | `--task-id=N` / `--ci` / `--json` |
| `scripts/config-sync.js` | Rust↔Frontend 配置同步 | `--json` / `--strict` |
| `scripts/release.js` | 发布护航 | `check` / `bump` / `changelog` / `tag` |

## 指令路由

### 用户说"继续"、"下一个任务"、"开发"

执行 Cyborg 开发循环：

```
1. node scripts/task-commands.js next --json
   → 读取下一个任务信息

2. node scripts/doc-gate.js --task-id=<id> --json
   → 检查文档门禁
   → 如果 EXIT=1 (BLOCKED)：先补文档引用，再重跑
   → 如果 EXIT=0 (PASS)：继续

3. EnterWorktree（Claude Code 内置工具）
   → 在隔离 worktree 中实现任务

4. node scripts/config-sync.js --strict
   → 检查配置同步
   → 如果 EXIT=1：修复配置不一致后重跑

5. ExitWorktree（Claude Code 内置工具）
   → 合并回主分支

6. node scripts/task-commands.js validate <id>
   → 验证任务完成度
```

### 用户说"状态"、"进度"

```bash
node scripts/task-commands.js status
```

### 用户说"跑一下防线"、"检查一下"

```bash
node scripts/config-sync.js --strict
node scripts/doc-gate.js
```

### 用户说"配置同步"、"config-sync"

```bash
node scripts/config-sync.js
# 或 JSON 输出：
node scripts/config-sync.js --json
# CI 严格模式（警告也算失败）：
node scripts/config-sync.js --strict
```

### 用户说"文档门禁"、"doc-gate"

```bash
node scripts/doc-gate.js
# 检查指定任务：
node scripts/doc-gate.js --task-id=78
# CI 模式：
node scripts/doc-gate.js --ci
```

### 用户说"批次规划"、"并行任务"

```bash
node scripts/task-commands.js plan
```

### 用户说"发布"、"release"

```bash
node scripts/release.js check          # 预发布检查
node scripts/release.js bump patch     # 升版本号
node scripts/release.js tag            # 打 tag
```

## 退出码约定

| 退出码 | 含义 | Claude Code 行为 |
|--------|------|------------------|
| 0 | PASS | 继续执行下一步 |
| 1 | BLOCKED / FAIL | **必须停下**，修复后重跑 |
| 2 | ERROR | 脚本自身出错，报告给用户 |

## 典型 Cyborg 会话示例

```
用户: 继续

Claude: [调用 task-commands.js next]
        → Task #78: 面板大量留白

Claude: [调用 doc-gate.js --task-id=78]
        → EXIT=1, BLOCKED: 缺少 requirement_ref

Claude: #78 缺少文档引用，正在补充...
        [修改 task.json 添加 requirement_ref]

Claude: [重跑 doc-gate.js --task-id=78]
        → EXIT=0, PASS

Claude: [进入 worktree 实现任务]

Claude: [调用 config-sync.js --strict]
        → EXIT=0, 76/76 通过

Claude: [退出 worktree，合并]

Claude: [调用 task-commands.js validate 78]
        → PASS

Claude: ✅ Task #78 完成
```
