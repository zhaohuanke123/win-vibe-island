import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

test.describe("AskUserQuestion with Preview", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("renders option with preview code block in approval panel", async ({ page }) => {
    await client.simulateSessionStart("preview-1", "Preview Project");
    await client.simulateQuestionRequest({
      sessionId: "preview-1",
      toolUseId: "preview-tool-1",
      questions: [
        {
          question: "Which state machine library should we use?",
          header: "Library",
          options: [
            {
              label: "XState",
              description: "Finite state machine with visualizer",
              preview: "```typescript\nimport { createMachine } from 'xstate';\nconst machine = createMachine({\n  id: 'toggle',\n  initial: 'inactive',\n  states: { inactive: {}, active: {} }\n});\n```",
            },
            {
              label: "Robot",
              description: "Lightweight FSM",
            },
          ],
        },
      ],
    });

    const panel = page.getByTestId("approval-panel");
    await expect(panel).toBeVisible();

    await expect(panel.getByText("XState")).toBeVisible();
    await expect(panel.getByText("Robot")).toBeVisible();
    await expect(panel.getByText("Finite state machine with visualizer")).toBeVisible();

    const previewBlock = panel.locator(".approval-panel__option-preview");
    await expect(previewBlock).toBeVisible();
    await expect(previewBlock.getByText("createMachine")).toBeVisible();
  });

  test("option without preview does not render preview block", async ({ page }) => {
    await client.simulateSessionStart("preview-2", "Preview Project");
    await client.simulateQuestionRequest({
      sessionId: "preview-2",
      toolUseId: "preview-tool-2",
      questions: [
        {
          question: "Simple choice?",
          header: "Choice",
          options: [
            { label: "Option A" },
            { label: "Option B" },
          ],
        },
      ],
    });

    const panel = page.getByTestId("approval-panel");
    await expect(panel).toBeVisible();

    const previewBlocks = await panel.locator(".approval-panel__option-preview").count();
    expect(previewBlocks).toBe(0);
  });

  test("preview code block strips code fences", async ({ page }) => {
    await client.simulateSessionStart("preview-3", "Preview Project");
    await client.simulateQuestionRequest({
      sessionId: "preview-3",
      toolUseId: "preview-tool-3",
      questions: [
        {
          question: "Pick a pattern?",
          header: "Pattern",
          options: [
            {
              label: "Observer",
              preview: "```javascript\nclass Observer {\n  update(data) {}\n}\n```",
            },
          ],
        },
      ],
    });

    const previewBlock = page.locator(".approval-panel__option-preview");
    await expect(previewBlock).toBeVisible();

    // Code fences should be stripped — no raw ``` in the rendered output
    const text = await previewBlock.textContent();
    expect(text).not.toContain("```");
    expect(text).toContain("class Observer");
  });

  test("multiple options with previews render independently", async ({ page }) => {
    await client.simulateSessionStart("preview-4", "Preview Project");
    await client.simulateQuestionRequest({
      sessionId: "preview-4",
      toolUseId: "preview-tool-4",
      questions: [
        {
          question: "Choose implementation?",
          header: "Impl",
          options: [
            {
              label: "React",
              preview: "```tsx\nconst App = () => <div>Hello</div>;\n```",
            },
            {
              label: "Vue",
              preview: "```vue\n<template><div>Hello</div></template>\n```",
            },
            {
              label: "Vanilla",
              description: "No framework needed",
            },
          ],
        },
      ],
    });

    const panel = page.getByTestId("approval-panel");
    await expect(panel).toBeVisible();

    const previewBlocks = await panel.locator(".approval-panel__option-preview").count();
    expect(previewBlocks).toBe(2);

    await expect(panel.getByText("const App")).toBeVisible();
    await expect(panel.getByText("<template>")).toBeVisible();
    await expect(panel.getByText("No framework needed")).toBeVisible();
  });
});
