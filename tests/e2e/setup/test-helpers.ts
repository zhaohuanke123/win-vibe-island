import type { Page } from "@playwright/test";

export class VibeTestClient {
  constructor(private page: Page) {}

  private simulate(event: string, payload: Record<string, unknown>) {
    return this.page.evaluate(
      ({ event, payload }) => window.__VIBE_TEST_BRIDGE__!.simulateEvent(event, payload),
      { event, payload },
    );
  }

  async getSessions() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getSessions());
  }

  async getApprovalRequest() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getApprovalRequest());
  }

  async getHookServerStatus() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.getHookServerStatus());
  }

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
      options: Array<{ label: string; description?: string }>;
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

  async resetAll() {
    return this.simulate("test_reset", {});
  }
}
