import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * Overlay 尺寸与圆角测试
 *
 * 覆盖：紧凑态/展开态的 overlay shell 尺寸、圆角值、bar 高度、
 * 动画过渡后的最终状态。
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

test.describe("Overlay Dimensions — 紧凑态", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("初始状态是 compact（未展开）", async ({ page }) => {
    const expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(0);
  });

  test("bar 高度约 32px (允许 DPI 缩放偏差)", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const bar = page.locator(".overlay__bar");
    const rect = await bar.boundingBox();
    expect(rect).not.toBeNull();
    // DPI 缩放可能导致亚像素偏差
    expect(rect!.height).toBeGreaterThan(28);
    expect(rect!.height).toBeLessThan(36);
  });

  test("compact 态 shell 有底部圆角", async ({ page }) => {
    const shell = page.locator(".overlay__shell");
    const borderRadius = await shell.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(borderRadius).toBeTruthy();
    // compact: border-radius: 0 0 16px 16px → 至少有一个非零值
    const values = borderRadius.split(/\s+/).map((v) => parseFloat(v));
    expect(values.some((v) => v > 0)).toBe(true);
  });

  test("compact 态 overlay 宽度合理", async ({ page }) => {
    const overlay = page.getByTestId("overlay");
    const rect = await overlay.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(0);
  });

  test("shell 有 contain: paint 用于圆角裁剪", async ({ page }) => {
    const shell = page.locator(".overlay__shell");
    const contain = await shell.evaluate((el) => getComputedStyle(el).contain);
    expect(contain).toContain("paint");
  });
});

test.describe("Overlay Dimensions — 展开态", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("点击 bar 后 overlay 展开", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(1);
  });

  test("展开态 shell 有 22px 圆角", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const shell = page.locator(".overlay__shell");
    const borderRadius = await shell.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(borderRadius).toBeTruthy();
    // expanded: border-radius: 22px → 所有值应 >= 20
    const values = borderRadius.split(/\s+/).map((v) => parseFloat(v));
    expect(values.every((v) => v >= 20)).toBe(true);
  });

  test("展开态高度大于紧凑态", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);

    const overlay = page.getByTestId("overlay");
    const compactRect = await overlay.boundingBox();
    const compactHeight = compactRect!.height;

    await client.clickBar();
    await page.waitForTimeout(600);

    const expandedRect = await overlay.boundingBox();
    const expandedHeight = expandedRect!.height;

    expect(expandedHeight).toBeGreaterThan(compactHeight);
  });

  test("展开态 panel 存在且有高度", async ({ page }) => {
    await client.setSessions([
      makeSession("s1", "Proj A", "running"),
      makeSession("s2", "Proj B", "running"),
    ] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const panel = page.locator(".overlay__panel");
    await expect(panel).toBeAttached();

    const panelRect = await panel.boundingBox();
    expect(panelRect).not.toBeNull();
    expect(panelRect!.height).toBeGreaterThan(0);
  });

  test("展开态 bar 有顶部圆角", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Proj", "running")] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const bar = page.locator(".overlay__bar");
    const borderRadius = await bar.evaluate((el) => getComputedStyle(el).borderRadius);
    // expanded .overlay__bar: border-radius: 16px 16px 0 0
    const values = borderRadius.split(/\s+/).map((v) => parseFloat(v));
    expect(values[0]).toBeGreaterThan(0);
  });
});

test.describe("Overlay Dimensions — 审批展开", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("审批请求自动展开 overlay", async ({ page }) => {
    await client.simulateSessionStart("s1", "Approval Proj");
    await page.waitForTimeout(100);

    let expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(0);

    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t1",
      toolName: "Bash",
      action: "npm test",
      riskLevel: "medium",
    });
    await page.waitForTimeout(500);

    expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(1);
  });

  test("审批面板可见时 approval-panel 存在", async ({ page }) => {
    await client.simulateSessionStart("s1", "Proj");
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t1",
      toolName: "Bash",
      action: "ls",
    });
    await page.waitForTimeout(300);

    await expect(page.getByTestId("approval-panel")).toBeVisible();
  });

  test("审批处理后 overlay 折叠回 compact", async ({ page }) => {
    await client.simulateSessionStart("s1", "Proj");
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t1",
      toolName: "Bash",
      action: "ls",
    });
    await page.waitForTimeout(300);

    await page.getByTestId("approve-btn").click();
    await page.waitForTimeout(500);

    const expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(0);
  });

  test("审批展开高度大于普通展开", async ({ page }) => {
    await client.simulateSessionStart("s1", "Proj");

    // 普通展开
    await client.clickBar();
    await page.waitForTimeout(500);
    const normalRect = await page.getByTestId("overlay").boundingBox();
    const normalHeight = normalRect!.height;

    // 折叠
    await client.clickBar();
    await page.waitForTimeout(400);

    // 审批展开
    await client.simulatePermissionRequest({
      sessionId: "s1",
      toolUseId: "t1",
      toolName: "Bash",
      action: "npm test",
      riskLevel: "medium",
    });
    await page.waitForTimeout(500);

    const approvalRect = await page.getByTestId("overlay").boundingBox();
    const approvalHeight = approvalRect!.height;

    expect(approvalHeight).toBeGreaterThan(normalHeight);
  });
});
