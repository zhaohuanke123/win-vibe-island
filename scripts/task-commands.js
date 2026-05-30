#!/usr/bin/env node
/**
 * 任务依赖分析器 — 纯数据输出，无状态变更
 *
 * 替代 Python 三件套（plan_batches / select_next_task / validate_iteration）。
 * 所有编排操作（worktree/merge）由 Claude Code 的 EnterWorktree/ExitWorktree 处理。
 *
 * 用法:
 *   node scripts/task-commands.js status           # 进度汇报
 *   node scripts/task-commands.js next             # 下一个可执行任务
 *   node scripts/task-commands.js plan             # 并行批次分析
 *   node scripts/task-commands.js validate <id>    # 验证任务完成度
 *   node scripts/task-commands.js --json           # JSON 输出（任何命令）
 */

"use strict";

const path = require("path");
const { PATHS, EXIT, PRIORITY_ORDER } = require("./lib/constants");
const {
  readJson, readText, runCommand,
  logOk, logFail, logWarn, logSection,
} = require("./lib/helpers");

// ── 参数解析 ──────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const command = args.find(a => !a.startsWith("--")) || "status";
const taskIdArg = args.find(a => /^\d+$/.test(a));
const targetTaskId = taskIdArg ? parseInt(taskIdArg, 10) : null;

// ══════════════════════════════════════════════════════════
// 数据加载
// ══════════════════════════════════════════════════════════

function loadTaskData() {
  const data = readJson(PATHS.TASK_JSON);
  return data.tasks || [];
}

function getCompletedIds(tasks) {
  return new Set(tasks.filter(t => t.passes === true).map(t => t.id));
}

// ══════════════════════════════════════════════════════════
// 依赖分析
// ══════════════════════════════════════════════════════════

function dependenciesSatisfied(task, completedIds) {
  const deps = task.dependencies || [];
  return deps.every(d => completedIds.has(d));
}

function checkFileOverlap(files1, files2) {
  for (const f1 of files1) {
    for (const f2 of files2) {
      const p1 = path.normalize(f1);
      const p2 = path.normalize(f2);
      if (p1.startsWith(p2) || p2.startsWith(p1)) {
        return true;
      }
    }
  }
  return false;
}

function canRunParallel(task1, task2) {
  const files1 = task1.files || [];
  const files2 = task2.files || [];
  if (files1.length === 0 || files2.length === 0) return true;
  return !checkFileOverlap(files1, files2);
}

function resolveReadyTasks(tasks, completedIds) {
  return tasks
    .filter(t => !t.passes && t.status !== "completed" && t.status !== "removed")
    .filter(t => dependenciesSatisfied(t, completedIds))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      return pa - pb;
    });
}

// ══════════════════════════════════════════════════════════
// 并行批次分组
// ══════════════════════════════════════════════════════════

function groupParallelBatches(tasks) {
  const batches = [];
  const remaining = [...tasks];

  while (remaining.length > 0) {
    const batch = [];
    const indices = [];

    for (let i = 0; i < remaining.length; i++) {
      const task = remaining[i];
      const canAdd = batch.every(bt => canRunParallel(task, bt));
      if (canAdd) {
        batch.push(task);
        indices.push(i);
      }
    }

    // 移除已分批的任务（从后往前移除避免索引偏移）
    for (let i = indices.length - 1; i >= 0; i--) {
      remaining.splice(indices[i], 1);
    }

    if (batch.length > 0) {
      batches.push(batch);
    } else {
      // 安全退出：如果无法加入任何任务，说明所有任务互相冲突
      batches.push(remaining.splice(0, 1));
    }
  }

  return batches;
}

// ══════════════════════════════════════════════════════════
// Command: status
// ══════════════════════════════════════════════════════════

function cmdStatus(tasks) {
  const completedIds = getCompletedIds(tasks);
  const completed = tasks.filter(t => t.passes === true);
  const open = tasks.filter(t => t.status === "open");
  const pending = tasks.filter(t => t.status === "pending");
  const removed = tasks.filter(t => t.status === "removed");
  const blocked = tasks.filter(t =>
    !t.passes && t.status !== "completed" && t.status !== "removed" &&
    !dependenciesSatisfied(t, completedIds)
  );

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({
      total: tasks.length,
      completed: completed.length,
      open: open.length,
      pending: pending.length,
      blocked: blocked.length,
      ready: resolveReadyTasks(tasks, completedIds).length,
    }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`\n📊 Vibe Island 任务状态\n`);
  process.stdout.write(`${"─".repeat(50)}\n`);
  process.stdout.write(`总计: ${tasks.length}  |  完成: ${completed.length}  |  待做: ${open.length + pending.length}  |  阻塞: ${blocked.length}\n\n`);

  for (const t of tasks) {
    const statusIcon = t.passes ? "✅" : (t.status === "removed" ? "🗑️" : "⬜");
    const prio = t.priority || "medium";
    process.stdout.write(`  ${statusIcon} #${t.id}: ${t.title} (${prio})\n`);
  }

  const ready = resolveReadyTasks(tasks, completedIds);
  if (ready.length > 0) {
    process.stdout.write(`\n🎯 可执行任务: ${ready.map(t => `#${t.id}`).join(", ")}\n`);
  }
}

// ══════════════════════════════════════════════════════════
// Command: next
// ══════════════════════════════════════════════════════════

function cmdNext(tasks) {
  const completedIds = getCompletedIds(tasks);
  const ready = resolveReadyTasks(tasks, completedIds);

  if (ready.length === 0) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ next: null, message: "All tasks complete!" }, null, 2) + "\n");
    } else {
      process.stdout.write("✅ 所有任务已完成！\n");
    }
    process.exit(EXIT.OK);
    return;
  }

  const task = ready[0];

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({
      next: {
        id: task.id,
        title: task.title,
        priority: task.priority || "medium",
        dependencies: task.dependencies || [],
        requirementRef: task.requirement_ref || null,
        designRef: task.design_ref || null,
        steps: task.steps || [],
      },
    }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`\n🎯 下一个任务: #${task.id} — ${task.title}\n`);
  process.stdout.write(`   优先级: ${task.priority || "medium"}\n`);
  if (task.dependencies && task.dependencies.length > 0) {
    process.stdout.write(`   依赖: ${task.dependencies.join(", ")}\n`);
  }
  if (task.steps && task.steps.length > 0) {
    process.stdout.write(`   步骤:\n`);
    task.steps.forEach((s, i) => process.stdout.write(`     ${i + 1}. ${s}\n`));
  }
}

