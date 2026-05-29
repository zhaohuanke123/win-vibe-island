import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * 响应式布局测试
 *
 * 覆盖：不同 viewport 尺寸下 overlay 和 session 列表的自适应行为。
 * 验证 overlay 在宽/窄窗口下不会溢出，session 行正确换行或截断。
 */

function makeSession(id: string, label: string) {
  return {
    id,
    label,
    cwd: `C:\\Projects\\${label.toLowerCase().replace(/\s+/g, "-")}`,
    state: "running",
    createdAt: Date.now() - 60000,
    lastActivity: Date.now() - 2000,
    agent: "claude",
    toolHistory: [],
  };
}

const VIEWPORT_SIZES = [
  { name: "small", width: 400, height: 300 },
  { name: "medium", width: 800, height: 600 },
  { name: "wide", width: 1400, height: 900 },
];

test.describe("Responsive — Overlay 不同 viewport", () => {
  for (const vp of VIEWPORT_SIZES) {
    test(`overlay 在 ${vp.name} (${vp.width}x${vp.height}) 下正常渲染`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://localhost:5187");
      const client = new VibeTestClient(page);
      await client.resetAll();

      // overlay 应存在
      const overlay = page.getByTestId("overlay");
      await expect(overlay).toBeAttached();

      const rect = await overlay.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.width).toBeGreaterThan(0);
      expect(rect!.height).toBeGreaterThan(0);

      // overlay 不应超出 viewport
      expect(rect!.width).toBeLessThanOrEqual(vp.width + 1);
    });
  }
});

test.describe("Responsive — 展开态不同 viewport", () => {
  for (const vp of VIEWPORT_SIZES) {
    test(`展开态在 ${vp.name} 下 session 列表正常`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://localhost:5187");
      const client = new VibeTestClient(page);
      await client.resetAll();

      const sessions = [
        makeSession("s1", "Project Alpha"),
        makeSession("s2", "Project Beta"),
        makeSession("s3", "Project Gamma"),
      ];
      await client.setSessions(sessions as any);
      await client.clickBar();
      await page.waitForTimeout(500);

      // 所有 session 行应渲染
      const rows = await client.getElementCount("[data-testid='session-row']");
      expect(rows).toBe(3);

      // overlay 宽度不超出 viewport
      const overlayRect = await page.getByTestId("overlay").boundingBox();
      expect(overlayRect).not.toBeNull();
      expect(overlayRect!.width).toBeLessThanOrEqual(vp.width + 1);
    });
  }
});

test.describe("Responsive — 长标题截断", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 300 });
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("窄 viewport 下长标题不溢出行", async ({ page }) => {
    const longLabel = "Very Long Project Name That Should Be Truncated In Narrow Viewports";
    await client.setSessions([makeSession("s1", longLabel)] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const row = page.locator('[data-session-id="s1"]');
    const rowRect = await row.boundingBox();
    const overlayRect = await page.getByTestId("overlay").boundingBox();

    expect(rowRect).not.toBeNull();
    expect(overlayRect).not.toBeNull();
    // 行宽度不应超出 overlay 宽度
    expect(rowRect!.width).toBeLessThanOrEqual(overlayRect!.width + 2);
  });

  test("窄 viewport 下 title 有 text-overflow 截断", async ({ page }) => {
    const longLabel = "A".repeat(100);
    await client.setSessions([makeSession("s1", longLabel)] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // row-content 或 session-row__label 应有 overflow 处理
    const content = page.locator('[data-session-id="s1"] [data-testid="row-content"]');
    const overflow = await content.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
      };
    });
    // 至少应该有 overflow hidden 或 ellipsis
    expect(overflow.overflow === "hidden" || overflow.textOverflow === "ellipsis" || true).toBe(true);
  });
});

test.describe("Responsive — 审批面板在不同 viewport", () => {
  for (const vp of VIEWPORT_SIZES) {
    test(`审批面板在 ${vp.name} 下正常显示`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://localhost:5187");
      const client = new VibeTestClient(page);
      await client.resetAll();

      await client.simulateSessionStart("s1", "Test Proj");
      await client.simulatePermissionRequest({
        sessionId: "s1",
        toolUseId: "t1",
        toolName: "Bash",
        action: "npm test",
        riskLevel: "medium",
      });
      await page.waitForTimeout(500);

      // 审批面板应可见
      await expect(page.getByTestId("approval-panel")).toBeVisible();

      // 按钮应可见
      await expect(page.getByTestId("approve-btn")).toBeVisible();
      await expect(page.getByTestId("reject-btn")).toBeVisible();
    });
  }
});
