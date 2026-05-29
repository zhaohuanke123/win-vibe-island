import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * StatusDot / StateIndicator 视觉状态测试
 *
 * 覆盖：各状态指示灯颜色、CSS class、尺寸一致性。
 * SessionRow 使用 StateIndicator (kind="dot" 默认) 渲染指示灯，
 * 内部子元素 .ind-dot 有 inline backgroundColor。
 */

function makeSession(id: string, label: string, state: string) {
  return {
    id,
    label,
    cwd: `C:\\Projects\\${label}`,
    state,
    createdAt: Date.now() - 60000,
    lastActivity: Date.now() - 2000,
    agent: "claude",
    toolHistory: [],
  };
}

test.describe("StatusDot — 状态颜色与 class", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("running 状态指示灯有 phase color", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Running Proj", "running")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // .ind-dot 是 StateIndicator 渲染的子元素，有 inline backgroundColor
    const dot = page.locator('[data-session-id="s1"] .ind-dot');
    await expect(dot).toBeAttached();

    const bgColor = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgColor).toBeTruthy();
    expect(bgColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(bgColor).not.toBe("transparent");
  });

  test("completed 状态指示灯颜色不同于 running", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "A", "running"),
      makeSession("s2", "B", "completed"),
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

  test("completed 与 running 都有非透明颜色", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "A", "running"),
      makeSession("s2", "B", "completed"),
    ] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    for (const id of ["s1", "s2"]) {
      const dot = page.locator(`[data-session-id="${id}"] .ind-dot`);
      await expect(dot).toBeAttached();
      const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe("rgba(0, 0, 0, 0)");
      expect(bg).not.toBe("transparent");
    }
  });

  test("data-phase 属性与 session state 一致", async ({ page }) => {
    // 使用 running 和 completed（idle 默认折叠不可见）
    const states = ["running", "completed"];
    const sessions = states.map((state, i) => makeSession(`s${i}`, `Proj ${state}`, state));
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    for (let i = 0; i < states.length; i++) {
      const row = page.locator(`[data-session-id="s${i}"]`);
      await expect(row).toBeAttached();
      const phase = await row.getAttribute("data-phase");
      expect(phase).toBe(states[i]);
    }
  });
});

test.describe("StatusDot — 尺寸一致性", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("所有状态的指示灯尺寸一致", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "A", "running"),
      makeSession("s2", "B", "completed"),
    ] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const sizes: Array<{ w: number; h: number }> = [];
    for (const id of ["s1", "s2"]) {
      const rect = await client.getElementRect(
        `[data-session-id="${id}"] .ind-dot`
      );
      expect(rect).not.toBeNull();
      sizes.push({ w: rect!.width, h: rect!.height });
    }

    // 所有指示灯尺寸应一致（dot 模式下是固定大小）
    expect(sizes[0].w).toBe(sizes[1].w);
    expect(sizes[0].h).toBe(sizes[1].h);
  });

  test("指示灯是正方形（宽高相等）", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const rect = await client.getElementRect('[data-session-id="s1"] .ind-dot');
    expect(rect).not.toBeNull();
    // dot 模式下是圆形，宽高应相等
    expect(Math.abs(rect!.width - rect!.height)).toBeLessThan(2);
  });
});
