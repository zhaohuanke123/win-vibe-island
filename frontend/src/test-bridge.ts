import { invoke } from "@tauri-apps/api/core";
import { useSessionsStore } from "./store/sessions";
import { useConfigStore } from "./store/config";
import type { Session, ApprovalRequest, HookServerStatus, UIPhase, ApprovalType, DiffData, Question, ToolExecution } from "./store/sessions";
import type { StateIndicatorKind } from "./store/config";

export interface VibeTestBridge {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  getSessions: () => Session[];
  getActiveSessionId: () => string | null;
  getApprovalRequest: () => ApprovalRequest | null;
  getPendingApprovals: () => ApprovalRequest[];
  getCurrentApprovalIndex: () => number;
  getHookServerStatus: () => HookServerStatus;
  resetAll: () => Promise<void>;
  isTauriRuntime: () => boolean;
  simulateEvent: (event: string, payload: Record<string, unknown>) => void;

  // ── New: Batch / Store Direct Access ──
  setSessions: (sessions: Session[]) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  setSessionField: (id: string, field: string, value: unknown) => void;
  setConfigField: (path: string[], value: unknown) => void;
  getSessionCount: () => number;

  // ── New: Tool Lifecycle Simulation ──
  simulateToolUse: (sessionId: string, toolName: string, toolInput?: Record<string, unknown>) => void;
  simulateToolComplete: (sessionId: string, toolName: string, durationMs?: number) => void;
  simulateToolError: (sessionId: string, toolName: string, error: string) => void;

  // ── New: Layout Measurement Utilities ──
  getElementRect: (selector: string) => Promise<{width: number; height: number; top: number; left: number} | null>;
  getElementStyles: (selector: string, props: string[]) => Promise<Record<string, string>>;
  getElementCount: (selector: string) => Promise<number>;
  getTextContents: (selector: string) => Promise<string[]>;

  // ── New: Config / Store injection ──
  setDensity: (mode: "comfortable" | "compact") => void;
  setGroupBy: (mode: string) => void;
  setSortBy: (mode: string) => void;
  setStateIndicator: (kind: string) => void;
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
          state: "idle" as UIPhase,
          toolHistory: [],
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });
      }
      break;
    }
    case "state_change": {
      const sessionId = payload.session_id as string;
      const state = payload.state as UIPhase;
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
      store.addPendingApproval({
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
        state: "running",
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
        pendingApprovals: [],
        currentApprovalIndex: 0,
      });
      break;
    }
  }
}

