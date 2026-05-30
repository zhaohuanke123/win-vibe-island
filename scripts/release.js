#!/usr/bin/env node
/**
 * 发布护航脚本 — 版本号同步 + 预发布检查 + changelog + tag
 *
 * 用法:
 *   node scripts/release.js check                 # 预发布检查（config-sync + build + test）
 *   node scripts/release.js bump <major|minor|patch>  # 同步版本号
 *   node scripts/release.js changelog             # 生成 CHANGELOG 片段
 *   node scripts/release.js tag                   # 打 git tag
 *   node scripts/release.js --dry-run <command>   # 预览模式（不写文件）
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { PATHS, EXIT } = require("./lib/constants");
const {
  readJson, readText, writeText, runCommand,
  logOk, logFail, logWarn, logSection,
} = require("./lib/helpers");

// ── 参数解析 ──────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const command = args.find(a => !a.startsWith("--")) || "check";
const bumpType = args.find(a => ["major", "minor", "patch"].includes(a)) || null;

// ══════════════════════════════════════════════════════════
// 辅助函数
// ══════════════════════════════════════════════════════════

/** 从 Cargo.toml 读取当前版本号 */
function readCargoVersion() {
  const content = readText(PATHS.CARGO_TOML);
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    process.stderr.write("✗ Cargo.toml 中找不到 version 字段\n");
    process.exit(EXIT.ERROR);
  }
  return match[1];
}

/** 从 package.json 读取当前版本号 */
function readPackageVersion() {
  const pkg = readJson(PATHS.PACKAGE_JSON);
  return pkg.version;
}

/** 递增 semver 版本号 */
function bumpVersion(version, type) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    process.stderr.write(`✗ 无效版本号: ${version}\n`);
    process.exit(EXIT.ERROR);
  }
  switch (type) {
    case "major": return `${parts[0] + 1}.0.0`;
    case "minor": return `${parts[0]}.${parts[1] + 1}.0`;
    case "patch": return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default:
      process.stderr.write(`✗ 无效 bump 类型: ${type} (major/minor/patch)\n`);
      process.exit(EXIT.ERROR);
  }
}

// ══════════════════════════════════════════════════════════
// Command: check — 预发布检查
// ══════════════════════════════════════════════════════════

function cmdCheck() {
  process.stdout.write("\n🔍 预发布检查\n");
  let hasErrors = false;

  // 1. 版本号一致性
  logSection("版本号一致性");
  const cargoVer = readCargoVersion();
  const pkgVer = readPackageVersion();
  if (cargoVer === pkgVer) {
    logOk(`Cargo.toml = package.json = v${cargoVer}`);
  } else {
    logFail(`Cargo.toml v${cargoVer} ≠ package.json v${pkgVer}`);
    hasErrors = true;
  }

  // 2. config-sync
  logSection("配置同步检查");
  const syncResult = runCommand("node scripts/config-sync.js --strict", { cwd: PATHS.ROOT });
  if (syncResult.ok) {
    logOk("配置同步通过");
  } else {
    logFail("配置同步失败");
    hasErrors = true;
  }

  // 3. npm build
  logSection("前端构建");
  const buildResult = runCommand("npm --prefix frontend run build", { cwd: PATHS.ROOT });
  if (buildResult.ok) {
    logOk("npm run build 通过");
  } else {
    logFail("npm run build 失败");
    hasErrors = true;
  }

  // 4. npm test
  logSection("前端测试");
  const testResult = runCommand("npm --prefix frontend run test", { cwd: PATHS.ROOT });
  if (testResult.ok) {
    logOk("npm run test 通过");
  } else {
    logWarn("npm run test 有失败用例（不阻塞发布）");
  }

  // 5. cargo check
  logSection("Rust 编译");
  const cargoResult = runCommand("cargo check --manifest-path src-tauri/Cargo.toml", { cwd: PATHS.ROOT });
  if (cargoResult.ok) {
    logOk("cargo check 通过");
  } else {
    logFail("cargo check 失败");
    hasErrors = true;
  }

  // 汇总
  process.stdout.write(`\n${"─".repeat(50)}\n`);
  if (hasErrors) {
    process.stdout.write("❌ 预发布检查未通过\n\n");
    process.exit(EXIT.FAIL);
  } else {
    process.stdout.write("✅ 预发布检查通过，可以发布\n\n");
    process.exit(EXIT.OK);
  }
}

// ══════════════════════════════════════════════════════════
// Command: bump — 版本号同步
// ══════════════════════════════════════════════════════════

