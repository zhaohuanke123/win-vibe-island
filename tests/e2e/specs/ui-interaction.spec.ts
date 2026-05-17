import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * UI Interaction Tests
 *
 * 覆盖：bar 点击展开/折叠、row body=jump、chevron=expand detail、
 * group header 折叠/展开、审批导航 ‹/›、density/groupBy/sortBy 切换。
 *
 * 注意：waitingForApproval/waitingForAnswer 状态会触发审批专注模式，
 * 导致 bar 点击切换专注而非展开列表。需要 approval 的测试独立分组。
 */

/* ─── Running-state sessions for bar-interaction tests ─── */
const MOCK_RUNNING = [
  { id: "s1", label: "Project Alpha", cwd: "C:\\Projects\\alpha", state: "running", createdAt: Date.now() - 120000, lastActivity: Date.now() - 5000, agent: "claude", pid: 1234, currentTool: { name: "Edit", input: { file_path: "main.ts" }, startTime: Date.now() - 10000 }, toolHistory: [], jumpTarget: { terminalType: "vscode" } },
  { id: "s2", label: "Project Beta", cwd: "C:\\Projects\\beta", state: "running", createdAt: Date.now() - 60000, lastActivity: Date.now() - 2000, agent: "codex", toolHistory: [] },
  { id: "s3", label: "Project Gamma", cwd: "C:\\Projects\\gamma", state: "completed", createdAt: Date.now() - 3600000, lastActivity: Date.now() - 600000, agent: "cursor", pid: 9012, toolHistory: [] },
];

test.describe("Interaction — Bar 点击展开/折叠", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("点击 bar → 展开 session 列表", async ({ page }) => {
    await client.setSessions(MOCK_RUNNING as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // panel-head 渲染
    const headText = await client.getTextContents("[data-testid='panel-head']");
    expect(headText.join(" ")).toContain("Sessions");

    const rows = await client.getElementCount("[data-testid='session-row']");
    expect(rows).toBeGreaterThan(0);
  });

  test("再次点击 bar → 折叠", async ({ page }) => {
    await client.setSessions(MOCK_RUNNING as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    await client.clickBar();
    await page.waitForTimeout(400);

    const expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(0);
  });

  test("bar 的 NotchRow 显示 BarsGlyph", async ({ page }) => {
    await client.setSessions(MOCK_RUNNING as any);
    await expect(page.getByTestId("notch-row")).toBeAttached();
    const glyphs = await client.getElementCount(".bars-glyph");
    expect(glyphs).toBeGreaterThan(0);
  });
});

test.describe("Interaction — SessionRow 空间拆分", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.setSessions(MOCK_RUNNING as any);
    await client.clickBar();
    await page.waitForTimeout(500);
  });

  test("chevron 渲染存在且有正确的 aria 属性", async ({ page }) => {
    // 验证 chevron button，用 first() 避免严格模式（有 3 个 session）
    const chevron = page.getByTestId("row-chevron").first();
    await expect(chevron).toBeAttached();

    // 非 stale session 默认 aria-expanded=true
    const ariaExpanded = await chevron.getAttribute("aria-expanded");
    expect(ariaExpanded).toBe("true");
  });

  test("默认 detail 展开（running）和 collapsed（completed stale）", async ({ page }) => {
    // running 非 stale → 默认展开; completed 且 stale → 默认折叠
    const details = await client.getElementCount("[data-testid='row-detail']");
    // 2 个 running session 展开, s3(completed stale) 折叠 → 2 个 detail
    expect(details).toBe(2);
  });

  test("chevron 通过 click() 切换展开状态", async ({ page }) => {
    // 先确认有 2 个 detail（s1, s2 展开, s3 折叠）
    expect(await client.getElementCount("[data-testid='row-detail']")).toBe(2);

    // 点击 s1 的 chevron（第一个）→ s1 折叠 → 剩 1 个
    await page.evaluate(() => {
      const btns = document.querySelectorAll("[data-testid='row-chevron']");
      if (btns[0]) (btns[0] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    expect(await client.getElementCount("[data-testid='row-detail']")).toBe(1);

    // 再点 s1 → 恢复展开 → 2 个
    await page.evaluate(() => {
      const btns = document.querySelectorAll("[data-testid='row-chevron']");
      if (btns[0]) (btns[0] as HTMLElement).click();
    });
    await page.waitForTimeout(300);
    expect(await client.getElementCount("[data-testid='row-detail']")).toBe(2);
  });

  test("不同 state 的 detail 内容不同", async ({ page }) => {
    // s3 = completed → chevron → "Completed"
    await client.clickChevron("s3");
    await page.waitForTimeout(200);
    const s3Detail = await client.getTextContents("[data-session-id='s3'] [data-testid='row-detail']");
    expect(s3Detail.join(" ")).toContain("Completed");
  });

  test("行体点击 → JumpToast 出现", async ({ page }) => {
    // s1 有 pid + jumpTarget → 点击行体触发 focus + toast
    await page.locator('[data-session-id="s1"] .session-row__body').click();
    await page.waitForTimeout(200);

    // 检查 bridge 中 session 是否为 active
    const activeId = await page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getActiveSessionId());
    expect(activeId).toBe("s1");
  });
});

