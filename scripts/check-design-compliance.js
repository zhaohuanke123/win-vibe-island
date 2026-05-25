#!/usr/bin/env node
/**
 * 设计合规检查 — 对比源码中的设计参数与 design-tokens.json
 *
 * 用法:
 *   node scripts/check-design-compliance.js
 *   node scripts/check-design-compliance.js --json     (JSON 输出)
 *   node scripts/check-design-compliance.js --specs    (同时检查 spec 文档中的参数)
 *
 * 退出码: 0 = 全部通过 / 1 = 有差异
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_FILE = path.join(ROOT, "docs/design/design-tokens.json");

// ── 从源码文件中提取值的函数 ──

function extractValue(content, pattern) {
  const m = content.match(pattern);
  return m ? m[1] : null;
}

function extractNumber(content, pattern) {
  const v = extractValue(content, pattern);
  return v !== null ? Number(v) : null;
}

// ── 检查清单 ──

const checks = [];
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(category, name, expected, actual, file, line) {
  totalChecks++;
  const pass = String(expected).toLowerCase() === String(actual).toLowerCase();
  if (pass) {
    passedChecks++;
  } else {
    failedChecks++;
  }
  checks.push({ category, name, expected, actual, file, line, pass });
  return pass;
}

function report(result) {
  if (result.pass) {
    console.log(`  ✓ ${result.name}: ${result.expected}`);
  } else {
    console.log(`  ✗ ${result.name}: 期望 "${result.expected}" → 实际 "${result.actual}"  (${result.file}:${result.line})`);
  }
}

// ── 主检查逻辑 ──

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const checkSpecs = args.includes("--specs");

  if (!fs.existsSync(TOKENS_FILE)) {
    console.error("❌ 找不到 design-tokens.json");
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));

  if (!jsonOutput) {
    console.log("\n🔍 Vibe Island 设计合规检查\n");
  }

  // ── 1. CSS 变量检查 (index.css) ──
  const indexCss = fs.readFileSync(path.join(ROOT, "frontend/src/index.css"), "utf-8");

  if (!jsonOutput) console.log("── CSS 变量 (index.css) ──");

  function checkColorTokens(category, tokenGroup) {
    for (const [name, def] of Object.entries(tokenGroup)) {
      if (name.startsWith("_")) continue;
      const pattern = new RegExp(def.var.replace(/-/g, "\\-") + "\\s*:\\s*([^;]+);");
      const actual = extractValue(indexCss, pattern);
      const ok = check(category, `${def.var}`, def.value, actual, def.file, def.line);
      if (!jsonOutput) report(checks[checks.length - 1]);
    }
  }

  checkColorTokens("colors/base", tokens.colors.base);
  checkColorTokens("colors/glass", tokens.colors.glass);
  checkColorTokens("colors/phase", tokens.colors.phase);
  checkColorTokens("colors/action", tokens.colors.action);
  checkColorTokens("colors/accent", tokens.colors.accent);

  // 字体
  if (!jsonOutput) console.log("\n── 字体 ──");
  for (const [name, def] of Object.entries(tokens.typography)) {
    const pattern = new RegExp(def.var.replace(/-/g, "\\-") + "\\s*:\\s*([^;]+);");
    const actual = extractValue(indexCss, pattern);
    check("typography", `${def.var}`, def.value, actual, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  // ── 2. Config 默认值检查 (config.ts) ──
  const configTs = fs.readFileSync(path.join(ROOT, "frontend/src/store/config.ts"), "utf-8");

  if (!jsonOutput) console.log("\n── 前端配置默认值 (config.ts) ──");

  // 阶段颜色
  for (const [name, def] of Object.entries(tokens.colors.phase)) {
    if (!def.configLine) continue;
    const pattern = new RegExp(`${name}:\\s*"([^"]+)"`);
    const actual = extractValue(configTs, pattern);
    check("config/colors", `${name}`, def.value, actual, def.configFile, def.configLine);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  // Overlay 尺寸
  if (!jsonOutput) console.log("\n── Overlay 尺寸 ──");
  for (const [name, def] of Object.entries(tokens.dimensions.overlay)) {
    const pattern = new RegExp(`${name}:\\s*(\\d+)`);
    const actual = extractNumber(configTs, pattern);
    check("config/dimensions", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  // UI 尺寸
  if (!jsonOutput) console.log("\n── UI 尺寸 ──");
  for (const [name, def] of Object.entries(tokens.dimensions.ui)) {
    const pattern = new RegExp(`${name}:\\s*(\\d+)`);
    const actual = extractNumber(configTs, pattern);
    check("config/ui-dimensions", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  // 弹簧参数 — 在 DEFAULT_CONFIG 块内搜索
  if (!jsonOutput) console.log("\n── 弹簧参数 ──");
  const defaultConfigBlock = configTs.substring(
    configTs.indexOf("const DEFAULT_CONFIG"),
    configTs.indexOf("// ===", configTs.indexOf("const DEFAULT_CONFIG") + 100)
  );
  for (const [name, def] of Object.entries(tokens.springs)) {
    // 在 defaultConfigBlock 中找 spring 子块
    const springBlockStart = defaultConfigBlock.indexOf(`${name}:`);
    if (springBlockStart === -1) {
      check("config/springs", `${name}.stiffness`, def.stiffness, null, def.file, def.line);
      if (!jsonOutput) report(checks[checks.length - 1]);
      check("config/springs", `${name}.damping`, def.damping, null, def.file, def.line);
      if (!jsonOutput) report(checks[checks.length - 1]);
      check("config/springs", `${name}.mass`, def.mass, null, def.file, def.line);
      if (!jsonOutput) report(checks[checks.length - 1]);
      continue;
    }
    const springBlock = defaultConfigBlock.substring(springBlockStart, defaultConfigBlock.indexOf("}", springBlockStart + 50) + 1);
    const actualStiffness = extractNumber(springBlock, /stiffness:\s*(\d+)/);
    const actualDamping = extractNumber(springBlock, /damping:\s*(\d+)/);
    const actualMass = extractNumber(springBlock, /mass:\s*([\d.]+)/);
    check("config/springs", `${name}.stiffness`, def.stiffness, actualStiffness, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
    check("config/springs", `${name}.damping`, def.damping, actualDamping, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
    check("config/springs", `${name}.mass`, def.mass, actualMass, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  // ── 3. 动画参数检查 (animation.ts) ──
  const animationTs = fs.readFileSync(path.join(ROOT, "frontend/src/config/animation.ts"), "utf-8");

  if (!jsonOutput) console.log("\n── 动画参数 (animation.ts) ──");

  for (const [name, def] of Object.entries(tokens.cssTransitions)) {
    const pattern = new RegExp(`${name.toUpperCase()}:\\s*"([^"]+)"`);
    const actual = extractValue(animationTs, pattern);
    check("animation/css", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  for (const [name, def] of Object.entries(tokens.easings)) {
    const pattern = new RegExp(`${name}:\\s*"([^"]+)"`);
    const actual = extractValue(animationTs, pattern);
    check("animation/easing", name, def.value, actual, def.file, def.line);
    if (!jsonOutput) report(checks[checks.length - 1]);
  }

  // ── 4. 双向同步检查：Rust 端 vs 前端 ──
  if (!jsonOutput) console.log("\n── 双向同步 (Rust ↔ 前端) ──");

  const rustConfigPath = path.join(ROOT, "src-tauri/src/config/types.rs");
  if (fs.existsSync(rustConfigPath)) {
    const rustConfig = fs.readFileSync(rustConfigPath, "utf-8");

    // 阶段颜色
    for (const [name, def] of Object.entries(tokens.colors.phase)) {
      if (!def.configLine) continue;
      // 在 Rust 文件中查找相同颜色值
      const value = def.value.replace("#", "");
      const foundInRust = rustConfig.includes(value);
      check("dual-sync/colors", `Rust has ${name}`, true, foundInRust, rustConfigPath, "—");
      if (!jsonOutput) {
        if (!foundInRust) {
          console.log(`  ✗ Rust 端缺少颜色: ${name} = ${def.value}`);
        }
      }
    }

    // 弹簧参数
    for (const [name, def] of Object.entries(tokens.springs)) {
      // 在 Rust 中查找 stiffness: 300, damping: 30, mass: 0.8 等
      const inRust = rustConfig.includes(`stiffness: ${def.stiffness}`) &&
                     rustConfig.includes(`damping: ${def.damping}`);
      check("dual-sync/springs", `Rust spring ${name}`, inRust, true, rustConfigPath, "—");
      if (!jsonOutput && !inRust) {
        console.log(`  ✗ Rust 端弹簧参数可能有差异: ${name}`);
      }
    }
  }

  // ── 5. BEM 命名约定检查 (警告，不阻塞) ──
  if (!jsonOutput) console.log("\n── BEM 命名约定 (警告) ──");
  const componentsDir = path.join(ROOT, "frontend/src/components");
  if (fs.existsSync(componentsDir)) {
    const cssFiles = fs.readdirSync(componentsDir).filter(f => f.endsWith(".css"));
    for (const file of cssFiles) {
      const content = fs.readFileSync(path.join(componentsDir, file), "utf-8");
      const lineCount = content.split("\n").length;
      const hasInlineStyle = /style\s*=\s*\{/.test(content);
      // 仅对复杂CSS文件（>20行）检查 BEM
      const isComplex = lineCount > 20;
      if (isComplex) {
        const hasDoubleDash = content.includes("--");
        const hasDoubleUnderscore = content.includes("__");
        if (!hasDoubleDash && !jsonOutput) console.log(`  ⚠ ${file}: 无 BEM 修饰符 (--)`);
        if (!hasDoubleUnderscore && !jsonOutput) console.log(`  ⚠ ${file}: 无 BEM 元素 (__)`);
      }
      if (hasInlineStyle) {
        check("bem", `${file}: no inline style`, false, true, file, "—");
        if (!jsonOutput) console.log(`  ✗ ${file}: 包含 inline style`);
      }
    }
  }

  // ── 结果 ──
  if (jsonOutput) {
    console.log(JSON.stringify({
      total: totalChecks,
      passed: passedChecks,
      failed: failedChecks,
      checks: checks.filter(c => !c.pass),
    }, null, 2));
  } else {
    console.log(`\n${"─".repeat(50)}`);
    console.log(` 总计: ${totalChecks}  |  通过: ${passedChecks}  |  失败: ${failedChecks}`);
    if (failedChecks === 0) {
      console.log(" ✅ 全部设计参数与源码一致\n");
    } else {
      console.log(` ❌ ${failedChecks} 项不一致，请检查上方详情\n`);
    }
  }

  process.exit(failedChecks > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("检查脚本出错:", err);
  process.exit(2);
});
