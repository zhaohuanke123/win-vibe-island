import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * SessionRow 状态视觉测试
 *
 * 覆盖：不同状态的颜色指示、标题显示、时间格式化、
 * agent chip、stale 样式。
 *
 * 注意：idle 状态的 session 默认在折叠组中不可见，
 * 测试使用 running/completed 状态。
 */

function makeSession(id: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label,
    cwd: `C:\\Projects\\${label.toLowerCase().replace(/\s+/g, "-")}`,
    state: "running",
    createdAt: Date.now() - 120000,
    lastActivity: Date.now() - 5000,
    agent: "claude",
    toolHistory: [],
    ...overrides,
  };
}

test.describe("SessionRow — 状态颜色指示", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("不同 state 的 row 有不同的 data-phase", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "Running", { state: "running" }),
      makeSession("s2", "Completed", { state: "completed" }),
    ] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const phases = ["running", "completed"];
    for (let i = 0; i < phases.length; i++) {
      const row = page.locator(`[data-session-id="s${i + 1}"]`);
      const phase = await row.getAttribute("data-phase");
      expect(phase).toBe(phases[i]);
    }
  });

  test("running session 的 indicator 有颜色", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", { state: "running" })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // .ind-dot 是 StateIndicator 渲染的子元素
    const dot = page.locator('[data-session-id="s1"] .ind-dot');
    await expect(dot).toBeAttached();

    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg).not.toBe("transparent");
  });

  test("completed session 的 indicator 颜色不同于 running", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "A", { state: "running" }),
      makeSession("s2", "B", { state: "completed" }),
    ] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const runColor = await page
      .locator('[data-session-id="s1"] .ind-dot')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const doneColor = await page
      .locator('[data-session-id="s2"] .ind-dot')
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(runColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(doneColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(runColor).not.toBe(doneColor);
  });

  test("row-indicator 包含子元素", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", { state: "running" })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const indicator = page.locator('[data-session-id="s1"] [data-testid="row-indicator"]');
    await expect(indicator).toBeAttached();

    // indicator 内应有子元素（ind-dot / ind-bar / ind-glyph）
    const childCount = await indicator.locator("*").count();
    expect(childCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe("SessionRow — 标题与内容", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("session project name 在 row content 中显示", async ({ page }) => {
    await client.setSessions([makeSession("s1", "My Project")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // displayLabel 使用 extractProjectName(cwd) → 最后一段路径
    const content = await client.getTextContents('[data-session-id="s1"] [data-testid="row-content"]');
    // project name 来自 cwd 的最后一段
    expect(content.join(" ")).toContain("my-project");
  });

  test("长标题 session 不破坏布局", async ({ page }) => {
    const longLabel = "A".repeat(200);
    await client.setSessions([makeSession("s1", longLabel)] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const row = page.locator('[data-session-id="s1"]');
    const rowRect = await row.boundingBox();
    const overlayRect = await page.getByTestId("overlay").boundingBox();
    expect(rowRect).not.toBeNull();
    expect(overlayRect).not.toBeNull();
    expect(rowRect!.width).toBeLessThanOrEqual(overlayRect!.width + 2);
  });

  test("agent chip 显示 agent 名称", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", { agent: "claude" })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const chip = await client.getTextContents('[data-session-id="s1"] [data-testid="agent-chip"]');
    expect(chip[0].length).toBeGreaterThan(0);
  });

  test("session label 在 setSessions 中设置后可从 store 读取", async () => {
    await client.setSessions([makeSession("s1", "Custom Label")] as any);
    const sessions = await client.getSessions();
    expect(sessions[0].label).toBe("Custom Label");
  });
});

test.describe("SessionRow — 时间显示", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("session row 有 age 元素", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const age = page.locator('[data-session-id="s1"] [data-testid="row-age"]');
    await expect(age).toBeAttached();
  });

  test("age 元素有非空文本", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const ageText = await client.getTextContents('[data-session-id="s1"] [data-testid="row-age"]');
    expect(ageText[0].length).toBeGreaterThan(0);
  });

  test("较旧的 session 显示分钟级时间", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", {
      lastActivity: Date.now() - 300000, // 5 分钟前
    })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const ageText = await client.getTextContents('[data-session-id="s1"] [data-testid="row-age"]');
    // 应显示类似 "5m" 的格式
    expect(ageText[0]).toMatch(/\d+[smhd]/);
  });

  test("多个 session 的 age 可能不同", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "Recent", { lastActivity: Date.now() - 5000 }),
      makeSession("s2", "Older", { lastActivity: Date.now() - 600000 }),
    ] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const ages = await client.getTextContents('[data-testid="row-age"]');
    expect(ages.length).toBe(2);
    // 两个 age 都应有内容
    ages.forEach((age: string) => expect(age.length).toBeGreaterThan(0));
  });
});

test.describe("SessionRow — Stale 样式", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("completed 超过 5 分钟 → stale class", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Old Proj", {
      state: "completed",
      lastActivity: Date.now() - 400000,
    })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const hasStale = await page.evaluate(() =>
      document.querySelector('[data-session-id="s1"]')?.classList.contains("session-row--stale")
    );
    expect(hasStale).toBe(true);
  });

  test("stale session 有降低的 opacity", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Old Proj", {
      state: "completed",
      lastActivity: Date.now() - 400000,
    })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const row = page.locator('[data-session-id="s1"]');
    const opacity = await row.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test("completed 不到 5 分钟 → 非 stale", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Recent Proj", {
      state: "completed",
      lastActivity: Date.now() - 100000,
    })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const hasStale = await page.evaluate(() =>
      document.querySelector('[data-session-id="s1"]')?.classList.contains("session-row--stale")
    );
    expect(hasStale).toBe(false);
  });

  test("running session 永远不 stale", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Running Proj", {
      state: "running",
      lastActivity: Date.now() - 1000000, // 很久以前
    })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const hasStale = await page.evaluate(() =>
      document.querySelector('[data-session-id="s1"]')?.classList.contains("session-row--stale")
    );
    expect(hasStale).toBe(false);
  });
});