test.describe("Interaction — Group Header 折叠/展开", () => {
  let client: VibeTestClient;
  const MOCK_STATE_GROUP = [
    { id: "s1", label: "Running", cwd: "C:\\Proj\\r", state: "running", createdAt: Date.now() - 1000, lastActivity: Date.now(), agent: "claude", toolHistory: [] },
    { id: "s2", label: "Completed", cwd: "C:\\Proj\\c", state: "completed", createdAt: Date.now() - 2000, lastActivity: Date.now() - 100, agent: "codex", toolHistory: [] },
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.setSessions(MOCK_STATE_GROUP as any);
    await client.clickBar();
    await page.waitForTimeout(500);
  });

  test("点击组头 → 折叠组内 session 行", async ({ page }) => {
    // "In progress" 组应有 1 个 session
    const itemsBefore = await client.getElementCount("[data-testid='session-row']");
    expect(itemsBefore).toBeGreaterThan(0);

    // 点击 "In progress" 组头
    await client.clickGroupHeader("In progress");
    await page.waitForTimeout(200);

    // items 应减少
    const itemsAfter = await client.getElementCount("[data-testid='session-row']");
    expect(itemsAfter).toBeLessThan(itemsBefore);
  });

  test("再次点击组头 → 展开", async ({ page }) => {
    await client.clickGroupHeader("In progress");
    await page.waitForTimeout(200);
    const collapsed = await client.getElementCount("[data-testid='session-row']");

    await client.clickGroupHeader("In progress");
    await page.waitForTimeout(200);
    const expanded = await client.getElementCount("[data-testid='session-row']");

    expect(expanded).toBeGreaterThan(collapsed);
  });
});

test.describe("Interaction — 审批操作流程", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.simulateSessionStart("s1", "Project A");
  });

  test("approve 按钮存在且可点击", async ({ page }) => {
    await client.simulatePermissionRequest({
      sessionId: "s1", toolUseId: "t1", toolName: "Bash",
      action: "Execute: ls", riskLevel: "low",
    });
    await page.waitForTimeout(300);

    await expect(page.getByTestId("approve-btn")).toBeVisible();
    await expect(page.getByTestId("reject-btn")).toBeVisible();

    // 点击 approve → 审批队列清空
    await page.getByTestId("approve-btn").click();
    await page.waitForTimeout(300);
    const approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(0);
  });

  test("reject 按钮可点击且清空审批", async ({ page }) => {
    await client.simulatePermissionRequest({
      sessionId: "s1", toolUseId: "t1", toolName: "Bash",
      action: "Execute: ls", riskLevel: "low",
    });
    await page.waitForTimeout(300);

    await page.getByTestId("reject-btn").click();
    await page.waitForTimeout(300);
    const approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(0);
  });

  test("审批导航：多个审批可切换", async ({ page }) => {
    await client.simulateSessionStart("s2", "Project B");
    await page.waitForTimeout(50);

    // 添加 2 个审批
    await page.evaluate(() => {
      const b = window.__VIBE_TEST_BRIDGE__!;
      b.simulateEvent("permission_request", {
        session_id: "s1", tool_use_id: "t1", tool_name: "Bash",
        action: "rm -rf", risk_level: "high", approval_type: "permission",
      });
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const b = window.__VIBE_TEST_BRIDGE__!;
      b.simulateEvent("permission_request", {
        session_id: "s2", tool_use_id: "t2", tool_name: "Write",
        action: "Write: test.ts", risk_level: "medium", approval_type: "permission",
      });
    });
    await page.waitForTimeout(300);

    // 队列导航显示
    await expect(page.locator(".approval-queue-nav")).toBeVisible();
    const counter = await client.getTextContents(".approval-queue-nav__counter");
    expect(counter.join("")).toContain("1");

    // 点击下一个 ›
    await page.locator(".approval-queue-nav__btn").last().click();
    await page.waitForTimeout(200);
    const counter2 = await client.getTextContents(".approval-queue-nav__counter");
    expect(counter2.join("")).toContain("2");
  });
});

test.describe("Interaction — GroupBy/SortBy 切换", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.setSessions(MOCK_RUNNING as any);
    await client.clickBar();
    await page.waitForTimeout(500);
  });

  test("groupBy select 存在且有 4 个选项", async ({ page }) => {
    const groupSelect = page.locator(".oi-select").first();
    await expect(groupSelect).toBeAttached();

    const options = await groupSelect.locator("option").allTextContents();
    expect(options).toEqual(["Group: State", "Group: Agent", "Group: Project", "No Group"]);
  });

  test("sortBy select 存在且有 2 个选项", async ({ page }) => {
    const sortSelect = page.locator(".oi-select").nth(1);
    await expect(sortSelect).toBeAttached();

    const options = await sortSelect.locator("option").allTextContents();
    expect(options).toEqual(["By Attention", "By Recent"]);
  });
});
