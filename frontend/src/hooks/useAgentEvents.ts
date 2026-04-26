import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useSessionsStore } from "../store/sessions";
import type { AgentState } from "../store/sessions";

interface SessionStartEvent {
  session_id: string;
  label: string;
  cwd?: string;
  source?: string;
  model?: string;
  agent_type?: string;
  pid?: number;
}

interface SessionEndEvent {
  session_id: string;
}

interface StateChangeEvent {
  session_id: string;
  state: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  message?: string;
  prompt?: string;
  reason?: string;
}

interface ToolUseEvent {
  session_id: string;
  tool_name: string;
  file_path?: string;
}

interface ToolCompleteEvent {
  session_id: string;
  tool_name?: string;
  duration_ms?: number;
}

interface NotificationEvent {
  session_id: string;
  message?: string;
  notification_type?: string;
}

// Permission Request event (from PermissionRequest hook)
interface PermissionRequestEvent {
  session_id: string;
  tool_use_id: string;
  tool_name: string;
  tool_input?: Record<string, unknown>;
  action: string;
  risk_level: "low" | "medium" | "high";
  diff?: {
    fileName: string;
    filePath: string;
    oldContent: string;
    newContent: string;
  };
  permission_suggestions?: Record<string, unknown>[];
}

// Process Watcher events
interface ProcessInfo {
  pid: number;
  name: string;
  command_line: string | null;
  detected_at: number;
  is_agent: boolean;
  agent_type: string | null;
}

interface ProcessDetectedEvent {
  process: ProcessInfo;
}

interface ProcessTerminatedEvent {
  pid: number;
  name: string;
  agent_type: string | null;
}

export function useAgentEvents() {
  const { addSession, removeSession, updateSessionState, updateSessionInfo, setApprovalRequest } = useSessionsStore();

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for session_start events (from SessionStart hook)
      const unlistenStart = await listen<SessionStartEvent>("session_start", (event) => {
        const { session_id, label, cwd, pid } = event.payload;

        // Check if session already exists
        const existingSession = useSessionsStore.getState().sessions.find(s => s.id === session_id);
        if (existingSession) {
          // Session exists, just update it
          updateSessionInfo(session_id, { label, state: "idle" });
        } else {
          // Create new session
          addSession({
            id: session_id,
            label: label || (cwd ? extractProjectName(cwd) : "Claude Code"),
            state: "idle" as AgentState,
            pid,
          });
        }
      });
      unlisteners.push(unlistenStart);

      // Listen for session_end events
      const unlistenEnd = await listen<SessionEndEvent>("session_end", (event) => {
        removeSession(event.payload.session_id);
      });
      unlisteners.push(unlistenEnd);

      // Listen for state_change events
      const unlistenState = await listen<StateChangeEvent>("state_change", (event) => {
        const { session_id, state, tool_name, tool_input } = event.payload;
        const validState = ["idle", "running", "approval", "done"].includes(state)
          ? state as AgentState
          : "idle";

        updateSessionState(session_id, validState);

        // If tool info is provided, update that too
        if (tool_name) {
          const filePath = tool_input?.file_path as string | undefined;
          updateSessionInfo(session_id, { toolName: tool_name, filePath });
        }
      });
      unlisteners.push(unlistenState);

      // Listen for tool_use events (from PreToolUse hook)
      const unlistenToolUse = await listen<ToolUseEvent>("tool_use", (event) => {
        const { session_id, tool_name, file_path } = event.payload;
        updateSessionInfo(session_id, {
          state: "running",
          toolName: tool_name,
          filePath: file_path,
        });
      });
      unlisteners.push(unlistenToolUse);

      // Listen for tool_complete events (from PostToolUse hook)
      const unlistenToolComplete = await listen<ToolCompleteEvent>("tool_complete", (event) => {
        const { session_id } = event.payload;
        // Tool completed, but session might still be running
        updateSessionInfo(session_id, {
          toolName: undefined,
          filePath: undefined,
        });
      });
      unlisteners.push(unlistenToolComplete);

      // Listen for notification events
      const unlistenNotification = await listen<NotificationEvent>("notification", (event) => {
        const { session_id, message, notification_type } = event.payload;
        // Handle different notification types
        if (notification_type === "permission_prompt") {
          updateSessionState(session_id, "approval");
          if (message) {
            setApprovalRequest({
              toolUseId: `notification-${Date.now()}`,
              sessionId: session_id,
              sessionLabel: useSessionsStore.getState().sessions.find(s => s.id === session_id)?.label || "Claude Code",
              action: message,
              riskLevel: "medium",
              timestamp: Date.now(),
            });
          }
        }
      });
      unlisteners.push(unlistenNotification);

      // Listen for permission_request events (from PermissionRequest hook)
      const unlistenPermissionRequest = await listen<PermissionRequestEvent>("permission_request", (event) => {
        const { session_id, tool_use_id, tool_name, action, risk_level, diff } = event.payload;
        const session = useSessionsStore.getState().sessions.find(s => s.id === session_id);

        updateSessionState(session_id, "approval");

        setApprovalRequest({
          toolUseId: tool_use_id,
          sessionId: session_id,
          sessionLabel: session?.label || "Claude Code",
          toolName: tool_name,
          action: action,
          riskLevel: risk_level,
          timestamp: Date.now(),
          diff: diff ? {
            fileName: diff.fileName,
            oldContent: diff.oldContent,
            newContent: diff.newContent,
          } : undefined,
        });
      });
      unlisteners.push(unlistenPermissionRequest);

      // Listen for process_detected events from Process Watcher
      const unlistenProcessDetected = await listen<ProcessDetectedEvent>("process_detected", (event) => {
        const { process } = event.payload;
        if (process.is_agent && process.agent_type) {
          const sessionId = `process-${process.pid}`;
          addSession({
            id: sessionId,
            label: `${process.agent_type} (PID: ${process.pid})`,
            state: "idle" as AgentState,
            pid: process.pid,
          });
        }
      });
      unlisteners.push(unlistenProcessDetected);

      // Listen for process_terminated events
      const unlistenProcessTerminated = await listen<ProcessTerminatedEvent>("process_terminated", (event) => {
        const { pid } = event.payload;
        const sessionId = `process-${pid}`;
        removeSession(sessionId);
      });
      unlisteners.push(unlistenProcessTerminated);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addSession, removeSession, updateSessionState, updateSessionInfo, setApprovalRequest]);
}

// Helper to extract project name from cwd path
function extractProjectName(cwd: string): string {
  if (!cwd) return "Claude Code";

  // Normalize path separators
  const normalized = cwd.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  // Return the last non-empty part
  return parts[parts.length - 1] || "Claude Code";
}
