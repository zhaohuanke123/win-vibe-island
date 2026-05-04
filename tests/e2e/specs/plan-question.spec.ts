import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

test.describe("Plan Mode (ExitPlanMode)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("shows plan panel with markdown content", async ({ page }) => {
    await client.simulateSessionStart("plan-1", "Plan Project");
    await client.simulatePlanRequest({
      sessionId: "plan-1",
      toolUseId: "plan-tool-1",
      planContent: "## Refactor Plan\n\n1. Extract utility functions\n2. Add unit tests\n3. Update documentation",
    });

    await expect(page.getByTestId("approval-panel")).toBeVisible();
    await expect(page.locator(".approval-panel__title", { hasText: "Plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Refactor Plan" })).toBeVisible();
    await expect(page.getByText("Extract utility functions")).toBeVisible();
  });

  test("shows plan with proceed and cancel buttons", async ({ page }) => {
    await client.simulateSessionStart("plan-1", "Plan Project");
    await client.simulatePlanRequest({
      sessionId: "plan-1",
      toolUseId: "plan-tool-2",
      planContent: "Simple plan",
    });

    const panel = page.getByTestId("approval-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Proceed" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("clears approval after clicking Proceed", async ({ page }) => {
    await client.simulateSessionStart("plan-1", "Plan Project");
    await client.simulatePlanRequest({
      sessionId: "plan-1",
      toolUseId: "plan-tool-3",
      planContent: "Click proceed test",
    });

    await page.getByRole("button", { name: "Proceed" }).click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });

  test("clears approval after clicking Cancel", async ({ page }) => {
    await client.simulateSessionStart("plan-1", "Plan Project");
    await client.simulatePlanRequest({
      sessionId: "plan-1",
      toolUseId: "plan-tool-4",
      planContent: "Click cancel test",
    });

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });

  test("renders plan with code blocks", async ({ page }) => {
    await client.simulateSessionStart("plan-1", "Plan Project");
    await client.simulatePlanRequest({
      sessionId: "plan-1",
      toolUseId: "plan-tool-5",
      planContent: "## Changes\n\n```typescript\nconst x = 42;\n```\n\nDone.",
    });

    await expect(page.getByTestId("approval-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Changes" })).toBeVisible();
    await expect(page.getByText("const x = 42;")).toBeVisible();
  });
});

test.describe("Question Mode (AskUserQuestion)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("shows question panel with question text and options", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-1",
      questions: [
        {
          question: "Which framework should we use?",
          header: "Framework",
          options: [
            { label: "React", description: "Component-based UI library" },
            { label: "Vue", description: "Progressive framework" },
          ],
        },
      ],
    });

    const panel = page.getByTestId("approval-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".approval-panel__title", { hasText: "Question" })).toBeVisible();
    await expect(page.getByText("Which framework should we use?")).toBeVisible();
    await expect(page.getByText("React")).toBeVisible();
    await expect(page.getByText("Vue")).toBeVisible();
    await expect(page.getByText("Component-based UI library")).toBeVisible();
  });

  test("shows question header tag", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-2",
      questions: [
        {
          question: "Continue?",
          header: "Confirmation",
          options: [{ label: "Yes" }, { label: "No" }],
        },
      ],
    });

    await expect(page.getByText("Confirmation", { exact: true })).toBeVisible();
  });

  test("selects an option on click", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-3",
      questions: [
        {
          question: "Pick one",
          header: "Choice",
          options: [{ label: "Option A" }, { label: "Option B" }],
        },
      ],
    });

    const optionA = page.locator(".approval-panel__option", { hasText: /^Option A$/ });
    await optionA.click();

    await expect(optionA).toHaveClass(/approval-panel__option--selected/);
  });

  test("submit button is disabled until all questions answered", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-4",
      questions: [
        {
          question: "Name?",
          header: "Info",
          options: [{ label: "Alice" }, { label: "Bob" }],
        },
      ],
    });

    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeDisabled();

    await page.locator(".approval-panel__option", { hasText: /^Alice$/ }).click();
    await expect(submitBtn).toBeEnabled();
  });

  test("clears approval after submitting answers", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-5",
      questions: [
        {
          question: "Proceed?",
          header: "Action",
          options: [{ label: "Yes" }],
        },
      ],
    });

    await page.locator(".approval-panel__option", { hasText: /^Yes$/ }).click();
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });

  test("clears approval after clicking Skip", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-6",
      questions: [
        {
          question: "Optional question?",
          header: "Optional",
          options: [{ label: "A" }],
        },
      ],
    });

    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });

  test("handles custom text input", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-7",
      questions: [
        {
          question: "Custom answer?",
          header: "Custom",
          options: [{ label: "Default" }],
        },
      ],
    });

    const input = page.getByPlaceholder("Or type your own answer...");
    await expect(input).toBeVisible();
    await input.fill("My custom answer");

    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeEnabled();

    await submitBtn.click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });

  test("handles multiple questions", async ({ page }) => {
    await client.simulateSessionStart("q-1", "Question Project");
    await client.simulateQuestionRequest({
      sessionId: "q-1",
      toolUseId: "q-tool-8",
      questions: [
        {
          question: "First question?",
          header: "Step 1",
          options: [{ label: "A1" }],
        },
        {
          question: "Second question?",
          header: "Step 2",
          options: [{ label: "B1" }],
        },
      ],
    });

    await expect(page.getByText("First question?")).toBeVisible();
    await expect(page.getByText("Second question?")).toBeVisible();

    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeDisabled();

    await page.locator(".approval-panel__option", { hasText: /^A1$/ }).click();
    await expect(submitBtn).toBeDisabled();

    await page.locator(".approval-panel__option", { hasText: /^B1$/ }).click();
    await expect(submitBtn).toBeEnabled();
  });
});

test.describe("Plan via AskUserQuestion (plan header)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("shows plan steps parsed from option description", async ({ page }) => {
    await client.simulateSessionStart("plan-q-1", "Plan Q Project");
    await client.simulateQuestionRequest({
      sessionId: "plan-q-1",
      toolUseId: "plan-q-tool-1",
      questions: [
        {
          question: "How should we proceed?",
          header: "Plan",
          options: [
            {
              label: "Approve Plan",
              description: "1. Setup environment\n2. Run tests\n3. Deploy",
            },
            { label: "Modify Plan" },
          ],
        },
      ],
    });

    const panel = page.getByTestId("approval-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".approval-panel__title", { hasText: "Plan" })).toBeVisible();
    await expect(page.getByText("Setup environment")).toBeVisible();
    await expect(page.getByText("Run tests")).toBeVisible();
    await expect(page.getByText("Deploy")).toBeVisible();
  });

  test("clicking Approve Plan clears approval", async ({ page }) => {
    await client.simulateSessionStart("plan-q-1", "Plan Q Project");
    await client.simulateQuestionRequest({
      sessionId: "plan-q-1",
      toolUseId: "plan-q-tool-2",
      questions: [
        {
          question: "Approve?",
          header: "Plan",
          options: [
            { label: "Approve Plan", description: "1. Step one" },
            { label: "Reject" },
          ],
        },
      ],
    });

    await expect(page.getByRole("button", { name: "Approve Plan" })).toBeVisible();
    await page.getByRole("button", { name: "Approve Plan" }).click();
    await page.waitForTimeout(300);

    const approval = await client.getApprovalRequest();
    expect(approval).toBeNull();
  });
});