// ══════════════════════════════════════════════════════════
// Command: plan
// ══════════════════════════════════════════════════════════

function cmdPlan(tasks) {
  const completedIds = getCompletedIds(tasks);
  const ready = resolveReadyTasks(tasks, completedIds);
  const batches = groupParallelBatches(ready);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({
      totalTasks: tasks.length,
      completed: completedIds.size,
      readyTasks: ready.length,
      batches: batches.map((batch, i) => ({
        batchId: i + 1,
        parallelCount: batch.length,
        tasks: batch.map(t => ({ id: t.id, title: t.title, files: t.files || [] })),
      })),
    }, null, 2) + "\n");
    return;
  }

  process.stdout.write(`\n📋 并行批次规划\n`);
  process.stdout.write(`   已完成: ${completedIds.size}/${tasks.length}  |  可执行: ${ready.length}  |  批次数: ${batches.length}\n\n`);

  batches.forEach((batch, i) => {
    process.stdout.write(`Batch ${i + 1}: ${batch.length} 个并行任务\n`);
    batch.forEach(t => {
      process.stdout.write(`  - #${t.id}: ${t.title}\n`);
    });
    process.stdout.write("\n");
  });
}

// ══════════════════════════════════════════════════════════
// Command: validate
// ══════════════════════════════════════════════════════════

function cmdValidate(tasks, taskId) {
  if (taskId === null) {
    process.stderr.write("✗ 需要指定任务 ID: node scripts/task-commands.js validate <id>\n");
    process.exit(EXIT.ERROR);
  }

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    process.stderr.write(`✗ Task #${taskId} 不存在\n`);
    process.exit(EXIT.ERROR);
  }

  const errors = [];

  if (!jsonOutput) {
    process.stdout.write(`\n🔍 验证 Task #${taskId}: ${task.title}\n`);
  }

  // 检查 1: task.json 字段完整性
  if (task.status !== "completed" && !task.passes) {
    // 对于未完成的任务只做轻量检查
    if (!jsonOutput) logOk("任务状态: 未完成（轻量检查）");
  } else {
    const requiredFields = ["docs_updated", "implementation_done", "verified", "passes"];
    for (const f of requiredFields) {
      if (!task[f]) {
        errors.push(`task.json 缺少 ${f}: true`);
      }
    }
  }

  // 检查 2: progress.txt 中有记录
  const { existsSync } = require("fs");
  if (existsSync(PATHS.PROGRESS_TXT)) {
    const progress = readText(PATHS.PROGRESS_TXT);
    if (!progress.includes(`Task #${taskId}`) && !progress.includes(`#${taskId}:`)) {
      errors.push(`progress.txt 无 Task #${taskId} 条目`);
    }
  }

  // 检查 3: npm run build
  if (!jsonOutput) logSection("前端构建检查");
  const buildResult = runCommand("npm --prefix frontend run build", { cwd: PATHS.ROOT });
  if (!buildResult.ok) {
    errors.push("npm run build 失败");
    if (!jsonOutput) logFail("npm run build 失败");
  } else {
    if (!jsonOutput) logOk("npm run build 通过");
  }

  // 检查 4: cargo check
  if (!jsonOutput) logSection("Rust 编译检查");
  const cargoResult = runCommand("cargo check --manifest-path src-tauri/Cargo.toml", { cwd: PATHS.ROOT });
  if (!cargoResult.ok) {
    errors.push("cargo check 失败");
    if (!jsonOutput) logFail("cargo check 失败");
  } else {
    if (!jsonOutput) logOk("cargo check 通过");
  }

  // 汇总
  if (jsonOutput) {
    process.stdout.write(JSON.stringify({
      taskId,
      title: task.title,
      valid: errors.length === 0,
      errors,
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`\n${"─".repeat(50)}\n`);
    if (errors.length === 0) {
      logOk(`Task #${taskId} 验证通过`);
    } else {
      for (const e of errors) logFail(e);
      process.stdout.write(`\n❌ ${errors.length} 项验证失败\n`);
    }
  }

  process.exit(errors.length > 0 ? EXIT.FAIL : EXIT.OK);
}

// ══════════════════════════════════════════════════════════
// 路由
// ══════════════════════════════════════════════════════════

function main() {
  const tasks = loadTaskData();

  switch (command) {
    case "status":
      cmdStatus(tasks);
      break;
    case "next":
      cmdNext(tasks);
      break;
    case "plan":
      cmdPlan(tasks);
      break;
    case "validate":
      cmdValidate(tasks, targetTaskId);
      break;
    default:
      process.stderr.write(`✗ 未知命令: ${command}\n`);
      process.stderr.write("  可用: status, next, plan, validate <id>\n");
      process.exit(EXIT.ERROR);
  }
}

main();
