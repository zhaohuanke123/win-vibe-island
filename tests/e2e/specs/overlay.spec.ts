import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

test.describe("Overlay", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("starts with no sessions", async ({ page }) => {
    const sessions = await client.getSessions();
    expect(sessions).toHaveLength(0);

    // Click bar to expand and see the empty state
    await client.clickBar();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("grouped-rows-empty")).toBeVisible();
  });

  test("shows session after simulate_session_start", async ({ page }) => {
    // Create a running session (not idle, not waitingForApproval)
    await client.simulateSessionStart("test-1", "Test Project");
    await client.simulateStateChange("test-1", "running");

    const sessions = await client.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].label).toBe("Test Project");

    // Click bar to expand
    await client.clickBar();
    await page.waitForTimeout(500);

    // Session should be in "In progress" group (not collapsed)
    const rows = await client.getElementCount("[data-testid='session-row']");
    expect(rows).toBe(1);

    // Row content contains the label
    const labels = await client.getTextContents("[data-testid='row-content']");
    expect(labels.some(l => l.includes("Test Project"))).toBe(true);
  });

  test("expands when approval request arrives", async ({ page }) => {
    await client.simulateSessionStart("test-1", "Test Project");
    await client.simulatePermissionRequest({
      sessionId: "test-1",
      toolUseId: "tool-123",
      toolName: "Bash",
      action: "Execute: npm test",
      riskLevel: "medium",
    });

    const approval = await client.getApprovalRequest();
    expect(approval).not.toBeNull();
    expect(approval.toolUseId).toBe("tool-123");

    // Approval auto-expands overlay
    await expect(page.getByTestId("approval-panel")).toBeVisible();
    await expect(page.getByTestId("risk-level")).toContainText("MEDIUM");
  });

  test("collapses after approval rejected", async ({ page }) => {
    await client.simulateSessionStart("test-1", "Test Project");
    await client.simulatePermissionRequest({
      sessionId: "test-1",
      toolUseId: "tool-456",
      toolName: "Bash",
      action: "npm test",
    });

    await expect(page.getByTestId("reject-btn")).toBeVisible();
    await page.getByTestId("reject-btn").click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });

  test("removes session after simulate_session_end", async ({ page }) => {
    await client.simulateSessionStart("test-1", "Test Project");
    const sessions = await client.getSessions();
    expect(sessions).toHaveLength(1);

    await client.simulateSessionEnd("test-1");
    const sessionsAfter = await client.getSessions();
    expect(sessionsAfter).toHaveLength(0);
  });

  test("updates session state after simulate_state_change", async ({ page }) => {
    await client.simulateSessionStart("test-1", "Test Project");
    await client.simulateStateChange("test-1", "running");

    const sessions = await client.getSessions();
    expect(sessions[0].state).toBe("running");

    // Click bar to expand and verify the phase is shown
    await client.clickBar();
    await page.waitForTimeout(500);

    // Session row has data-phase attribute
    const phaseEl = page.locator('[data-session-id="test-1"]');
    await expect(phaseEl).toBeAttached({ timeout: 3000 });
    const phase = await phaseEl.getAttribute("data-phase");
    expect(phase).toBe("running");
  });
});
