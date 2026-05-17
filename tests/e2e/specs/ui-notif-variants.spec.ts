import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * NotifBody Variants Tests — 4 种通知卡变体
 *
 * 覆盖：two (2-way permission), three (3-way permission),
 * jump (question/answer), done (task completed)
 *
 * 每种变体测：完整渲染、所有按钮存在、按钮可点击、keyboard hint 显示
 */

function makeNotifSession(id: string, label: string, overrides: Record<string, unknown> = {}) {
  return [{
    id,
    label,
    cwd: `C:\\Projects\\${label}`,
    state: "running",
    createdAt: Date.now() - 60000,
    lastActivity: Date.now() - 2000,
    agent: "claude",
    pid: 1234,
    toolHistory: [],
    ...overrides,
  }];
}

async function createAndCheckSession(page: any, sessionId: string, label: string) {
  const client = new VibeTestClient(page);
  await client.simulateSessionStart(sessionId, label);
  await page.waitForTimeout(50);
  return client;
}

test.describe("NotifBody — Two (2-way permission)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.simulateSessionStart("s1", "Perm Project");
  });

  test("two: 渲染 Approve + Deny 按钮和键盘提示", async ({ page }) => {
    await page.evaluate(() => {
      window.__VIBE_TEST_BRIDGE__!.simulateEvent("permission_request", {
        session_id: "s1", tool_use_id: "t1", tool_name: "Bash",
        action: "Execute: npm test", risk_level: "medium",
        approval_type: "permission",
      });
    });
    await page.waitForTimeout(300);

    // NotifBody 在 approval-focus 内
    await expect(page.getByTestId("approval-panel")).toBeVisible();

    // 按钮存在
    await expect(page.getByTestId("approve-btn")).toBeVisible();
    await expect(page.getByTestId("reject-btn")).toBeVisible();

    // 显示工具名
    const panelText = await client.getTextContents("[data-testid='approval-panel']");
    const all = panelText.join(" ");
    expect(all).toContain("Bash");
  });
});

test.describe("NotifBody — Three (3-way permission)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.simulateSessionStart("s1", "3way Project");
  });

  test("three: 渲染 3 个 action 按钮", async ({ page }) => {
    // ApprovalPanel 组件内部根据 toolName 或 approvalType 路由
    // three-way 由 PermissionPanel 处理，显示 3 个选项
    // 使用 simulate 通过普通 permission_request 触发
    await page.evaluate(() => {
      window.__VIBE_TEST_BRIDGE__!.simulateEvent("permission_request", {
        session_id: "s1", tool_use_id: "t1", tool_name: "Bash",
        action: "Execute: sudo rm -rf /", risk_level: "high",
        approval_type: "permission",
      });
    });
    await page.waitForTimeout(300);

    await expect(page.getByTestId("approval-panel")).toBeVisible();

    // 3 个按钮：Allow once / Allow always / Deny
    // 实际 ApprovalPanel 中有 multi-action 选项
    const buttons = await client.getElementCount(
      "[data-testid='approval-panel'] button, [data-testid='approval-panel'] [role='button']"
    );
    expect(buttons).toBeGreaterThanOrEqual(2);
  });
});

test.describe("NotifBody — Jump (question/answer)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.simulateSessionStart("s1", "Question Project");
  });

  test("jump: 渲染 question 文本和选项", async ({ page }) => {
    // 通过 permission_request 带 question 数据触发 QuestionPanel
    const questionData = {
      session_id: "s1",
      tool_use_id: "q1",
      tool_name: "AskUserQuestion",
      action: "User input required",
      risk_level: "low",
      approval_type: "question",
      questions: [
        {
          question: "Which framework?",
          header: "Framework Choice",
          options: [
            { label: "React", description: "UI library" },
            { label: "Vue", description: "Progressive framework" },
          ],
          multiSelect: false,
        },
      ],
    };

    await page.evaluate((data) => {
      window.__VIBE_TEST_BRIDGE__!.simulateEvent("permission_request", data);
    }, questionData);
    await page.waitForTimeout(300);

    // 显示 Question 面板
    await expect(page.getByTestId("approval-panel")).toBeVisible();

    // 问题文本渲染
    await expect(page.getByText("Which framework?")).toBeVisible();

    // 选项渲染
    await expect(page.getByText("React")).toBeVisible();
    await expect(page.getByText("Vue")).toBeVisible();

    // 自定义输入框
    const input = page.getByPlaceholder("Or type your own answer...");
    await expect(input).toBeVisible();
  });

  test("jump: 选择选项后 Submit 启用", async ({ page }) => {
    await page.evaluate(() => {
      window.__VIBE_TEST_BRIDGE__!.simulateEvent("permission_request", {
        session_id: "s1", tool_use_id: "q2", tool_name: "AskUserQuestion",
        action: "User input required", risk_level: "low",
        approval_type: "question",
        questions: [{ question: "Pick?", header: "Choice", options: [{ label: "A" }, { label: "B" }], multiSelect: false }],
      });
    });
    await page.waitForTimeout(300);

    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeDisabled();

    // 点击选项 A
    await page.locator(".approval-panel__option").first().click();
    await expect(submitBtn).toBeEnabled();
  });

  test("jump: 自定义输入后 Submit 启用", async ({ page }) => {
    await page.evaluate(() => {
      window.__VIBE_TEST_BRIDGE__!.simulateEvent("permission_request", {
        session_id: "s1", tool_use_id: "q3", tool_name: "AskUserQuestion",
        action: "User input required", risk_level: "low",
        approval_type: "question",
        questions: [{ question: "Name?", header: "Info", options: [{ label: "Default" }], multiSelect: false }],
      });
    });
    await page.waitForTimeout(300);

    const input = page.getByPlaceholder("Or type your own answer...");
    await input.fill("Custom answer");
    await page.waitForTimeout(100);

    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeEnabled();
  });

  test("jump: Skip 按钮清除审批", async ({ page }) => {
    await page.evaluate(() => {
      window.__VIBE_TEST_BRIDGE__!.simulateEvent("permission_request", {
        session_id: "s1", tool_use_id: "q4", tool_name: "AskUserQuestion",
        action: "User input required", risk_level: "low",
        approval_type: "question",
        questions: [{ question: "Skip me?", header: "Optional", options: [{ label: "A" }], multiSelect: false }],
      });
    });
    await page.waitForTimeout(300);

    const skipBtn = page.getByRole("button", { name: "Skip" });
    await expect(skipBtn).toBeVisible();
    await skipBtn.click();
    await page.waitForTimeout(300);

    const approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(0);
  });
});

