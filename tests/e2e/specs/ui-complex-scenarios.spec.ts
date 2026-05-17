import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

/**
 * Complex UI Scenarios
 *
 * 注意：waitingForApproval 会触发审批专注模式。需要该状态的测试放最后分组。
 * 状态分组测试用 running/completed/idle。
 */

function makeSession(id: string, label: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label,
    cwd: `C:\\Projects\\${label.toLowerCase().replace(/\s+/g, "-")}`,
    state: "running",
    createdAt: Date.now() - 120000,
    lastActivity: Date.now() - 5000,
    agent: "claude",
    toolHistory: [],
    ...overrides,
  };
}

test.describe("Scenario 1: 5 sessions + groupBy 切换", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("5 session → 默认 state 分组 → agent 分组 → project 分组", async ({ page }) => {
    const sessions = [
      makeSession("s1", "Alpha", { state: "running", agent: "claude", cwd: "C:\\Proj\\alpha" }),
      makeSession("s2", "Beta", { state: "running", agent: "codex", cwd: "C:\\Proj\\beta" }),
      makeSession("s3", "Gamma", { state: "completed", agent: "claude", cwd: "C:\\Proj\\gamma" }),
      makeSession("s4", "Delta", { state: "running", agent: "cursor", cwd: "C:\\Proj\\delta" }),
      makeSession("s5", "Epsilon", { state: "idle", agent: "gemini", cwd: "C:\\Proj\\epsilon" }),
    ];
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // 默认 state 分组 → 应看到 "In progress", "Just done"
    // 注意: Idle 组默认折叠，但组头仍存在
    const stateLabels = await client.getTextContents(".oi-prio-head__label");
    expect(stateLabels).toContain("In progress");
    expect(stateLabels).toContain("Just done");

    // 切换 agent 分组
    await client.selectGroupBy("agent");
    await page.waitForTimeout(200);
    const agentLabels = await client.getTextContents(".oi-grp-head__label");
    expect(agentLabels).toContain("Claude Code");
    expect(agentLabels).toContain("Codex");

    // 切换 project 分组
    await client.selectGroupBy("project");
    await page.waitForTimeout(200);
    const projectLabels = await client.getTextContents(".oi-grp-head__label");
    expect(projectLabels).toContain("alpha");
    expect(projectLabels).toContain("beta");

    // 切换 no group
    await client.selectGroupBy("none");
    await page.waitForTimeout(200);
    // "none" 模式使用 flat-row testid（而非 session-row）
    const flatRowCount = await client.getElementCount("[data-testid='flat-row']");
    expect(flatRowCount).toBe(5);
  });
});

test.describe("Scenario 2: tool 生命周期", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("session start → tool_use → tool_complete → tool_error → 历史累积", async ({ page }) => {
    await client.simulateSessionStart("s1", "Dev Project", "/dev/project");
    await page.waitForTimeout(50);

    // tool_use: Edit
    await client.simulateToolUse("s1", "Edit", { file_path: "main.ts" });
    const sessions1 = await client.getSessions();
    expect(sessions1[0].state).toBe("running");
    expect(sessions1[0].toolName).toBe("Edit");

    // tool_complete
    await client.simulateToolComplete("s1", "Edit", 1500);
    const sessions2 = await client.getSessions();
    expect(sessions2[0].toolHistory).toHaveLength(1);
    expect(sessions2[0].toolHistory[0].toolName).toBe("Edit");
    expect(sessions2[0].toolHistory[0].duration).toBe(1500);
    expect(sessions2[0].toolHistory[0].status).toBe("success");

    // tool_use: Bash → tool_error
    await client.simulateToolUse("s1", "Bash", { command: "npm test" });
    await client.simulateToolError("s1", "Bash", "Command failed: exit 1");
    const sessions3 = await client.getSessions();
    expect(sessions3[0].toolHistory).toHaveLength(2);
    expect(sessions3[0].toolHistory[1].status).toBe("failed");
    expect(sessions3[0].lastError).toBe("Command failed: exit 1");
    expect(sessions3[0].state).toBe("completed");
  });
});

test.describe("Scenario 3: 3 approvals 逐个处理", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("添加 3 approvals → 逐个 approve（直接操作 store） → 队列空", async ({ page }) => {
    await client.simulateSessionStart("s1", "Main");
    await client.simulateSessionStart("s2", "Secondary");
    await client.simulateSessionStart("s3", "Third");

    await page.evaluate(() => {
      const b = window.__VIBE_TEST_BRIDGE__!;
      b.simulateEvent("permission_request", { session_id: "s1", tool_use_id: "t1", tool_name: "Bash", action: "rm /tmp", risk_level: "high", approval_type: "permission" });
      b.simulateEvent("permission_request", { session_id: "s2", tool_use_id: "t2", tool_name: "Write", action: "Write file", risk_level: "medium", approval_type: "permission" });
      b.simulateEvent("permission_request", { session_id: "s3", tool_use_id: "t3", tool_name: "Read", action: "Read config", risk_level: "low", approval_type: "permission" });
    });
    await page.waitForTimeout(300);

    let approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(3);

    // 逐个通过 store.removeApprovalByToolUseId 移除
    for (const tid of ["t1", "t2", "t3"]) {
      await page.evaluate((toolUseId) => {
        const b = window.__VIBE_TEST_BRIDGE__!;
        // invoke 的 mock 会调 removeApprovalByToolUseId
        b.invoke("submit_approval_response", { toolUseId, approved: true });
      }, tid);
      await page.waitForTimeout(100);
    }

    approvals = await client.getPendingApprovals();
    expect(approvals).toHaveLength(0);
  });
});

