#!/usr/bin/env node
/**
 * 设计合规检查（向后兼容入口）
 *
 * 此文件已迁移到 config-sync.js，保留此入口以兼容现有调用。
 * 所有检查逻辑由 config-sync.js 执行。
 *
 * 用法（不变）:
 *   node scripts/check-design-compliance.js
 *   node scripts/check-design-compliance.js --json
 *   node scripts/check-design-compliance.js --specs
 */

"use strict";

const { execSync } = require("child_process");
const path = require("path");

// 构建参数，转发给 config-sync.js
const args = process.argv.slice(2).filter(a => a !== "--specs");

try {
  execSync(`node "${path.join(__dirname, "config-sync.js")}" ${args.join(" ")}`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });
  process.exit(0);
} catch (err) {
  process.exit(err.status || 1);
}
