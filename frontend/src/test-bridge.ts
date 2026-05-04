import { invoke } from "@tauri-apps/api/core";
import { useSessionsStore } from "./store/sessions";
import type { Session, ApprovalRequest, HookServerStatus, AgentState, ApprovalType, DiffData, Question, ToolExecution } from "./store/sessions";

export interface VibeTestBridge {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  getSessions: () => Session[];
  getActiveSessionId: () => string | null;
  getApprovalRequest: () => ApprovalRequest | null;
  getHookServerStatus: () => HookServerStatus;
  resetAll: () => Promise<void>;
  isTauriRuntime: () => boolean;
  simulateEvent: (event: string, payload: Record<string, unknown>) => void;
}

const isTauriRuntime = () => !!window.__TAURI_INTERNALS__;

function safeInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  if (isTauriRuntime()) {
    return invoke(cmd, args);
  }
  return Promise.reject(new Error("Tauri runtime not available — use simulateEvent() in browser mode"));
}

function simulateEvent(event: string, payload: Record<string, unknown>) {
  const store = useSessionsStore.getState();

  switch (event) {
    case "session_start": {
      const sessionId = payload.session_id as string;
      const existing = store.sessions.find((s) => s.id === sessionId);
      if (existing) {
        store.updateSessionInfo(sessionId, { label: payload.label as string, state: "idle" });
      } else {
        store.addSession({
          id: sessionId,
          label: (payload.label as string) || "Test Session",
          cwd: (payload.cwd as string) || "",
          state: "idle" as AgentState,
          toolHistory: [],
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });
      }
      break;
    }
    case "state_change": {
      const sessionId = payload.session_id as string;
      const state = payload.state as AgentState;
      const existing = store.sessions.find((s) => s.id === sessionId);
      if (existing) {
        store.updateSessionState(sessionId, state);
      } else {
        store.addSession({
          id: sessionId,
          label: "Test Session",
          cwd: "",
          state,
          toolHistory: [],
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });
      }
      break;
    }
    case "permission_request": {
      const sessionId = payload.session_id as string;
      const session = store.sessions.find((s) => s.id === sessionId);
      store.setApprovalRequest({
        toolUseId: payload.tool_use_id as string,
        sessionId,
        sessionLabel: session?.label || "Test Session",
        approvalType: (payload.approval_type as ApprovalType) || "permission",
        timestamp: Date.now(),
        toolName: payload.tool_name as string,
        toolInput: payload.tool_input as Record<string, unknown> | undefined,
        action: payload.action as string,
        riskLevel: payload.risk_level as "low" | "medium" | "high",
        diff: payload.diff as DiffData | undefined,
        questions: payload.questions as Question[] | undefined,
        planContent: payload.plan_content as string | undefined,
      });
      break;
    }
    case "session_end": {
      store.removeSession(payload.session_id as string);
      break;
    }
    case "tool_use": {
      const sessionId = payload.session_id as string;
      const toolName = payload.tool_name as string;
      const toolInput = (payload.tool_input as Record<string, unknown>) || {};
      useSessionsStore.getState().updateSessionInfo(sessionId, {
        state: "thinking",
        toolName,
        currentTool: {
          name: toolName,
          input: toolInput,
          startTime: Date.now(),
        },
      });
      break;
    }
    case "tool_complete": {
      const sessionId = payload.session_id as string;
      const toolName = payload.tool_name as string;
      const durationMs = payload.duration_ms as number | undefined;
      const session = useSessionsStore.getState().sessions.find((s) => s.id === sessionId);
      if (session?.currentTool) {
        const execution: ToolExecution = {
          id: `tool-${Date.now()}`,
          toolName: toolName || session.currentTool.name,
          input: session.currentTool.input,
          duration: durationMs,
          timestamp: Date.now(),
          status: "success" as const,
        };
        useSessionsStore.getState().addToolExecution(sessionId, execution);
      }
      useSessionsStore.getState().updateSessionInfo(sessionId, {
        toolName: undefined,
        filePath: undefined,
        currentTool: undefined,
      });
      break;
    }
    case "tool_error": {
      const sessionId = payload.session_id as string;
      const toolName = payload.tool_name as string;
      const error = payload.error as string;
      const durationMs = payload.duration_ms as number | undefined;
      const execution: ToolExecution = {
        id: `tool-${Date.now()}`,
        toolName,
        input: {},
        duration: durationMs,
        error,
        timestamp: Date.now(),
        status: "failed" as const,
      };
      useSessionsStore.getState().addToolExecution(sessionId, execution);
      useSessionsStore.getState().updateSessionInfo(sessionId, {
        toolName: undefined,
        filePath: undefined,
        currentTool: undefined,
      });
      break;
    }
    case "test_reset": {
      useSessionsStore.setState({
        sessions: [],
        activeSessionId: null,
        approvalRequest: null,
      });
      break;
    }
  }
}

export function registerTestBridge() {
  window.__VIBE_TEST_BRIDGE__ = {
    invoke: safeInvoke,

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
      if (isTauriRuntime()) {
        await invoke("test_reset_sessions");
      }
    },

    isTauriRuntime,
    simulateEvent,
  };
}

declare global {
  interface Window {
    __VIBE_TEST_BRIDGE__?: VibeTestBridge;
    __TAURI_INTERNALS__?: unknown;
  }
}
