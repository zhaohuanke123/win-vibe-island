import { test } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * Screenshot Tests — Compact overlay states
 *
 * 5 张截图覆盖主要状态：idle、running、waitingForApproval、waitingForAnswer、completed
 * 使用 setSessions + clickBar / simulatePermissionRequest / simulateQuestionRequest
 */

test.describe("Screenshot — Compact Overlay States", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("compact-idle: no sessions, compact notch bar", async ({ page }) => {
    // 无 session 状态，直接截图 compact notch bar
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/compact-idle.png",
    });
  });

  test("compact-running: single running session expanded", async ({ page }) => {
    await client.setSessions([
      {
        id: "s1",
        label: "my-app",
        cwd: "C:\\Projects\\my-app",
        state: "running",
        createdAt: Date.now() - 60000,
        lastActivity: Date.now() - 3000,
        agent: "claude",
        toolHistory: [],
      },
    ]);

    // 点击展开 overlay
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/compact-running.png",
    });
  });

  test("compact-waiting-approval: permission request state", async ({ page }) => {
    // 创建 running session
    await client.setSessions([
      {
        id: "s1",
        label: "my-app",
        cwd: "C:\\Projects\\my-app",
        state: "running",
        createdAt: Date.now() - 60000,
        lastActivity: Date.now() - 3000,
        agent: "claude",
        toolHistory: [],
      },
    ]);

    // 触发 permission request（高风险 bash 命令）
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t1",
      toolName: "Bash",
      toolInput: { command: "rm -rf /tmp/data" },
      action: "Execute bash command",
      riskLevel: "high",
    });

    // 展开 overlay
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/compact-waiting-approval.png",
    });
  });

  test("compact-waiting-answer: question request state", async ({ page }) => {
    // 创建 running session
    await client.setSessions([
      {
        id: "s1",
        label: "my-app",
        cwd: "C:\\Projects\\my-app",
        state: "running",
        createdAt: Date.now() - 60000,
        lastActivity: Date.now() - 3000,
        agent: "claude",
        toolHistory: [],
      },
    ]);

    // 触发 question request
    await client.simulateQuestionRequest({
      sessionId: "s1",
      toolUseId: "t2",
      questions: [
        {
          question: "Which framework?",
          header: "Framework",
          options: [{ label: "React" }, { label: "Vue" }],
        },
      ],
    });

    // 展开 overlay
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/compact-waiting-answer.png",
    });
  });

  test("compact-completed: completed session expanded", async ({ page }) => {
    await client.setSessions([
      {
        id: "s1",
        label: "my-app",
        cwd: "C:\\Projects\\my-app",
        state: "completed",
        createdAt: Date.now() - 600000,
        lastActivity: Date.now() - 400000,
        agent: "claude",
        toolHistory: [],
      },
    ]);

    // 展开 overlay
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/compact-completed.png",
    });
  });
});
