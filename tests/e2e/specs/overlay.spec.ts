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

    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("shows session after simulate_session_start", async ({ page }) => {
    await client.simulateSessionStart("test-1", "Test Project");

    const sessions = await client.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].label).toBe("Test Project");

    await expect(page.getByTestId("session-label")).toHaveText("Test Project");
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
    await client.simulateStateChange("test-1", "thinking");

    const sessions = await client.getSessions();
    expect(sessions[0].state).toBe("thinking");

    await expect(page.getByTestId("session-state")).toHaveText("thinking");
  });
});
