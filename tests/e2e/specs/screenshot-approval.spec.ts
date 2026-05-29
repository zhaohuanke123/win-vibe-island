import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";
import { mkdirSync } from "fs";
import { resolve } from "path";

/**
 * 审批 UI 截图测试
 *
 * 覆盖：Bash 高风险、文件写入、计划审批、提问审批、三按钮审批
 * 生成 test-results/screenshots/ 下的基线截图。
 */

const SCREENSHOT_DIR = resolve(__dirname, "../test-results/screenshots");

function makeSession(id: string, label: string) {
  return {
    id,
    label,
    cwd: "C:\\Projects\\test",
    state: "running",
    createdAt: Date.now() - 60000,
    lastActivity: Date.now() - 3000,
    agent: "claude",
    toolHistory: [],
  };
}

test.describe("审批 UI 截图", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    // 确保截图目录存在（放在 beforeEach 中保证每次运行都存在）
    mkdirSync(SCREENSHOT_DIR, { recursive: true });

    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    // 设置基础 session
    await client.setSessions([makeSession("s1", "test")] as any);
    await page.waitForTimeout(200);
  });

  test("approval-bash-high-risk: Bash 高风险审批截图", async ({ page }) => {
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t1",
      toolName: "Bash",
      toolInput: { command: "sudo rm -rf /var/data" },
      action: "Execute dangerous command",
      riskLevel: "high",
    });
    await page.waitForTimeout(700);

    // 展开 overlay
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, "approval-bash-high-risk.png"),
      fullPage: true,
    });
  });

  test("approval-write-file: 文件写入审批截图", async ({ page }) => {
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t2",
      toolName: "Write",
      toolInput: { file_path: "src/config.ts", content: "export const config = {}" },
      action: "Write file",
      riskLevel: "medium",
    });
    await page.waitForTimeout(700);

    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, "approval-write-file.png"),
      fullPage: true,
    });
  });

  test("approval-plan: 计划审批截图", async ({ page }) => {
    await client.simulatePlanRequest({
      sessionId: "s1",
      toolUseId: "t3",
      planContent: "## Implementation Plan\n\n1. Add dependency\n2. Create module\n3. Write tests",
    });
    await page.waitForTimeout(700);

    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, "approval-plan.png"),
      fullPage: true,
    });
  });

  test("approval-question: 提问审批截图", async ({ page }) => {
    await client.simulateQuestionRequest({
      sessionId: "s1",
      toolUseId: "t4",
      questions: [
        {
          question: "Which database?",
          header: "Database",
          options: [
            { label: "PostgreSQL", description: "Production-grade SQL" },
            { label: "SQLite", description: "Lightweight embedded" },
          ],
        },
      ],
    });
    await page.waitForTimeout(700);

    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, "approval-question.png"),
      fullPage: true,
    });
  });

  test("approval-3way: 三按钮审批截图", async ({ page }) => {
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t5",
      toolName: "Bash",
      toolInput: { command: "git push --force" },
      action: "Force push to main",
      riskLevel: "high",
    });
    await page.waitForTimeout(700);

    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, "approval-3way.png"),
      fullPage: true,
    });
  });
});
