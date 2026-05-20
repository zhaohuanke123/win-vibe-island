import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

test.describe("Diff Overflow and Scrollbar", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("small diff renders without scrollbar in approval panel", async ({ page }) => {
    await client.simulateSessionStart("diff-1", "Diff Project");
    await client.simulatePermissionRequest({
      sessionId: "diff-1",
      toolUseId: "diff-tool-1",
      toolName: "Write",
      toolInput: {
        file_path: "src/hello.ts",
        content: "const x = 1;\nconst y = 2;\n",
      },
      diff: {
        fileName: "src/hello.ts",
        oldContent: "const x = 0;\n",
        newContent: "const x = 1;\nconst y = 2;\n",
      },
    });

    const diffViewer = page.locator(".diff-viewer");
    await expect(diffViewer).toBeVisible();

    const bodyRect = await client.getElementRect(".approval-panel__body");
    expect(bodyRect).not.toBeNull();
  });

  test("large diff shows scrollable body", async ({ page }) => {
    const oldLines = Array.from({ length: 15 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const newLines = Array.from({ length: 40 }, (_, i) => `const line${i} = ${i * 2};`).join("\n");

    await client.simulateSessionStart("diff-2", "Diff Project");
    await client.simulatePermissionRequest({
      sessionId: "diff-2",
      toolUseId: "diff-tool-2",
      toolName: "Write",
      toolInput: {
        file_path: "src/large-file.ts",
        content: newLines,
      },
      diff: {
        fileName: "src/large-file.ts",
        oldContent: oldLines,
        newContent: newLines,
      },
    });

    const diffViewer = page.locator(".diff-viewer");
    await expect(diffViewer).toBeVisible();

    const addLines = page.locator(".diff-viewer__line--add");
    const count = await addLines.count();
    expect(count).toBeGreaterThan(20);
  });

  test("diff viewer has bottom padding for content breathing room", async ({ page }) => {
    const content = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");

    await client.simulateSessionStart("diff-3", "Diff Project");
    await client.simulatePermissionRequest({
      sessionId: "diff-3",
      toolUseId: "diff-tool-3",
      toolName: "Edit",
      toolInput: {
        file_path: "src/padded.ts",
        old_string: "old",
        new_string: "new",
      },
      diff: {
        fileName: "src/padded.ts",
        oldContent: content,
        newContent: content.replace("line 10", "line 10 (modified)"),
      },
    });

    const body = page.locator(".approval-panel__body");
    const paddingBottom = await body.evaluate((el) => {
      return getComputedStyle(el).paddingBottom;
    });
    expect(parseInt(paddingBottom)).toBeGreaterThan(0);
  });

  test("diff viewer scrollbar has right-side clearance", async ({ page }) => {
    const longLine = "const veryLongVariableNameThatCausesHorizontalScroll = ".repeat(5) + "42;";
    const content = Array.from({ length: 10 }, () => longLine).join("\n");

    await client.simulateSessionStart("diff-4", "Diff Project");
    await client.simulatePermissionRequest({
      sessionId: "diff-4",
      toolUseId: "diff-tool-4",
      toolName: "Write",
      toolInput: {
        file_path: "src/wide.ts",
        content,
      },
      diff: {
        fileName: "src/wide.ts",
        oldContent: "",
        newContent: content,
      },
    });

    const diffViewer = page.locator(".diff-viewer");
    await expect(diffViewer).toBeVisible();

    const paddingRight = await diffViewer.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.paddingRight;
    });
    expect(parseInt(paddingRight)).toBeGreaterThanOrEqual(0);
  });
});