export function registerTestBridge() {
  // Mock Tauri internals so invoke() works in browser-only E2E tests
  if (!window.__TAURI_INTERNALS__) {
    window.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args?: Record<string, unknown>) => {
        switch (cmd) {
          case "submit_approval_response": {
            const toolUseId = args?.toolUseId as string;
            if (toolUseId) {
              useSessionsStore.getState().removeApprovalByToolUseId(toolUseId);
            }
            return Promise.resolve();
          }
          default:
            return Promise.resolve();
        }
      },
    };
  }

  window.__VIBE_TEST_BRIDGE__ = {
    invoke: safeInvoke,

    getSessions: () => useSessionsStore.getState().sessions,
    getActiveSessionId: () => useSessionsStore.getState().activeSessionId,
    getApprovalRequest: () => {
      const s = useSessionsStore.getState();
      return s.pendingApprovals[s.currentApprovalIndex] ?? null;
    },
    getPendingApprovals: () => useSessionsStore.getState().pendingApprovals,
    getCurrentApprovalIndex: () => useSessionsStore.getState().currentApprovalIndex,
    getHookServerStatus: () => useSessionsStore.getState().hookServerStatus,

    resetAll: async () => {
      useSessionsStore.setState({
        sessions: [],
        activeSessionId: null,
        pendingApprovals: [],
        currentApprovalIndex: 0,
      });
      if (isTauriRuntime()) {
        await invoke("test_reset_sessions");
      }
    },

    isTauriRuntime,
    simulateEvent,

    // ── New: Batch / Store Direct Access ──
    setSessions: (sessions) => {
      useSessionsStore.setState({ sessions, activeSessionId: sessions[0]?.id ?? null });
    },
    updateSession: (id, updates) => {
      useSessionsStore.getState().updateSessionInfo(id, updates);
    },
    setSessionField: (id, field, value) => {
      useSessionsStore.getState().updateSessionInfo(id, { [field]: value } as Partial<Session>);
    },
    setConfigField: (path, value) => {
      const current = useConfigStore.getState().config;
      // Deep-set by path
      let obj: Record<string, unknown> = current as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]] as Record<string, unknown>;
      }
      obj[path[path.length - 1]] = value;
      useConfigStore.setState({ config: { ...current } });
    },
    getSessionCount: () => useSessionsStore.getState().sessions.length,

    // ── New: Tool Lifecycle ──
    simulateToolUse: (sessionId, toolName, toolInput) => {
      const store = useSessionsStore.getState();
      const input = toolInput ?? {};
      store.updateSessionInfo(sessionId, {
        state: "running",
        toolName,
        filePath: (input.file_path as string) || (input.filePath as string) || undefined,
        currentTool: { name: toolName, input, startTime: Date.now() },
      });
    },
    simulateToolComplete: (sessionId, toolName, durationMs) => {
      const store = useSessionsStore.getState();
      const session = store.sessions.find((s) => s.id === sessionId);
      if (session?.currentTool) {
        store.addToolExecution(sessionId, {
          id: `tool-${Date.now()}`,
          toolName: toolName || session.currentTool.name,
          input: session.currentTool.input,
          duration: durationMs,
          timestamp: Date.now(),
          status: "success",
        });
      }
      store.updateSessionInfo(sessionId, {
        toolName: undefined,
        filePath: undefined,
        currentTool: undefined,
      });
    },
    simulateToolError: (sessionId, toolName, error) => {
      const store = useSessionsStore.getState();
      store.updateSessionInfo(sessionId, {
        state: "completed",
        lastError: error,
      });
      store.addToolExecution(sessionId, {
        id: `tool-${Date.now()}`,
        toolName,
        input: {},
        error,
        timestamp: Date.now(),
        status: "failed",
      });
      store.updateSessionInfo(sessionId, {
        toolName: undefined,
        filePath: undefined,
        currentTool: undefined,
      });
    },

    // ── New: Layout Measurement ──
    getElementRect: (selector) => Promise.resolve((() => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, left: rect.left };
    })()),
    getElementStyles: (selector, props) => Promise.resolve((() => {
      const el = document.querySelector(selector);
      if (!el) return {};
      const cs = getComputedStyle(el);
      const result: Record<string, string> = {};
      for (const p of props) result[p] = cs.getPropertyValue(p).trim();
      return result;
    })()),
    getElementCount: (selector) => Promise.resolve(document.querySelectorAll(selector).length),
    getTextContents: (selector) => Promise.resolve(
      Array.from(document.querySelectorAll(selector)).map((el) => el.textContent ?? "")
    ),

    // ── New: Config / Store injection ──
    setDensity: (mode) => {
      useConfigStore.setState({
        config: { ...useConfigStore.getState().config, ui: { ...useConfigStore.getState().config.ui, density: mode } },
      });
    },
    setGroupBy: (mode) => {
      // Trigger the overlay's internal groupBy select by setting the store
      // We dispatch a custom event that the test spec handles
      window.dispatchEvent(new CustomEvent("vibe:setGroupBy", { detail: mode }));
    },
    setSortBy: (mode) => {
      window.dispatchEvent(new CustomEvent("vibe:setSortBy", { detail: mode }));
    },
    setStateIndicator: (kind) => {
      useConfigStore.setState({
        config: { ...useConfigStore.getState().config, ui: { ...useConfigStore.getState().config.ui, stateIndicator: kind as StateIndicatorKind } },
      });
    },
  };
}

declare global {
  interface Window {
    __VIBE_TEST_BRIDGE__?: VibeTestBridge;
    __TAURI_INTERNALS__?: unknown;
  }
}