function cmdBump() {
  if (!bumpType) {
    process.stderr.write("✗ 需要指定 bump 类型: major | minor | patch\n");
    process.exit(EXIT.ERROR);
  }

  const currentVersion = readCargoVersion();
  const newVersion = bumpVersion(currentVersion, bumpType);

  process.stdout.write(`\n📦 版本号升级: v${currentVersion} → v${newVersion}\n`);

  if (dryRun) {
    logWarn("预览模式（--dry-run），不修改文件");
    logOk(`Cargo.toml: version = "${currentVersion}" → "${newVersion}"`);
    logOk(`package.json: "version": "${currentVersion}" → "${newVersion}"`);
    process.exit(EXIT.OK);
  }

  // 更新 Cargo.toml
  const cargoContent = readText(PATHS.CARGO_TOML);
  const newCargo = cargoContent.replace(
    /^(version\s*=\s*)"[^"]+"/m,
    `$1"${newVersion}"`
  );
  writeText(PATHS.CARGO_TOML, newCargo);
  logOk(`Cargo.toml: v${newVersion}`);

  // 更新 package.json
  const pkg = readJson(PATHS.PACKAGE_JSON);
  pkg.version = newVersion;
  const pkgContent = JSON.stringify(pkg, null, 2) + "\n";
  writeText(PATHS.PACKAGE_JSON, pkgContent);
  logOk(`package.json: v${newVersion}`);

  process.stdout.write(`\n✅ 版本号已同步到 v${newVersion}\n`);
  process.exit(EXIT.OK);
}

// ══════════════════════════════════════════════════════════
// Command: changelog — 生成 CHANGELOG 片段
// ══════════════════════════════════════════════════════════

function cmdChangelog() {
  const version = readCargoVersion();
  const today = new Date().toISOString().split("T")[0];

  // 读取最近的 git 提交
  const logResult = runCommand("git log --oneline -20");
  const commits = logResult.ok ? logResult.stdout.trim().split("\n").filter(Boolean) : [];

  // 读取 progress.txt 中最近的条目
  let progressEntries = "";
  if (fs.existsSync(PATHS.PROGRESS_TXT)) {
    const progress = readText(PATHS.PROGRESS_TXT);
    const recentMatch = progress.match(/## \[\d{4}-\d{2}-\d{2}\][\s\S]*?(?=\n## \[\d{4}|$)/);
    if (recentMatch) {
      progressEntries = recentMatch[0].trim();
    }
  }

  const changelog = [
    `## v${version} (${today})`,
    "",
    "### 提交记录",
    ...commits.map(c => `- ${c}`),
    "",
    "### 详细变更",
    progressEntries || "（参见 progress.txt）",
    "",
  ].join("\n");

  if (dryRun) {
    process.stdout.write(changelog);
    process.exit(EXIT.OK);
  }

  // 追加到 CHANGELOG.md 或输出到 stdout
  const changelogPath = path.join(PATHS.ROOT, "CHANGELOG.md");
  if (fs.existsSync(changelogPath)) {
    const existing = readText(changelogPath);
    // 插入到第一个 ## 之前（如果有标题行）
    const firstHeader = existing.indexOf("\n## ");
    if (firstHeader !== -1) {
      const newContent = existing.slice(0, firstHeader + 1) + "\n" + changelog + existing.slice(firstHeader);
      writeText(changelogPath, newContent);
    } else {
      writeText(changelogPath, existing + "\n" + changelog);
    }
    logOk(`CHANGELOG.md 已更新: v${version}`);
  } else {
    writeText(changelogPath, `# Changelog\n\n${changelog}`);
    logOk(`CHANGELOG.md 已创建: v${version}`);
  }

  process.exit(EXIT.OK);
}

// ══════════════════════════════════════════════════════════
// Command: tag — 打 git tag
// ══════════════════════════════════════════════════════════

function cmdTag() {
  const version = readCargoVersion();
  const tagName = `v${version}`;

  process.stdout.write(`\n🏷️ 打 git tag: ${tagName}\n`);

  if (dryRun) {
    logWarn("预览模式（--dry-run），不创建 tag");
    logOk(`git tag ${tagName}`);
    process.exit(EXIT.OK);
  }

  const tagResult = runCommand(`git tag ${tagName}`);
  if (tagResult.ok) {
    logOk(`tag ${tagName} 已创建`);
    process.exit(EXIT.OK);
  } else {
    logFail(`tag ${tagName} 创建失败: ${tagResult.stderr}`);
    process.exit(EXIT.FAIL);
  }
}

// ══════════════════════════════════════════════════════════
// 路由
// ══════════════════════════════════════════════════════════

function main() {
  switch (command) {
    case "check":
      cmdCheck();
      break;
    case "bump":
      cmdBump();
      break;
    case "changelog":
      cmdChangelog();
      break;
    case "tag":
      cmdTag();
      break;
    default:
      process.stderr.write(`✗ 未知命令: ${command}\n`);
      process.stderr.write("  可用: check, bump <major|minor|patch>, changelog, tag\n");
      process.exit(EXIT.ERROR);
  }
}

main();
