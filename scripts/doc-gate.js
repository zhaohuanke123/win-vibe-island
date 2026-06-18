#!/usr/bin/env node
/**
 * 文档门禁 — WORKFLOW.md Step 1 的确定性防线
 *
 * 只做检查，不做任何修改。Claude Code 调用后根据 exit code 决定是否继续。
 *
 * 用法:
 *   node scripts/doc-gate.js                     # 检查所有未完成任务
 *   node scripts/doc-gate.js --task-id=78        # 检查指定任务
 *   node scripts/doc-gate.js --ci                # CI 模式：检查 git diff 中的文档变更
 *   node scripts/doc-gate.js --json              # JSON 输出
 *
 * 退出码: 0=PASS, 1=BLOCKED, 2=ERROR
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
const ciMode = args.includes("--ci");

const taskIdArg = args.find(a => a.startsWith("--task-id="));
const targetTaskId = taskIdArg ? parseInt(taskIdArg.split("=")[1], 10) : null;

// ── 检查结果收集 ──────────────────────────────────────────

const blockers = [];   // 阻塞项（必须修复）
const warnings = [];   // 警告项（不阻塞）

// ══════════════════════════════════════════════════════════
// 检查 1: task.json 可解析
// ══════════════════════════════════════════════════════════

function checkTaskJsonParseable() {
  const data = readJson(PATHS.TASK_JSON);
  if (!data.tasks || !Array.isArray(data.tasks)) {
    blockers.push("task.json 缺少 tasks 数组");
    return null;
  }
  return data;
}

// ══════════════════════════════════════════════════════════
// 检查 2: 任务文档引用 (requirement_ref + design_ref)
// ══════════════════════════════════════════════════════════

function checkTaskDocRefs(task) {
  const id = task.id;
  const title = task.title;
  const hasReqRef = !!task.requirement_ref;
  const hasDesignRef = !!task.design_ref;
  const status = task.status;

  // 已完成或已移除的任务不需要检查
  if (status === "completed" || status === "removed" || task.passes === true) {
    return;
  }

  // 检查 requirement_ref
  if (!hasReqRef) {
    warnings.push(`Task #${id} "${title}": 缺少 requirement_ref`);
  }

  // 检查 design_ref
  if (!hasDesignRef) {
    warnings.push(`Task #${id} "${title}": 缺少 design_ref`);
  }

  // 如果都没有，视为阻塞
  if (!hasReqRef && !hasDesignRef) {
    blockers.push(`Task #${id} "${title}": 无任何文档引用 (requirement_ref / design_ref)`);
  }
}

// ══════════════════════════════════════════════════════════
// 检查 3: design_ref 文件是否存在
// ══════════════════════════════════════════════════════════

function checkDesignRefExists(task) {
  const designRef = task.design_ref;
  if (!designRef) return;

  // 如果指向 docs/design/specs/，检查文件存在性
  if (designRef.includes("docs/design/specs/") || designRef.includes("docs/")) {
    // 提取文件路径部分（可能带有锚点 #xxx）
    const filePath = designRef.split("#")[0].split(":").pop().trim();
    const fullPath = path.join(PATHS.ROOT, filePath);

    const { existsSync } = require("fs");
    if (!existsSync(fullPath)) {
      blockers.push(`Task #${task.id} "${task.title}": design_ref 指向不存在的文件: ${filePath}`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// 检查 4: CI 模式 — git diff 中的文档变更
// ══════════════════════════════════════════════════════════

function checkCiDocChanges() {
  if (!ciMode) return;

  // 获取变更文件列表
  const result = runCommand("git diff --name-only HEAD");

  if (!result.ok) {
    // 可能不是 git 仓库或没有变更
    warnings.push("CI 模式：无法获取 git diff（可能无变更或不在 git 仓库中）");
    return;
  }

  const changedFiles = result.stdout.trim().split("\n").filter(Boolean);

  if (changedFiles.length === 0) {
    return; // 无变更，无需检查
  }

  // 检查是否有源码变更但无文档变更
  const hasSourceChange = changedFiles.some(f =>
    f.startsWith("src-tauri/src/") ||
    f.startsWith("frontend/src/")
  );
  const hasDocChange = changedFiles.some(f =>
    f.startsWith("docs/") ||
    f === "architecture.md" ||
    f === "CLAUDE.md" ||
    f === "WORKFLOW.md"
  );

  if (hasSourceChange && !hasDocChange) {
    warnings.push("CI 模式：有源码变更但无文档变更。如果修改了行为，请更新相关文档。");
  }
}

// ══════════════════════════════════════════════════════════
// 检查 5: progress.txt 中的跳过记录
// ══════════════════════════════════════════════════════════

function checkProgressSkipRecord(taskId) {
  const { existsSync } = require("fs");

  if (!existsSync(PATHS.PROGRESS_TXT)) {
    // progress.txt 不存在不算阻塞
    return;
  }

  const content = readText(PATHS.PROGRESS_TXT);
  const skipPatterns = [
    /DOC-GATE-BYPASS/i,
    /skip\s+doc/i,
    /跳过文档/i,
  ];

  // 如果指定了 task id，检查该任务是否有跳过记录
  if (taskId !== null) {
    const taskSection = content.match(new RegExp(`Task #?${taskId}[\\s\\S]*?(?=\\n## |$)`, "i"));
    if (taskSection) {
      const section = taskSection[0];
      const hasSkip = skipPatterns.some(p => p.test(section));
      if (hasSkip) {
        return { skipped: true, taskId };
      }
    }
  }

  return { skipped: false, taskId };
}

// ══════════════════════════════════════════════════════════
// 主流程
// ══════════════════════════════════════════════════════════

function main() {
  if (!jsonOutput) {
    process.stdout.write("\n🚧 Vibe Island 文档门禁检查\n");
  }

  // 检查 1: task.json 可解析
  const data = checkTaskJsonParseable();
  if (!data) {
    if (jsonOutput) {
      process.stdout.write(JSON.stringify({ pass: false, blockers, warnings }, null, 2) + "\n");
    } else {
      logFail("task.json 解析失败");
    }
    process.exit(EXIT.FAIL);
  }

  // 确定要检查的任务列表
  let tasksToCheck;
  if (targetTaskId !== null) {
    const task = data.tasks.find(t => t.id === targetTaskId);
    if (!task) {
      process.stderr.write(`✗ Task #${targetTaskId} 不存在于 task.json\n`);
      process.exit(EXIT.ERROR);
    }
    tasksToCheck = [task];
  } else {
    // 检查所有未完成任务
    tasksToCheck = data.tasks.filter(t =>
      t.status !== "completed" &&
      t.status !== "removed" &&
      t.passes !== true
    );
  }

  if (!jsonOutput) {
    logSection(`检查任务 (${tasksToCheck.length} 个)`);
  }

  // 对每个任务执行检查
  for (const task of tasksToCheck) {
    // 检查 5: 是否有显式跳过记录
    const skipResult = checkProgressSkipRecord(task.id);
    if (skipResult.skipped) {
      if (!jsonOutput) logWarn(`Task #${task.id}: 有文档门禁跳过记录，跳过检查`);
      continue;
    }

    // 检查 2: 文档引用
    checkTaskDocRefs(task);

    // 检查 3: design_ref 文件存在性
    checkDesignRefExists(task);
  }

  // 检查 4: CI 文档变更
  checkCiDocChanges();

  // 汇总
  if (jsonOutput) {
    process.stdout.write(JSON.stringify({
      pass: blockers.length === 0,
      blockers,
      warnings,
      tasksChecked: tasksToCheck.length,
    }, null, 2) + "\n");
  } else {
    process.stdout.write("\n");
    for (const b of blockers) logFail(b);
    for (const w of warnings) logWarn(w);

    process.stdout.write(`\n${"─".repeat(50)}\n`);
    if (blockers.length === 0) {
      process.stdout.write(` ✅ 文档门禁通过 (${warnings.length} 个警告)\n\n`);
    } else {
      process.stdout.write(` 🚫 文档门禁阻塞: ${blockers.length} 项\n\n`);
    }
  }

  process.exit(blockers.length > 0 ? EXIT.FAIL : EXIT.OK);
}

main();
