import type { Page } from "@playwright/test";

export class VibeTestClient {
  constructor(private page: Page) {}

  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return this.page.evaluate(
      ({ cmd, args }) => window.__VIBE_TEST_BRIDGE__!.invoke(cmd, args) as Promise<T>,
      { cmd, args: args ?? {} },
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
    return this.invoke("simulate_session_start", {
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
    return this.invoke("simulate_permission_request", {
      session_id: options.sessionId,
      tool_use_id: options.toolUseId,
      tool_name: options.toolName,
      tool_input: options.toolInput ?? {},
      action: options.action ?? "",
      risk_level: options.riskLevel ?? "medium",
      approval_type: options.approvalType ?? "permission",
    });
  }

  async simulateStateChange(sessionId: string, state: string) {
    return this.invoke("simulate_state_change", { session_id: sessionId, state });
  }

  async simulateSessionEnd(sessionId: string) {
    return this.invoke("simulate_session_end", { session_id: sessionId });
  }

  async resetAll() {
    return this.page.evaluate(() => window.__VIBE_TEST_BRIDGE__!.resetAll());
  }

  async getWindowGeometry() {
    return this.invoke<{
      width: number;
      height: number;
      x: number;
      y: number;
      scaleFactor: number;
      isVisible: boolean;
      isFocused: boolean;
    }>("get_window_geometry");
  }
}
