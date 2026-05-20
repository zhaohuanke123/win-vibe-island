import type { Page } from "@playwright/test";

export class VibeTestClient {
  constructor(private page: Page) {}

  private simulate(event: string, payload: Record<string, unknown>) {
    return this.page.evaluate(
      ({ event, payload }) => window.__VIBE_TEST_BRIDGE__!.simulateEvent(event, payload),
      { event, payload },
    );
  }

  // ── Session CRUD ──

  async setSessions(sessions: Array<Record<string, unknown>>) {
    return this.page.evaluate(
      (sessions) => window.__VIBE_TEST_BRIDGE__!.setSessions(sessions as any),
      sessions,
    );
  }

  async getSessions() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getSessions());
  }

  async getSessionCount() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getSessionCount());
  }

  async getApprovalRequest() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getApprovalRequest());
  }

  async getPendingApprovals() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getPendingApprovals());
  }

  async getHookServerStatus() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getHookServerStatus());
  }

  async updateSession(id: string, updates: Record<string, unknown>) {
    return this.page.evaluate(
      ({ id, updates }) => window.__VIBE_TEST_BRIDGE__!.updateSession(id, updates),
      { id, updates },
    );
  }

  async resetAll() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.resetAll());
  }

  // ── Event Simulation ──

  async simulateSessionStart(sessionId: string, label: string, cwd?: string) {
    return this.simulate("session_start", {
      session_id: sessionId,
      label,
      cwd: cwd ?? null,
    });
  }

  async simulatePermissionRequest(options: {
    sessionId: string;
    toolUseId: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
    action?: string;
    riskLevel?: string;
    approvalType?: string;
  }) {
    return this.simulate("permission_request", {
      session_id: options.sessionId,
      tool_use_id: options.toolUseId,
      tool_name: options.toolName,
      tool_input: options.toolInput ?? {},
      action: options.action ?? "",
      risk_level: options.riskLevel ?? "medium",
      approval_type: options.approvalType ?? "permission",
    });
  }

  async simulatePlanRequest(options: {
    sessionId: string;
    toolUseId: string;
    planContent: string;
  }) {
    return this.simulate("permission_request", {
      session_id: options.sessionId,
      tool_use_id: options.toolUseId,
      tool_name: "ExitPlanMode",
      action: "Review plan before proceeding",
      risk_level: "medium",
      approval_type: "plan",
      plan_content: options.planContent,
    });
  }

  async simulateQuestionRequest(options: {
    sessionId: string;
    toolUseId: string;
    questions: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description?: string; preview?: string }>;
      multiSelect?: boolean;
    }>;
  }) {
    return this.simulate("permission_request", {
      session_id: options.sessionId,
      tool_use_id: options.toolUseId,
      tool_name: "AskUserQuestion",
      action: "User input required",
      risk_level: "low",
      approval_type: "question",
      questions: options.questions,
    });
  }

  async simulateStateChange(sessionId: string, state: string) {
    return this.simulate("state_change", { session_id: sessionId, state });
  }

  async simulateSessionEnd(sessionId: string) {
    return this.simulate("session_end", { session_id: sessionId });
  }

  // ── Tool Lifecycle ──

  async simulateToolUse(sessionId: string, toolName: string, toolInput?: Record<string, unknown>) {
    return this.page.evaluate(
      ({ sessionId, toolName, toolInput }) =>
        window.__VIBE_TEST_BRIDGE__!.simulateToolUse(sessionId, toolName, toolInput),
      { sessionId, toolName, toolInput },
    );
  }

  async simulateToolComplete(sessionId: string, toolName: string, durationMs?: number) {
    return this.page.evaluate(
      ({ sessionId, toolName, durationMs }) =>
        window.__VIBE_TEST_BRIDGE__!.simulateToolComplete(sessionId, toolName, durationMs),
      { sessionId, toolName, durationMs },
    );
  }

  async simulateToolError(sessionId: string, toolName: string, error: string) {
    return this.page.evaluate(
      ({ sessionId, toolName, error }) =>
        window.__VIBE_TEST_BRIDGE__!.simulateToolError(sessionId, toolName, error),
      { sessionId, toolName, error },
    );
  }

  // ── Layout Measurement ──

  async getElementRect(selector: string) {
    return this.page.evaluate((sel) => window.__VIBE_TEST_BRIDGE__!.getElementRect(sel), selector);
  }

  async getElementStyles(selector: string, props: string[]) {
    return this.page.evaluate(
      ({ sel, props }) => window.__VIBE_TEST_BRIDGE__!.getElementStyles(sel, props),
      { sel: selector, props },
    );
  }

  async getElementCount(selector: string) {
    return this.page.evaluate((sel) => window.__VIBE_TEST_BRIDGE__!.getElementCount(sel), selector);
  }

  async getTextContents(selector: string) {
    return this.page.evaluate(
      (sel) => window.__VIBE_TEST_BRIDGE__!.getTextContents(sel),
      selector,
    );
  }

  // ── Config / Store injection ──

  async setConfigField(path: string[], value: unknown) {
    return this.page.evaluate(
      ({ path, value }) => window.__VIBE_TEST_BRIDGE__!.setConfigField(path, value),
      { path, value },
    );
  }

  // ── UI Interaction Helpers ──

  async clickBar() {
    await this.page.getByTestId("status-bar").click();
  }

  async clickSessionRow(sessionId: string) {
    await this.page.locator(`[data-session-id="${sessionId}"]`).click();
  }

  async clickChevron(sessionId: string) {
    await this.page
      .locator(`[data-session-id="${sessionId}"] [data-testid="row-chevron"]`)
      .click();
  }

  async clickGroupHeader(label: string) {
    await this.page.locator(`[data-testid="group-header"]`).filter({ hasText: label }).click();
  }

  async clickApprove() {
    await this.page.getByTestId("approve-btn").click();
  }

  async clickReject() {
    await this.page.getByTestId("reject-btn").click();
  }

  async selectGroupBy(value: string) {
    await this.page.locator(".oi-select").first().selectOption(value);
  }

  async selectSortBy(value: string) {
    await this.page.locator(".oi-select").nth(1).selectOption(value);
  }
}
