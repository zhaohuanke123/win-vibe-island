import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * BarsGlyph 模式与动画测试
 *
 * 覆盖：idle/running/waiting/done 四种模式的 SVG 渲染、CSS class、
 * 动画属性、bar 数量和尺寸。
 * BarsGlyph 在 NotchRow bar 区域渲染（data-testid="notch-glyph"）。
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

test.describe("BarsGlyph — NotchRow bar 区域", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("bar 区域有 BarsGlyph (notch-glyph)", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const glyph = page.getByTestId("notch-glyph");
    await expect(glyph).toBeAttached();
  });

  test("BarsGlyph 尺寸约 24x24 (允许 DPI 缩放偏差)", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const glyph = page.getByTestId("notch-glyph");
    const rect = await glyph.boundingBox();
    expect(rect).not.toBeNull();
    // 允许 DPI 缩放导致的亚像素偏差
    expect(rect!.width).toBeGreaterThan(20);
    expect(rect!.width).toBeLessThan(28);
    expect(rect!.height).toBeGreaterThan(20);
    expect(rect!.height).toBeLessThan(28);
  });

  test("BarsGlyph 有正确的 CSS mode class", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const glyph = page.getByTestId("notch-glyph");
    const className = await glyph.getAttribute("class");
    expect(className).toContain("bars-glyph");
    expect(className).toMatch(/(idle|running|waiting|done)/);
  });
});

test.describe("BarsGlyph — SVG 结构", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("BarsGlyph 包含 3 个 bar rect 元素", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const bars = page.locator('[data-testid="notch-glyph"] rect.bar');
    const count = await bars.count();
    expect(count).toBe(3);
  });

  test("每个 bar 有正确的 class (bar-1, bar-2, bar-3)", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    for (const cls of ["bar-1", "bar-2", "bar-3"]) {
      const bar = page.locator(`[data-testid="notch-glyph"] rect.${cls}`);
      await expect(bar).toBeAttached();
    }
  });

  test("running 模式 bar 有 SMIL animate 元素", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const animates = page.locator('[data-testid="notch-glyph"] animate');
    const count = await animates.count();
    // 3 bars × 2 animate (y + height) = 6
    expect(count).toBe(6);
  });

  test("done 模式渲染 tick path 而非 bar", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "completed")] as any);

    const glyph = page.getByTestId("notch-glyph");
    const className = await glyph.getAttribute("class");
    expect(className).toContain("done");

    const tickPath = glyph.locator("path.tick-path");
    await expect(tickPath).toBeAttached();

    const bars = glyph.locator("rect.bar");
    const barCount = await bars.count();
    expect(barCount).toBe(0);
  });

  test("idle 模式 bar 无 SMIL animate", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "idle")] as any);

    const glyph = page.getByTestId("notch-glyph");
    const className = await glyph.getAttribute("class");
    expect(className).toContain("idle");

    // idle 模式无 SMIL animate
    const animates = glyph.locator("animate");
    const count = await animates.count();
    expect(count).toBe(0);

    // 但有 3 个 rect.bar
    const bars = glyph.locator("rect.bar");
    expect(await bars.count()).toBe(3);
  });
});

test.describe("BarsGlyph — animate 属性验证", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("running 模式 animate 有正确的 dur 和 repeatCount", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const firstAnimate = page.locator('[data-testid="notch-glyph"] animate').first();
    await expect(firstAnimate).toBeAttached();

    const dur = await firstAnimate.getAttribute("dur");
    const repeatCount = await firstAnimate.getAttribute("repeatCount");

    expect(dur).toBe("0.9s");
    expect(repeatCount).toBe("indefinite");
  });

  test("running 模式 bar 有 stagger begin 时间", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    // 每个 bar 的第一个 animate 有 begin 属性
    const begins: string[] = [];
    for (let i = 0; i < 3; i++) {
      const barAnimate = page.locator(`[data-testid="notch-glyph"] .bar-${i + 1} animate`).first();
      const begin = await barAnimate.getAttribute("begin");
      if (begin) begins.push(begin);
    }

    // bar-1 begin=0s, bar-2 begin=0.15s, bar-3 begin=0.30s
    expect(begins).toHaveLength(3);
    expect(parseFloat(begins[0])).toBe(0);
    expect(parseFloat(begins[1])).toBeCloseTo(0.15, 2);
    expect(parseFloat(begins[2])).toBeCloseTo(0.30, 2);
  });
});
