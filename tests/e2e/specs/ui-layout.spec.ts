import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * UI Layout Tests — 尺寸、位置、间距
 *
 * 注意：所有 sessions 使用 running/completed/idle 状态，
 * 不允许 waitingForApproval/waitingForAnswer（会触发审批专注模式）。
 */

const LAYOUT_SESSIONS = [
  { id: "s1", label: "win-vibe-island", cwd: "C:\\Projects\\win-vibe-island", state: "running", createdAt: Date.now() - 120000, lastActivity: Date.now() - 5000, agent: "claude", pid: 1234, currentTool: { name: "Edit", input: { file_path: "Overlay.tsx" }, startTime: Date.now() - 10000 }, toolHistory: [], jumpTarget: { terminalType: "vscode" } },
  { id: "s2", label: "api-server", cwd: "C:\\Projects\\api-server", state: "running", createdAt: Date.now() - 60000, lastActivity: Date.now() - 2000, agent: "codex", toolHistory: [] },
  { id: "s3", label: "ml-pipeline", cwd: "C:\\Projects\\ml-pipeline", state: "completed", createdAt: Date.now() - 3600000, lastActivity: Date.now() - 600000, agent: "codex", pid: 9012, toolHistory: [] },
  { id: "s4", label: "frontend", cwd: "C:\\Projects\\frontend", state: "running", createdAt: Date.now() - 180000, lastActivity: Date.now() - 1000, agent: "cursor", toolHistory: [] },
  { id: "s5", label: "db-migration", cwd: "C:\\Projects\\db-migration", state: "running", createdAt: Date.now() - 300000, lastActivity: Date.now() - 120000, agent: "gemini", pid: 3456, toolHistory: [] },
  { id: "s6", label: "docs", cwd: "C:\\Projects\\docs", state: "running", createdAt: Date.now() - 90000, lastActivity: Date.now() - 8000, agent: "opencode", pid: 7890, currentTool: { name: "Grep", input: { pattern: "TODO" }, startTime: Date.now() - 8000 }, toolHistory: [] },
  { id: "s7", label: "tests", cwd: "C:\\Projects\\tests", state: "completed", createdAt: Date.now() - 7200000, lastActivity: Date.now() - 3600000, agent: "kimi", toolHistory: [], jumpTarget: { terminalType: "windowsTerminal" } },
];

test.describe("UI Layout — 基础尺寸", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("空状态显示 \"No active sessions\"", async ({ page }) => {
    // 需展开 bar 以看到空状态
    await client.clickBar();
    await page.waitForTimeout(500);

    const titles = await client.getTextContents(".oi-empty__title");
    expect(titles).toContain("No active sessions");

    // 空状态 SVG 图标存在
    const icons = await client.getElementCount(".oi-empty svg");
    expect(icons).toBeGreaterThanOrEqual(1);
  });

  test("5 个 session 的行数 == 5", async ({ page }) => {
    await client.setSessions(LAYOUT_SESSIONS.slice(0, 5) as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const rows = await client.getElementCount("[data-testid='session-row']");
    expect(rows).toBe(5);
  });

  test("7 个 session 列出全部 7 行", async ({ page }) => {
    await client.setSessions(LAYOUT_SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const rows = await client.getElementCount("[data-testid='session-row']");
    expect(rows).toBe(7);
  });

  test("session 行含有完整的信息组件", async ({ page }) => {
    await client.setSessions([LAYOUT_SESSIONS[0]] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // 行内子元素存在
    await expect(page.getByTestId("row-indicator")).toBeAttached();
    await expect(page.getByTestId("row-content")).toBeAttached();
    await expect(page.getByTestId("agent-chip")).toBeAttached();
    await expect(page.getByTestId("terminal-badge")).toBeAttached();
    await expect(page.getByTestId("row-age")).toBeAttached();
    await expect(page.getByTestId("row-chevron")).toBeAttached();

    // 行 body 可点击
    await expect(page.locator(".session-row__body")).toBeAttached();
  });

  test("agent chip 显示 cli 名称", async ({ page }) => {
    await client.setSessions([LAYOUT_SESSIONS[0]] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const chips = await client.getTextContents("[data-testid='agent-chip']");
    expect(chips[0].length).toBeGreaterThan(0);
  });

  test("terminal badge 显示终端类型", async ({ page }) => {
    await client.setSessions([LAYOUT_SESSIONS[0]] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const badges = await client.getTextContents("[data-testid='terminal-badge']");
    expect(badges[0]).toBe("vscode");
  });
});

test.describe("UI Layout — 分组组头", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.setSessions(LAYOUT_SESSIONS as any);
    await client.clickBar();
    await page.waitForTimeout(500);
  });

  test("state 分组：组头 >= 2 个", async ({ page }) => {
    // 默认 groupBy = state，有 In progress + Just done 组
    const headers = await client.getElementCount("[data-testid='group-header']");
    expect(headers).toBeGreaterThanOrEqual(2);
  });

  test("组头含 label + count + dot", async ({ page }) => {
    const labels = await client.getTextContents(".oi-prio-head__label");
    expect(labels.length).toBeGreaterThanOrEqual(1);

    const dots = await client.getElementCount(".oi-prio-head__dot");
    const counts = await client.getElementCount(".oi-prio-head__count");
    expect(dots).toBeGreaterThanOrEqual(1);
    expect(counts).toBeGreaterThanOrEqual(1);
  });

  test("state 分组：In progress 组存在", async ({ page }) => {
    const labels = await client.getTextContents(".oi-prio-head__label");
    expect(labels).toContain("In progress");
  });

  test("切换 groupBy=agent 后组头变化", async ({ page }) => {
    await client.selectGroupBy("agent");
    await page.waitForTimeout(200);

    const agentHeaders = await client.getElementCount("[data-testid='group-header']");
    expect(agentHeaders).toBeGreaterThanOrEqual(4);
  });

  test("切换 groupBy=project 后按项目名分组", async ({ page }) => {
    await client.selectGroupBy("project");
    await page.waitForTimeout(200);

    const labels = await client.getTextContents(".oi-grp-head__label");
    expect(labels).toContain("win-vibe-island");
    expect(labels).toContain("api-server");
  });

  test("切换 groupBy=none 无组头", async ({ page }) => {
    await client.selectGroupBy("none");
    await page.waitForTimeout(200);

    const headers = await client.getElementCount("[data-testid='group-header']");
    expect(headers).toBe(0);
  });
});

test.describe("UI Layout — SessionRow 密度模式", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.setSessions([LAYOUT_SESSIONS[0], LAYOUT_SESSIONS[1]] as any);
    await client.clickBar();
    await page.waitForTimeout(500);
  });

  test("comfortable 模式下 terminal badge 可见", async ({ page }) => {
    const terminalBadges = await client.getElementCount("[data-testid='terminal-badge']");
    expect(terminalBadges).toBeGreaterThan(0);
  });

  test("compact 模式下 (已知未连线到 SessionRow — 占位)", async ({ page }) => {
    // density 配置暂未透传到 SessionRow props，这是 app 已知限制
    // 此测试作为 future work 的占位
  });
});

