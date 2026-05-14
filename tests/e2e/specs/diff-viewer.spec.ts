import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

const DIFF_SMALL = {
  fileName: "src/utils.ts",
  oldContent: "line 1: unchanged\nline 2: unchanged\nline 3: unchanged\nline 4: unchanged\nline 5: unchanged\n",
  newContent: "line 1: unchanged\nline 2: CHANGED\nline 3: unchanged\nline 4: unchanged\nline 5: unchanged\n",
};

const DIFF_LARGE = (() => {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  for (let i = 1; i <= 80; i++) {
    oldLines.push(`line ${i}: const value_${i} = ${i};`);
    newLines.push(`line ${i}: const value_${i} = ${i}_updated;`);
  }
  return {
    fileName: "src/large-file.ts",
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
})();

test.describe("DiffViewer", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.simulateSessionStart("diff-test", "Test Project");
  });

  test("shows diff viewer for small diff — no parent scroll needed", async ({ page }) => {
    await page.evaluate(
      ({ event, payload }) =>
        (window as any).__VIBE_TEST_BRIDGE__!.simulateEvent(event, payload),
      {
        event: "permission_request",
        payload: {
          session_id: "diff-test",
          tool_use_id: "tool-diff-1",
          tool_name: "Edit",
          action: "Modify src/utils.ts",
          risk_level: "medium",
          approval_type: "permission",
          diff: DIFF_SMALL,
        },
      }
    );

    // Wait for approval panel + diff viewer to render
    await page.waitForTimeout(500);

    // Diff viewer should be visible
    const diffViewer = page.locator(".diff-viewer");
    await expect(diffViewer).toBeVisible();

    // File name should be shown
    await expect(diffViewer).toContainText("src/utils.ts");

    // Content should include the changed line
    await expect(diffViewer).toContainText("CHANGED");

    // For small diff, the approval panel body should NOT need scrolling
    // (content fits within the panel)
    const body = page.locator(".approval-panel__body");
    const scrollHeight = await body.evaluate((el: HTMLElement) => el.scrollHeight);
    const clientHeight = await body.evaluate((el: HTMLElement) => el.clientHeight);
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 50); // small diff fits
  });

  test("shows diff viewer for large diff — parent scrolls when content overflows", async ({ page }) => {
    await page.evaluate(
      ({ event, payload }) =>
        (window as any).__VIBE_TEST_BRIDGE__!.simulateEvent(event, payload),
      {
        event: "permission_request",
        payload: {
          session_id: "diff-test",
          tool_use_id: "tool-diff-2",
          tool_name: "Edit",
          action: "Modify src/large-file.ts",
          risk_level: "medium",
          approval_type: "permission",
          diff: DIFF_LARGE,
        },
      }
    );

    await page.waitForTimeout(500);

    // Diff viewer should be visible
    const diffViewer = page.locator(".diff-viewer");
    await expect(diffViewer).toBeVisible();

    // All 80 lines of changes should be rendered
    await expect(diffViewer).toContainText("line 80:");

    // The diff viewer itself should NOT have its own scroll (height is unconstrained)
    const viewerScrollHeight = await diffViewer.evaluate((el: HTMLElement) => el.scrollHeight);
    const viewerClientHeight = await diffViewer.evaluate((el: HTMLElement) => el.clientHeight);
    // Without max-height: the two are equal (no internal scrollbar)
    expect(viewerScrollHeight).toBe(viewerClientHeight);

    // The parent (approval panel body) should be the one scrolling
    const body = page.locator(".approval-panel__body");
    const bodyScrollHeight = await body.evaluate((el: HTMLElement) => el.scrollHeight);
    const bodyClientHeight = await body.evaluate((el: HTMLElement) => el.clientHeight);
    expect(bodyScrollHeight).toBeGreaterThan(bodyClientHeight);
  });

  test("does NOT render diff viewer when no diff data in permission request", async ({ page }) => {
    // Send a permission request without diff field
    await client.simulatePermissionRequest({
      sessionId: "diff-test",
      toolUseId: "tool-diff-3",
      toolName: "Bash",
      action: "Execute: npm test",
    });

    await page.waitForTimeout(500);

    // Approval panel should be visible
    await expect(page.getByTestId("approval-panel")).toBeVisible();

    // Diff viewer should NOT be present
    const diffViewer = page.locator(".diff-viewer");
    await expect(diffViewer).toHaveCount(0);
  });
});
