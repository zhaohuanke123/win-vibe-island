import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * 响应式截图测试
 *
 * 在不同 viewport 尺寸和密度配置下对展开态 overlay 截图，
 * 用于视觉回归对比。
 */

function makeSession(
  id: string,
  label: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    label,
    cwd: `C:\\Projects\\${label.toLowerCase()}`,
    state: "running",
    createdAt: Date.now() - 120000,
    lastActivity: Date.now() - 5000,
    agent: "claude",
    toolHistory: [],
    ...overrides,
  };
}

const SESSIONS = [
  makeSession("s1", "Alpha", { state: "running", agent: "claude" }),
  makeSession("s2", "Beta", {
    state: "waitingForApproval",
    agent: "codex",
  }),
  makeSession("s3", "Gamma", { state: "completed", agent: "cursor" }),
];

test.describe("Screenshot — Responsive Viewports", () => {
  test("responsive-400x300", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await page.goto("http://localhost:5187");
    const client = new VibeTestClient(page);
    await client.resetAll();

    await client.setSessions(SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(700);

    await expect(page.getByTestId("overlay")).toBeAttached();
    await page.screenshot({
      path: "test-results/screenshots/responsive-400x300.png",
      fullPage: true,
    });
  });

  test("responsive-800x600", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("http://localhost:5187");
    const client = new VibeTestClient(page);
    await client.resetAll();

    await client.setSessions(SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(700);

    await expect(page.getByTestId("overlay")).toBeAttached();
    await page.screenshot({
      path: "test-results/screenshots/responsive-800x600.png",
      fullPage: true,
    });
  });

  test("responsive-1400x900", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("http://localhost:5187");
    const client = new VibeTestClient(page);
    await client.resetAll();

    await client.setSessions(SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(700);

    await expect(page.getByTestId("overlay")).toBeAttached();
    await page.screenshot({
      path: "test-results/screenshots/responsive-1400x900.png",
      fullPage: true,
    });
  });
});

test.describe("Screenshot — Density Variants", () => {
  test("density-comfortable", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("http://localhost:5187");
    const client = new VibeTestClient(page);
    await client.resetAll();

    await client.setSessions(SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(700);

    await expect(page.getByTestId("overlay")).toBeAttached();
    await page.screenshot({
      path: "test-results/screenshots/density-comfortable.png",
      fullPage: true,
    });
  });

  test("density-compact", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto("http://localhost:5187");
    const client = new VibeTestClient(page);
    await client.resetAll();

    await client.setConfigField(["ui", "density"], "compact");

    await client.setSessions(SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(700);

    await expect(page.getByTestId("overlay")).toBeAttached();
    await page.screenshot({
      path: "test-results/screenshots/density-compact.png",
      fullPage: true,
    });
  });
});