test.describe("UI Layout — Panel Head & Foot", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.setSessions(LAYOUT_SESSIONS.slice(0, 3) as any);
    await client.clickBar();
    await page.waitForTimeout(500);
  });

  test("PanelHead 显示 session 数量", async ({ page }) => {
    const headText = await client.getTextContents("[data-testid='panel-head']");
    const allText = headText.join(" ");
    expect(allText).toContain("Sessions");
  });

  test("PanelFoot 显示 session 数量", async ({ page }) => {
    const footText = await client.getTextContents("[data-testid='panel-foot']");
    const allText = footText.join(" ");
    expect(allText).toContain("3 session");
  });
});

test.describe("UI Layout — 审批专注模式", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("审批 arrive 时 overlay 展开并显示审批上下文", async ({ page }) => {
    await client.simulateSessionStart("approval-test", "Test Project");
    await client.simulatePermissionRequest({
      sessionId: "approval-test",
      toolUseId: "tool-123",
      toolName: "Bash",
      action: "Execute: npm test",
      riskLevel: "medium",
    });
    await page.waitForTimeout(500);

    await expect(page.getByTestId("approval-focus")).toBeVisible();
    await expect(page.getByTestId("approval-context")).toBeVisible();

    const ctxText = await client.getTextContents("[data-testid='approval-context']");
    expect(ctxText.join(" ")).toContain("Test Project");
  });

  test("审批专注模式显示审批队列导航", async ({ page }) => {
    await client.simulateSessionStart("s1", "Project A");
    await client.simulateSessionStart("s2", "Project B");

    await page.evaluate(() => {
      const b = window.__VIBE_TEST_BRIDGE__!;
      b.simulateEvent("permission_request", { session_id: "s1", tool_use_id: "t1", tool_name: "Bash", action: "rm -rf /", risk_level: "high", approval_type: "permission" });
      b.simulateEvent("permission_request", { session_id: "s2", tool_use_id: "t2", tool_name: "Write", action: "Write file: test.ts", risk_level: "medium", approval_type: "permission" });
    });
    await page.waitForTimeout(500);

    const navCounter = await client.getTextContents(".approval-queue-nav__counter");
    expect(navCounter.join("")).toContain("1");

    const navBtns = await client.getElementCount(".approval-queue-nav__btn");
    expect(navBtns).toBe(2);
  });

  test("审批处理后 overlay 自动折叠", async ({ page }) => {
    await client.simulateSessionStart("s1", "Project");
    await client.simulatePermissionRequest({
      sessionId: "s1", toolUseId: "t1", toolName: "Bash",
      action: "ls", riskLevel: "low",
    });
    await page.waitForTimeout(300);

    await page.getByTestId("approve-btn").click();
    await page.waitForTimeout(500);

    const expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(0);
  });
});