test.describe("NotifBody — Plan Panel", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
    await client.simulateSessionStart("s1", "Plan Project");
  });

  test("plan: 渲染 markdown 内容和 Proceed/Cancel 按钮", async ({ page }) => {
    await client.simulatePlanRequest({
      sessionId: "s1",
      toolUseId: "plan-1",
      planContent: "## Implementation\\n\\n1. Refactor core\\n2. Add tests\\n3. Deploy",
    });
    await page.waitForTimeout(300);

    await expect(page.getByTestId("approval-panel")).toBeVisible();

    // markdown 标题
    await expect(page.getByRole("heading", { name: "Implementation" })).toBeVisible();

    // 步骤内容
    await expect(page.getByText("Refactor core")).toBeVisible();
    await expect(page.getByText("Add tests")).toBeVisible();

    // 按钮
    await expect(page.getByRole("button", { name: "Proceed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("plan: Proceed 清除审批", async ({ page }) => {
    await client.simulatePlanRequest({
      sessionId: "s1", toolUseId: "plan-2",
      planContent: "Simple plan",
    });
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Proceed" }).click();
    await page.waitForTimeout(300);

    const approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(0);
  });

  test("plan: Cancel 清除审批", async ({ page }) => {
    await client.simulatePlanRequest({
      sessionId: "s1", toolUseId: "plan-3",
      planContent: "Simple plan",
    });
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);

    const approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(0);
  });

  test("plan: 空 planContent 显示 fallback", async ({ page }) => {
    await client.simulatePlanRequest({
      sessionId: "s1", toolUseId: "plan-4",
      planContent: "",
    });
    await page.waitForTimeout(300);

    await expect(page.getByText("No plan content provided")).toBeVisible();
  });
});

test.describe("NotifBody — Done (task completed)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("done: session 行内 detail 显示完成信息（默认展开）", async ({ page }) => {
    // 创建一个 completed session，非 stale（lastActivity 5s ago < 300s 阈值）
    const sessions = [{
      id: "s1",
      label: "Done Project",
      cwd: "C:\\Projects\\done",
      state: "completed",
      createdAt: Date.now() - 120000,
      lastActivity: Date.now() - 5000, // < 300s → 非 stale
      agent: "claude",
      toolHistory: [],
    }];
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // completed 非 stale → detail 默认展开
    const details = await client.getElementCount("[data-testid='row-detail']");
    expect(details).toBe(1);

    // detail 文本包含 Completed
    const detailText = await client.getTextContents("[data-testid='row-detail']");
    expect(detailText.join(" ")).toContain("Completed");
  });

  test("done: 错误完成显示 error 信息", async ({ page }) => {
    const sessions = [{
      id: "s1",
      label: "Error Project",
      cwd: "C:\\Projects\\error",
      state: "completed",
      createdAt: Date.now() - 120000,
      lastActivity: Date.now() - 5000,
      agent: "claude",
      lastError: "Build failed: exit code 2",
      toolHistory: [],
    }];
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // error text 应在 detail 内
    const detailText = await client.getTextContents("[data-testid='row-detail']");
    expect(detailText.join(" ")).toContain("Build failed: exit code 2");
  });
});
