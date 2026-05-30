/**
 * 共享常量 — 所有脚本路径和配置的单一事实来源
 *
 * 用法: const { PATHS, EXIT, PRIORITY_ORDER } = require("./lib/constants");
 */

"use strict";

const path = require("path");

// 项目根目录（scripts/lib/ → ../../ ）
const ROOT = path.resolve(__dirname, "..", "..");

module.exports = {
  // ── 文件路径 ──────────────────────────────────────────────
  PATHS: {
    TASK_JSON:        path.join(ROOT, "task.json"),
    PROGRESS_TXT:     path.join(ROOT, "progress.txt"),
    DESIGN_TOKENS:    path.join(ROOT, "docs/design/design-tokens.json"),
    RUST_CONFIG:      path.join(ROOT, "src-tauri/src/config/types.rs"),
    FRONTEND_CONFIG:  path.join(ROOT, "frontend/src/store/config.ts"),
    FRONTEND_CSS:     path.join(ROOT, "frontend/src/index.css"),
    ANIMATION_CONFIG: path.join(ROOT, "frontend/src/config/animation.ts"),
    CARGO_TOML:       path.join(ROOT, "src-tauri/Cargo.toml"),
    PACKAGE_JSON:     path.join(ROOT, "frontend/package.json"),
    COMPONENTS_DIR:   path.join(ROOT, "frontend/src/components"),
    ROOT,
  },

  // ── 任务优先级排序权重 ──────────────────────────────────────
  PRIORITY_ORDER: { critical: 0, high: 1, medium: 2, low: 3 },

  // ── 进程退出码 ──────────────────────────────────────────────
  EXIT: {
    OK:   0,  // 检查通过
    FAIL: 1,  // 检查未通过（BLOCKED）
    ERROR: 2,  // 脚本执行出错
  },
};
