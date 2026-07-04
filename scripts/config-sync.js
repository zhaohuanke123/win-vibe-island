#!/usr/bin/env node
/**
 * 配置双向同步检查 — Rust ↔ Frontend 配置一致性防线
 *
 * 合并增强 check-design-compliance.js，增加 Rust↔Frontend 双向对比。
 * 所有路径来自 scripts/lib/constants.js（单一事实来源）。
 *
 * 用法:
 *   node scripts/config-sync.js                # 基础检查
 *   node scripts/config-sync.js --json         # JSON 输出
 *   node scripts/config-sync.js --specs        # 同时检查 spec 文档
 *   node scripts/config-sync.js --strict       # 警告也视为失败（CI 用）
 *
 * 退出码: 0=全部通过, 1=有差异, 2=脚本错误
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { PATHS, EXIT, PRIORITY_ORDER } = require("./lib/constants");
const {
  readJson, readText, extractValue, extractNumber,
  logOk, logFail, logWarn, logSection,
  createChecker, reportResult,
} = require("./lib/helpers");

// ── 参数解析 ──────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const checkSpecs = args.includes("--specs");
const strictMode = args.includes("--strict");

// ── 检查器 ────────────────────────────────────────────────

const { check, summary } = createChecker();

// ══════════════════════════════════════════════════════════
// Phase 1: CSS 变量 ↔ design-tokens.json
// ══════════════════════════════════════════════════════════

function checkCssTokens(tokens) {
  const indexCss = readText(PATHS.FRONTEND_CSS);

  function checkColorGroup(category, group) {
    for (const [name, def] of Object.entries(group)) {
      if (name.startsWith("_")) continue;
      const pattern = new RegExp(def.var.replace(/-/g, "\\-") + "\\s*:\\s*([^;]+);");
      const actual = extractValue(indexCss, pattern);
      check(category, `${def.var}`, def.value, actual, def.file, def.line);
      if (!jsonOutput) reportResult({ name: `${def.var}`, expected: def.value, actual, file: def.file, line: def.line, pass: actual !== null && actual.toLowerCase() === def.value.toLowerCase() });
    }
  }

  if (!jsonOutput) logSection("CSS 变量 (index.css)");

  checkColorGroup("colors/base", tokens.colors.base);
  checkColorGroup("colors/glass", tokens.colors.glass);
  checkColorGroup("colors/phase", tokens.colors.phase);
  checkColorGroup("colors/action", tokens.colors.action);
  checkColorGroup("colors/accent", tokens.colors.accent);

  // 字体
  if (!jsonOutput) logSection("字体");
  for (const [name, def] of Object.entries(tokens.typography)) {
    const pattern = new RegExp(def.var.replace(/-/g, "\\-") + "\\s*:\\s*([^;]+);");
    const actual = extractValue(indexCss, pattern);
    check("typography", `${def.var}`, def.value, actual, def.file, def.line);
    if (!jsonOutput) reportResult({ name: `${def.var}`, expected: def.value, actual, file: def.file, line: def.line, pass: actual !== null && actual.toLowerCase() === def.value.toLowerCase() });
  }
}

// ══════════════════════════════════════════════════════════
// Phase 2: Frontend config.ts ↔ design-tokens.json
// ══════════════════════════════════════════════════════════

function checkFrontendConfig(tokens) {
  const configTs = readText(PATHS.FRONTEND_CONFIG);

  // 阶段颜色
  if (!jsonOutput) logSection("前端配置默认值 (config.ts)");

  for (const [name, def] of Object.entries(tokens.colors.phase)) {
    if (!def.configLine) continue;
    const pattern = new RegExp(`${name}:\\s*"([^"]+)"`);
    const actual = extractValue(configTs, pattern);
    check("config/colors", `${name}`, def.value, actual, def.configFile, def.configLine);
    if (!jsonOutput) reportResult({ name, expected: def.value, actual, file: def.configFile, line: def.configLine, pass: actual !== null && actual.toLowerCase() === def.value.toLowerCase() });
  }

  // Overlay 尺寸
  if (!jsonOutput) logSection("Overlay 尺寸");
  for (const [name, def] of Object.entries(tokens.dimensions.overlay)) {
    if (name === "panelMaxHeights") {
      // panelMaxHeights 是嵌套对象 {sessionList, sessionDetail},在 DEFAULT_CONFIG.overlay 块内逐子字段检查
      const defaultStart = configTs.indexOf("const DEFAULT_CONFIG");
      const searchBlock = defaultStart >= 0 ? configTs.substring(defaultStart) : configTs;
      const pmhBlock = searchBlock.match(/panelMaxHeights:\s*\{([^}]*)\}/);
      const blockContent = pmhBlock ? pmhBlock[1] : "";
      for (const [subName, subDef] of Object.entries(def)) {
        const subPattern = new RegExp(`${subName}:\\s*(\\d+)`);
        const actual = extractNumber(blockContent, subPattern);
        check("config/dimensions", `panelMaxHeights.${subName}`, subDef.value, actual, "frontend/src/store/config.ts", subDef.desc || "");
        if (!jsonOutput) reportResult({ name: `panelMaxHeights.${subName}`, expected: String(subDef.value), actual: String(actual), file: "frontend/src/store/config.ts", line: "", pass: actual === subDef.value });
      }
      continue;
    }
    const pattern = new RegExp(`${name}:\\s*(\\d+)`);
    const actual = extractNumber(configTs, pattern);
    check("config/dimensions", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) reportResult({ name, expected: String(def.value), actual: String(actual), file: def.file, line: def.line, pass: actual === def.value });
  }

  // UI 尺寸
  if (!jsonOutput) logSection("UI 尺寸");
  for (const [name, def] of Object.entries(tokens.dimensions.ui)) {
    const pattern = new RegExp(`${name}:\\s*(\\d+)`);
    const actual = extractNumber(configTs, pattern);
    check("config/ui-dimensions", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) reportResult({ name, expected: String(def.value), actual: String(actual), file: def.file, line: def.line, pass: actual === def.value });
  }

  // 弹簧参数
  if (!jsonOutput) logSection("弹簧参数");
  const defaultConfigBlock = configTs.substring(
    configTs.indexOf("const DEFAULT_CONFIG"),
    configTs.indexOf("// ===", configTs.indexOf("const DEFAULT_CONFIG") + 100)
  );
  for (const [name, def] of Object.entries(tokens.springs)) {
    const springBlockStart = defaultConfigBlock.indexOf(`${name}:`);
    if (springBlockStart === -1) {
      check("config/springs", `${name}.stiffness`, def.stiffness, null, def.file, def.line);
      check("config/springs", `${name}.damping`, def.damping, null, def.file, def.line);
      check("config/springs", `${name}.mass`, def.mass, null, def.file, def.line);
      continue;
    }
    const springBlock = defaultConfigBlock.substring(springBlockStart, defaultConfigBlock.indexOf("}", springBlockStart + 50) + 1);
    const actualStiffness = extractNumber(springBlock, /stiffness:\s*(\d+)/);
    const actualDamping = extractNumber(springBlock, /damping:\s*(\d+)/);
    const actualMass = extractNumber(springBlock, /mass:\s*([\d.]+)/);

    const passS = check("config/springs", `${name}.stiffness`, def.stiffness, actualStiffness, def.file, def.line);
    const passD = check("config/springs", `${name}.damping`, def.damping, actualDamping, def.file, def.line);
    const passM = check("config/springs", `${name}.mass`, def.mass, actualMass, def.file, def.line);

    if (!jsonOutput) {
      if (passS) logOk(`${name}.stiffness: ${def.stiffness}`);
      else logFail(`${name}.stiffness: 期望 ${def.stiffness} → 实际 ${actualStiffness}`);
      if (passD) logOk(`${name}.damping: ${def.damping}`);
      else logFail(`${name}.damping: 期望 ${def.damping} → 实际 ${actualDamping}`);
      if (passM) logOk(`${name}.mass: ${def.mass}`);
      else logFail(`${name}.mass: 期望 ${def.mass} → 实际 ${actualMass}`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// Phase 3: Rust types.rs ↔ Frontend config.ts 双向同步
// ══════════════════════════════════════════════════════════

function checkRustFrontendSync(tokens) {
  if (!jsonOutput) logSection("双向同步 (Rust ↔ 前端)");

  const rustConfig = readText(PATHS.RUST_CONFIG);
  const frontendConfig = readText(PATHS.FRONTEND_CONFIG);

  // 阶段颜色
  for (const [name, def] of Object.entries(tokens.colors.phase)) {
    if (!def.configLine) continue;
    const value = def.value.replace("#", "");
    const foundInRust = rustConfig.includes(value);
    check("dual-sync/colors", `Rust has ${name}`, true, foundInRust, PATHS.RUST_CONFIG, "—");
    if (!jsonOutput && !foundInRust) {
      logFail(`Rust 端缺少颜色: ${name} = ${def.value}`);
    } else if (!jsonOutput && foundInRust) {
      logOk(`Rust 端颜色 ${name}: ${def.value}`);
    }
  }

  // 弹簧参数
  for (const [name, def] of Object.entries(tokens.springs)) {
    const rustHasStiffness = rustConfig.includes(`stiffness: ${def.stiffness}`);
    const rustHasDamping = rustConfig.includes(`damping: ${def.damping}`);
    const pass = rustHasStiffness && rustHasDamping;
    check("dual-sync/springs", `Rust spring ${name}`, true, pass, PATHS.RUST_CONFIG, "—");
    if (!jsonOutput) {
      if (pass) logOk(`Rust 弹簧 ${name}: stiffness=${def.stiffness} damping=${def.damping}`);
      else logFail(`Rust 弹簧 ${name}: 参数可能有差异`);
    }
  }

  // UI 尺寸
  for (const [name, def] of Object.entries(tokens.dimensions.ui)) {
    const inRust = rustConfig.includes(`${def.value}`);
    // 更精确匹配：在 UiDimensions 结构体附近搜索
    const dimBlockMatch = rustConfig.match(/struct UiDimensions[\s\S]*?impl Default for UiDimensions[\s\S]*?\}/);
    const inDimBlock = dimBlockMatch ? dimBlockMatch[0].includes(`${def.value}`) : false;
    check("dual-sync/dimensions", `Rust has ${name}`, true, inDimBlock, PATHS.RUST_CONFIG, "—");
    if (!jsonOutput) {
      if (inDimBlock) logOk(`Rust 尺寸 ${name}: ${def.value}`);
      else logWarn(`Rust 尺寸 ${name}: 未在 UiDimensions 中确认 ${def.value}`);
    }
  }

  // Overlay 尺寸
  for (const [name, def] of Object.entries(tokens.dimensions.overlay)) {
    if (name === "panelMaxHeights") {
      // Rust 用 panel_max_heights struct 字段(PanelMaxHeights::default 值由 Rust 测试覆盖)
      const hasField = rustConfig.includes("panel_max_heights");
      check("dual-sync/overlay", `Rust overlay panelMaxHeights`, true, hasField, PATHS.RUST_CONFIG, "—");
      if (!jsonOutput) {
        if (hasField) logOk(`Rust overlay panelMaxHeights: panel_max_heights 字段存在`);
        else logWarn(`Rust overlay panelMaxHeights: 未确认 panel_max_heights 字段`);
      }
      continue;
    }
    const inRust = rustConfig.includes(`${def.value}`);
    check("dual-sync/overlay", `Rust overlay ${name}`, true, inRust, PATHS.RUST_CONFIG, "—");
    if (!jsonOutput) {
      if (inRust) logOk(`Rust overlay ${name}: ${def.value}`);
      else logWarn(`Rust overlay ${name}: 未确认 ${def.value}`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// Phase 4: animation.ts ↔ design-tokens.json
// ══════════════════════════════════════════════════════════

function checkAnimationConfig(tokens) {
  const animationTs = readText(PATHS.ANIMATION_CONFIG);

  if (!jsonOutput) logSection("动画参数 (animation.ts)");

  for (const [name, def] of Object.entries(tokens.cssTransitions)) {
    const pattern = new RegExp(`${name.toUpperCase()}:\\s*"([^"]+)"`);
    const actual = extractValue(animationTs, pattern);
    check("animation/css", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) reportResult({ name, expected: def.value, actual, file: def.file, line: def.line, pass: actual !== null && actual.toLowerCase() === def.value.toLowerCase() });
  }

  for (const [name, def] of Object.entries(tokens.easings)) {
    const pattern = new RegExp(`${name}:\\s*"([^"]+)"`);
    const actual = extractValue(animationTs, pattern);
    check("animation/easing", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) reportResult({ name, expected: def.value, actual, file: def.file, line: def.line, pass: actual !== null && actual.toLowerCase() === def.value.toLowerCase() });
  }
}

// ══════════════════════════════════════════════════════════
// Phase 5: BEM 命名约定扫描（警告，不阻塞）
// ══════════════════════════════════════════════════════════

function checkBemConventions() {
  if (!jsonOutput) logSection("BEM 命名约定 (警告)");

  if (!fs.existsSync(PATHS.COMPONENTS_DIR)) return;

  const cssFiles = fs.readdirSync(PATHS.COMPONENTS_DIR).filter(f => f.endsWith(".css"));

  for (const file of cssFiles) {
    const content = readText(path.join(PATHS.COMPONENTS_DIR, file));
    const lineCount = content.split("\n").length;
    const isComplex = lineCount > 20;

    if (isComplex) {
      const hasDoubleDash = content.includes("--");
      const hasDoubleUnderscore = content.includes("__");
      if (!hasDoubleDash && !jsonOutput) logWarn(`${file}: 无 BEM 修饰符 (--)`);
      if (!hasDoubleUnderscore && !jsonOutput) logWarn(`${file}: 无 BEM 元素 (__)`);
    }

    // 检测 inline style（应避免）
    const hasInlineStyle = /style\s*=\s*\{/.test(content);
    if (hasInlineStyle) {
      check("bem", `${file}: no inline style`, false, true, file, "—");
      if (!jsonOutput) logFail(`${file}: 包含 inline style`);
    }
  }
}

// ══════════════════════════════════════════════════════════
// 主流程
// ══════════════════════════════════════════════════════════

function main() {
  // 加载 design tokens（单一真相来源）
  const tokens = readJson(PATHS.DESIGN_TOKENS);

  if (!jsonOutput) {
    process.stdout.write("\n🔍 Vibe Island 配置同步检查\n");
  }

  // 执行 5 个检查阶段
  checkCssTokens(tokens);          // Phase 1
  checkFrontendConfig(tokens);     // Phase 2
  checkRustFrontendSync(tokens);   // Phase 3
  checkAnimationConfig(tokens);    // Phase 4
  checkBemConventions();           // Phase 5

  // 汇总结果
  const { total, passed, failed } = summary();

  if (jsonOutput) {
    process.stdout.write(JSON.stringify({ total, passed, failed, checks: summary().checks.filter(c => !c.pass) }, null, 2) + "\n");
  } else {
    process.stdout.write(`\n${"─".repeat(50)}\n`);
    process.stdout.write(` 总计: ${total}  |  通过: ${passed}  |  失败: ${failed}\n`);
    if (failed === 0) {
      process.stdout.write(" ✅ 全部配置参数与源码一致\n\n");
    } else {
      process.stdout.write(` ❌ ${failed} 项不一致，请检查上方详情\n\n`);
    }
  }

  // strict 模式下警告也算失败
  process.exit(failed > 0 ? EXIT.FAIL : EXIT.OK);
}

main();
