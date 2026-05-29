import { test } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

function makeSession(id: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label,
    cwd: "C:\\Projects\\" + label.toLowerCase().replace(/\s+/g, "-"),
    state: "running",
    createdAt: Date.now() - 120000,
    lastActivity: Date.now() - 5000,
    agent: "claude",
    toolHistory: [],
    ...overrides,
  };
}

// NOTE: s3 uses waitingForApproval, which auto-expands the overlay into
// approval-focus mode.  In that mode, clicking the status-bar toggles
// (collapses) the overlay instead of expanding it, so we must NOT call
// clickBar() — the panel with .oi-select is already visible.

const FIVE_SESSIONS = [
  makeSession("s1", "Alpha", { state: "running", agent: "claude" }),
  makeSession("s2", "Beta", { state: "running", agent: "codex" }),
  makeSession("s3", "Gamma", { state: "waitingForApproval", agent: "cursor" }),
  makeSession("s4", "Delta", { state: "completed", agent: "gemini" }),
  makeSession("s5", "Epsilon", { state: "idle", agent: "opencode" }),
];

const TEN_SESSIONS = [
  makeSession("t1", "Frontend Refactor", { state: "running", agent: "claude" }),
  makeSession("t2", "API Gateway", { state: "running", agent: "codex" }),
  makeSession("t3", "Auth Service", { state: "waitingForApproval", agent: "cursor" }),
  makeSession("t4", "Database Migration", { state: "completed", agent: "gemini" }),
  makeSession("t5", "CI Pipeline", { state: "idle", agent: "opencode" }),
  makeSession("t6", "Logging Infra", { state: "running", agent: "claude" }),
  makeSession("t7", "Cache Layer", { state: "waitingForApproval", agent: "codex" }),
  makeSession("t8", "Search Engine", { state: "completed", agent: "cursor" }),
  makeSession("t9", "Notification Svc", { state: "idle", agent: "gemini" }),
  makeSession("t10", "Docs Update", { state: "running", agent: "opencode" }),
];

test.describe("screenshot-multi", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    await page.waitForTimeout(700);
    client = new VibeTestClient(page);
    await client.resetAll();
    await page.waitForTimeout(300);
  });

  test("multi-5sessions-flat", async ({ page }) => {
    await client.setSessions(FIVE_SESSIONS as any);
    await page.waitForTimeout(500);
    // waitingForApproval auto-expands; no clickBar needed
    await page.waitForTimeout(700);
    await page.screenshot({
      path: "test-results/screenshots/multi-5sessions-flat.png",
    });
  });

  test("multi-group-by-state", async ({ page }) => {
    await client.setSessions(FIVE_SESSIONS as any);
    await page.waitForTimeout(500);
    await client.selectGroupBy("state");
    await page.waitForTimeout(700);
    await page.screenshot({
      path: "test-results/screenshots/multi-group-by-state.png",
    });
  });

  test("multi-group-by-agent", async ({ page }) => {
    await client.setSessions(FIVE_SESSIONS as any);
    await page.waitForTimeout(500);
    await client.selectGroupBy("agent");
    await page.waitForTimeout(700);
    await page.screenshot({
      path: "test-results/screenshots/multi-group-by-agent.png",
    });
  });

  test("multi-group-by-project", async ({ page }) => {
    await client.setSessions(FIVE_SESSIONS as any);
    await page.waitForTimeout(500);
    await client.selectGroupBy("project");
    await page.waitForTimeout(700);
    await page.screenshot({
      path: "test-results/screenshots/multi-group-by-project.png",
    });
  });

  test("multi-10-sessions", async ({ page }) => {
    await client.setSessions(TEN_SESSIONS as any);
    await page.waitForTimeout(500);
    // waitingForApproval auto-expands; no clickBar needed
    await page.waitForTimeout(700);
    await page.screenshot({
      path: "test-results/screenshots/multi-10-sessions.png",
    });
  });
});
