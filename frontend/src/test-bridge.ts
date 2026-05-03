import { invoke } from "@tauri-apps/api/core";
import { useSessionsStore } from "./store/sessions";
import type { Session, ApprovalRequest, HookServerStatus } from "./store/sessions";

export interface VibeTestBridge {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  getSessions: () => Session[];
  getActiveSessionId: () => string | null;
  getApprovalRequest: () => ApprovalRequest | null;
  getHookServerStatus: () => HookServerStatus;
  resetAll: () => Promise<void>;
}

export function registerTestBridge() {
  window.__VIBE_TEST_BRIDGE__ = {
    invoke: (cmd, args) => invoke(cmd, args),

    getSessions: () => useSessionsStore.getState().sessions,
    getActiveSessionId: () => useSessionsStore.getState().activeSessionId,
    getApprovalRequest: () => useSessionsStore.getState().approvalRequest,
    getHookServerStatus: () => useSessionsStore.getState().hookServerStatus,

    resetAll: async () => {
      useSessionsStore.setState({
        sessions: [],
        activeSessionId: null,
        approvalRequest: null,
      });
      await invoke("test_reset_sessions");
    },
  };
}

declare global {
  interface Window {
    __VIBE_TEST_BRIDGE__?: VibeTestBridge;
  }
}
