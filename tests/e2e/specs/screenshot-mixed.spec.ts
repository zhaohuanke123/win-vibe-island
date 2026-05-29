import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * 截图测试 — 混合场景
 *
 * 覆盖：长标题截断、toolHistory 渲染、stale 暗化、多 agent 颜色点、空状态。
 */

function makeSession(id: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label,
    cwd: "C:\\Projects\\" + label.toLowerCase().replace(/\s+/g, "-").slice(0, 30),
    state: "running",
    createdAt: Date.now() - 120000,
    lastActivity: Date.now() - 5000,
    agent: "claude",
    toolHistory: [],
    ...overrides,
  };
}

test.describe("screenshot-mixed", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    client = new VibeTestClient(page);
    await page.goto("http://localhost:5187");
    await page.waitForTimeout(700);
    await client.resetAll();
    await page.waitForTimeout(300);
  });

  test("mixed-long-titles", async ({ page }) => {
    // 3 个 session，label 超过 150 字符 → 验证文本截断
    const sessions = [
      makeSession("s1", "A".repeat(150), { state: "running", agent: "claude" }),
      makeSession("s2", "B".repeat(160), { state: "running", agent: "codex" }),
      makeSession("s3", "C".repeat(180), { state: "completed", agent: "cursor" }),
    ];
    await client.setSessions(sessions);
    await page.waitForTimeout(500);
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/mixed-long-titles.png",
      fullPage: true,
    });
  });

  test("mixed-tool-history", async ({ page }) => {
    const now = Date.now();
    const sessions = [
      makeSession("s1", "Tool History Demo", {
        state: "running",
        agent: "claude",
        toolHistory: [
          { toolName: "Bash", startTime: now - 60000, endTime: now - 55000, status: "completed", input: { command: "npm install" } },
          { toolName: "Read", startTime: now - 50000, endTime: now - 48000, status: "completed", input: { file_path: "src/index.ts" } },
          { toolName: "Write", startTime: now - 40000, endTime: now - 35000, status: "completed", input: { file_path: "src/app.ts" } },
          { toolName: "Grep", startTime: now - 30000, endTime: now - 28000, status: "error", error: "Pattern not found" },
          { toolName: "Edit", startTime: now - 20000, endTime: now - 15000, status: "completed", input: { file_path: "src/config.ts" } },
        ],
      }),
    ];
    await client.setSessions(sessions);
    await page.waitForTimeout(500);
    await client.clickBar();
    await page.waitForTimeout(500);
    await client.clickChevron("s1");
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/mixed-tool-history.png",
      fullPage: true,
    });
  });

  test("mixed-stale", async ({ page }) => {
    // completed 且 lastActivity 超过 5 分钟 → stale 暗化
    const sessions = [
      makeSession("s1", "Old Completed Session", {
        state: "completed",
        lastActivity: Date.now() - 600000,
        agent: "claude",
      }),
    ];
    await client.setSessions(sessions);
    await page.waitForTimeout(500);
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/mixed-stale.png",
      fullPage: true,
    });
  });

  test("mixed-all-agents", async ({ page }) => {
    // 6 个 session，分别使用 6 种 agent → 展示 agent 颜色点
    const agents = ["claude", "codex", "cursor", "gemini", "kimi", "opencode"];
    const sessions = agents.map((agent, i) =>
      makeSession(`s${i + 1}`, `Project ${agent}`, {
        state: "running",
        agent,
      })
    );
    await client.setSessions(sessions);
    await page.waitForTimeout(500);
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/mixed-all-agents.png",
      fullPage: true,
    });
  });

  test("mixed-empty-expanded", async ({ page }) => {
    // 无 session → 展开 → 空状态截图
    await client.clickBar();
    await page.waitForTimeout(700);

    await page.screenshot({
      path: "test-results/screenshots/mixed-empty-expanded.png",
      fullPage: true,
    });
  });
});
