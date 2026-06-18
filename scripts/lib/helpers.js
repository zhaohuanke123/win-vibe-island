/**
 * 共享防御式工具函数 — 所有脚本共用的基础操作
 *
 * 设计原则：
 *   1. 每个 fs/child_process 调用必须 try-catch
 *   2. 失败时 stderr 报错 + process.exit(EXIT.ERROR)，绝不静默吞噬
 *   3. 返回值风格：readJson/readText 失败直接退出，runCommand 返回 { ok, stdout, stderr }
 *
 * 用法: const { readJson, readText, runCommand, logOk, logFail, logWarn, ... } = require("./lib/helpers");
 */

"use strict";

const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const { EXIT } = require("./constants");

// ============================================================================
// 文件操作
// ============================================================================

/**
 * 读取并解析 JSON 文件。失败时 stderr 报错 + process.exit(ERROR)。
 * @param {string} filePath
 * @returns {any} 解析后的对象
 */
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`✗ 读取 JSON 失败: ${filePath}\n  ${err.message}\n`);
    process.exit(EXIT.ERROR);
  }
}

/**
 * 安全读取文本文件。失败时 stderr 报错 + process.exit(ERROR)。
 * @param {string} filePath
 * @returns {string}
 */
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    process.stderr.write(`✗ 读取文件失败: ${filePath}\n  ${err.message}\n`);
    process.exit(EXIT.ERROR);
  }
}

/**
 * 写入 JSON 文件（格式化缩进）。失败时 stderr 报错 + process.exit(ERROR)。
 * @param {string} filePath
 * @param {any} data
 * @param {number} [indent=2]
 */
function writeJson(filePath, data, indent) {
  try {
    const content = JSON.stringify(data, null, indent !== undefined ? indent : 2) + "\n";
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    process.stderr.write(`✗ 写入 JSON 失败: ${filePath}\n  ${err.message}\n`);
    process.exit(EXIT.ERROR);
  }
}

/**
 * 写入文本文件。失败时 stderr 报错 + process.exit(ERROR)。
 * @param {string} filePath
 * @param {string} content
 */
function writeText(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (err) {
    process.stderr.write(`✗ 写入文件失败: ${filePath}\n  ${err.message}\n`);
    process.exit(EXIT.ERROR);
  }
}

// ============================================================================
// 命令执行
// ============================================================================

/**
 * 执行 shell 命令。不抛异常，返回结果对象。
 * @param {string} cmd
 * @param {object} [options] execSync options
 * @returns {{ ok: boolean, stdout: string, stderr: string, code: number }}
 */
function runCommand(cmd, options) {
  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 120000,
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
    return { ok: true, stdout, stderr: "", code: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
      code: err.status || 1,
    };
  }
}

// ============================================================================
// 正则提取工具（从 check-design-compliance.js 提取）
// ============================================================================

/**
 * 从文本中提取第一个匹配值
 * @param {string} content
 * @param {RegExp} pattern
 * @returns {string|null}
 */
function extractValue(content, pattern) {
  const m = content.match(pattern);
  return m ? m[1] : null;
}

/**
 * 从文本中提取数字值
 * @param {string} content
 * @param {RegExp} pattern
 * @returns {number|null}
 */
function extractNumber(content, pattern) {
  const v = extractValue(content, pattern);
  return v !== null ? Number(v) : null;
}

// ============================================================================
// 格式化输出
// ============================================================================

function logOk(msg) {
  process.stdout.write(`  ✓ ${msg}\n`);
}

function logFail(msg) {
  process.stdout.write(`  ✗ ${msg}\n`);
}

function logWarn(msg) {
  process.stdout.write(`  ⚠ ${msg}\n`);
}

function logSection(title) {
  process.stdout.write(`\n── ${title} ──\n`);
}

// ============================================================================
// 检查框架（从 check-design-compliance.js 提取）
// ============================================================================

/**
 * 创建一个检查收集器
 * @returns {{ check, getResults, summary }}
 */
function createChecker() {
  const checks = [];

  function check(category, name, expected, actual, file, line) {
    const pass = String(expected).toLowerCase() === String(actual).toLowerCase();
    checks.push({ category, name, expected, actual, file, line, pass });
    return pass;
  }

  function getResults() {
    return checks;
  }

  function summary() {
    const total = checks.length;
    const passed = checks.filter(c => c.pass).length;
    const failed = total - passed;
    return { total, passed, failed, checks };
  }

  return { check, getResults, summary };
}

/**
 * 格式化单个检查结果
 * @param {{ name: string, expected: string, actual: string, file: string, pass: boolean }} result
 */
function reportResult(result) {
  if (result.pass) {
    logOk(`${result.name}: ${result.expected}`);
  } else {
    logFail(`${result.name}: 期望 "${result.expected}" → 实际 "${result.actual}"  (${result.file}:${result.line || "—"})`);
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  readJson,
  readText,
  writeJson,
  writeText,
  runCommand,
  extractValue,
  extractNumber,
  logOk,
  logFail,
  logWarn,
  logSection,
  createChecker,
  reportResult,
};