test.describe("Scenario 4: 审批手动折叠 → 再展开", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("审批 arrive → 手动折叠 bar → 再展开 → 审批面板恢复", async ({ page }) => {
    await client.simulateSessionStart("s1", "Project");
    await client.simulatePermissionRequest({
      sessionId: "s1", toolUseId: "t1", toolName: "Bash",
      action: "Execute: ls", riskLevel: "low",
    });
    await page.waitForTimeout(400);

    // 审批专注模式展开
    await expect(page.getByTestId("approval-focus")).toBeVisible();

    // 手动点击 bar 折叠
    await client.clickBar();
    await page.waitForTimeout(400);
    let expanded = await client.getElementCount(".overlay--expanded");
    expect(expanded).toBe(0);

    // 再点击 bar 展开
    await client.clickBar();
    await page.waitForTimeout(500);

    // 审批面板恢复显示
    await expect(page.getByTestId("approval-focus")).toBeVisible();
    await expect(page.getByTestId("approve-btn")).toBeVisible();
  });
});

test.describe("Scenario 5: 多 agent 分组视图", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("6 agents → groupBy=agent → 按 agent 分组", async ({ page }) => {
    const sessions = [
      makeSession("s1", "A", { agent: "claude" }),
      makeSession("s2", "B", { agent: "codex" }),
      makeSession("s3", "C", { agent: "claude" }),
      makeSession("s4", "D", { agent: "cursor" }),
      makeSession("s5", "E", { agent: "gemini" }),
      makeSession("s6", "F", { agent: "opencode" }),
    ];
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // 切 agent 分组
    await client.selectGroupBy("agent");
    await page.waitForTimeout(200);

    const headers = await client.getElementCount("[data-testid='group-header']");
    expect(headers).toBe(5);
  });
});

test.describe("Scenario 6: stale session", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("completed >5min → 行有 stale class", async ({ page }) => {
    await client.setSessions([makeSession("s1", "Old", {
      state: "completed",
      lastActivity: Date.now() - 400000,
    })] as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    await client.clickChevron("s1");
    await page.waitForTimeout(200);

    const hasStale = await page.evaluate(() => {
      return document.querySelector('[data-session-id="s1"]')?.classList.contains("session-row--stale");
    });
    expect(hasStale).toBe(true);
  });
});

test.describe("Scenario 7: 连续 5 次 tool 操作", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("5 轮 tool_use → tool_complete → 5 条历史", async ({ page }) => {
    await client.simulateSessionStart("s1", "Heavy Worker");
    const tools = ["Read", "Edit", "Bash", "Grep", "Write"];

    for (let i = 0; i < tools.length; i++) {
      await client.simulateToolUse("s1", tools[i], { file_path: `f_${i}.ts` });
      await page.waitForTimeout(20);
      await client.simulateToolComplete("s1", tools[i], 100 + i * 100);
      await page.waitForTimeout(20);
    }

    const sessions = await client.getSessions();
    expect(sessions[0].toolHistory).toHaveLength(5);
    expect(sessions[0].toolHistory[0].toolName).toBe("Read");
    expect(sessions[0].toolHistory[4].toolName).toBe("Write");
  });
});

test.describe("Scenario 8: 12 sessions 可见性", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("12 sessions 全部渲染", async ({ page }) => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      makeSession(`s${i}`, `Project ${i}`, {
        state: i < 6 ? "running" : "completed",
        agent: ["claude", "codex", "cursor", "gemini", "opencode", "kimi"][i % 6],
      })
    );
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    const rows = await client.getElementCount("[data-testid='session-row']");
    // running + completed groups are not collapsed by default
    expect(rows).toBe(12);
  });
});

test.describe("Scenario 9: sort 切换", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("attention 排序 + updated 排序可切换", async ({ page }) => {
    const now = Date.now();
    const sessions = [
      makeSession("s1", "Running A", { lastActivity: now - 200 }),
      makeSession("s2", "Running B", { lastActivity: now - 100 }),
      makeSession("s3", "Completed C", { state: "completed", lastActivity: now - 1000 }),
    ];
    await client.setSessions(sessions as any);
    await client.clickBar();
    await page.waitForTimeout(500);

    // Default sort = attention: stale sinks → s3 ↓, then newest first: s2, s1
    // But attention sort is: running first, then completed without stale, then stale
    // s3 completed with lastActivity 1000s ago → stale → sinks
    const rowIdsBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid='session-row']"))
        .map(el => el.getAttribute("data-session-id"))
    );
    expect(rowIdsBefore.length).toBe(3);

    // 切到 updated 排序
    await client.selectSortBy("updated");
    await page.waitForTimeout(200);

    const rowIdsAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid='session-row']"))
        .map(el => el.getAttribute("data-session-id"))
    );
    expect(rowIdsAfter.length).toBe(3);

    // updated: s2 (newest) → s1 (middle) → s3 (oldest)
    expect(rowIdsAfter[0]).toBe("s2");
    expect(rowIdsAfter[1]).toBe("s1");
    expect(rowIdsAfter[2]).toBe("s3");
  });
});
