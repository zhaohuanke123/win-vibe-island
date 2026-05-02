import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useSessionsStore } from "../store/sessions";
import type { AgentState } from "../store/sessions";
import { APPROVAL_TYPES } from "../store/sessions";

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
  tool_response?: Record<string, unknown>;
}

interface ToolErrorEvent {
  session_id: string;
  tool_name?: string;
  error?: string;
  duration_ms?: number;
  is_interrupt?: boolean;
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
  approval_type?: "permission" | "question" | "plan";
  action?: string;
  risk_level?: "low" | "medium" | "high";
  diff?: {
    fileName: string;
    filePath: string;
    oldContent: string;
    newContent: string;
  };
  permission_suggestions?: Record<string, unknown>[];
  // Question fields for AskUserQuestion
  questions?: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description?: string;
      preview?: string;
    }>;
    multiSelect: boolean;
  }>;
  // Plan fields for ExitPlanMode
  plan_content?: string;
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
            cwd: cwd || "",
            state: "idle" as AgentState,
            pid,
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
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
        const { session_id, state, tool_name, tool_input, message } = event.payload;
        // Valid states including new ones: thinking, streaming, error
        const validStates = ["idle", "thinking", "running", "streaming", "approval", "error", "done"];
        const validState = validStates.includes(state)
          ? state as AgentState
          : "idle";

        // Create session if it doesn't exist
        const existingSession = useSessionsStore.getState().sessions.find(s => s.id === session_id);
        if (!existingSession) {
          addSession({
            id: session_id,
            label: "Claude Code",
            cwd: "",
            state: validState,
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
          });
        } else {
          updateSessionState(session_id, validState);
        }

        // If tool info is provided, update that too
        if (tool_name) {
          const filePath = tool_input?.file_path as string | undefined;
          updateSessionInfo(session_id, { toolName: tool_name, filePath });
        }

        // If error message is provided, update lastError
        if (state === "error" && message) {
          updateSessionInfo(session_id, { lastError: message });
        }
      });
      unlisteners.push(unlistenState);

      // Listen for tool_use events (from PreToolUse hook)
      const unlistenToolUse = await listen<ToolUseEvent>("tool_use", (event) => {
        const { session_id, tool_name, file_path } = event.payload;

        // Create session if it doesn't exist
        const existingSession = useSessionsStore.getState().sessions.find(s => s.id === session_id);
        if (!existingSession) {
          addSession({
            id: session_id,
            label: "Claude Code",
            cwd: "",
            state: "thinking",
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
          });
        }

        // Update with current tool info and set state to thinking
        updateSessionInfo(session_id, {
          state: "thinking",
          toolName: tool_name,
          filePath: file_path,
          currentTool: {
            name: tool_name,
            input: {},
            startTime: Date.now(),
          },
        });
      });
      unlisteners.push(unlistenToolUse);

      // Listen for tool_complete events (from PostToolUse hook)
      const unlistenToolComplete = await listen<ToolCompleteEvent>("tool_complete", (event) => {
        const { session_id, tool_name, duration_ms } = event.payload;
        // Tool completed, add to tool history
        if (tool_name && duration_ms) {
          const session = useSessionsStore.getState().sessions.find(s => s.id === session_id);
          if (session?.currentTool) {
            // Complete the current tool execution
            const execution = {
              id: `tool-${Date.now()}`,
              toolName: tool_name,
              input: session.currentTool.input,
              duration: duration_ms,
              timestamp: Date.now(),
              status: "success" as const,
            };
            useSessionsStore.getState().addToolExecution(session_id, execution);
          }
        }
        // Clear current tool info
        updateSessionInfo(session_id, {
          toolName: undefined,
          filePath: undefined,
          currentTool: undefined,
        });
      });
      unlisteners.push(unlistenToolComplete);

      // Listen for tool_error events (from PostToolUseFailure hook)
      const unlistenToolError = await listen<ToolErrorEvent>("tool_error", (event) => {
        const { session_id, tool_name, error, duration_ms } = event.payload;
        // Tool failed, add to tool history with error
        if (tool_name) {
          const execution = {
            id: `tool-${Date.now()}`,
            toolName: tool_name,
            input: {},
            duration: duration_ms,
            error: error,
            timestamp: Date.now(),
            status: "failed" as const,
          };
          useSessionsStore.getState().addToolExecution(session_id, execution);
        }
        // Update session with error info
        updateSessionInfo(session_id, {
          toolName: undefined,
          filePath: undefined,
          currentTool: undefined,
          lastError: error,
        });
      });
      unlisteners.push(unlistenToolError);

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
              approvalType: APPROVAL_TYPES.PERMISSION,
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
        const { session_id, tool_use_id, tool_name, approval_type, action, risk_level, diff, questions, plan_content } = event.payload;
        console.log("[useAgentEvents] Permission request received:", {
          session_id,
          tool_use_id,
          tool_name,
          approval_type,
          action,
          risk_level,
          questions,
          plan_content,
          fullPayload: event.payload
        });
        const session = useSessionsStore.getState().sessions.find(s => s.id === session_id);

        updateSessionState(session_id, "approval");

        const approvalRequest = {
          toolUseId: tool_use_id,
          sessionId: session_id,
          sessionLabel: session?.label || "Claude Code",
          approvalType: approval_type || APPROVAL_TYPES.PERMISSION,
          timestamp: Date.now(),
          // Permission fields
          toolName: tool_name,
          action: action,
          riskLevel: risk_level,
          diff: diff ? {
            fileName: diff.fileName,
            oldContent: diff.oldContent,
            newContent: diff.newContent,
          } : undefined,
          // Question fields
          questions: questions,
          // Plan fields
          planContent: plan_content,
        };

        console.log("[useAgentEvents] Setting approval request:", approvalRequest);
        setApprovalRequest(approvalRequest);
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
            cwd: "",
            state: "idle" as AgentState,
            pid: process.pid,
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
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

      // Listen for approval_timeout events
      const unlistenApprovalTimeout = await listen<{ tool_use_id: string; session_id: string }>("approval_timeout", (event) => {
        console.log("[useAgentEvents] Approval timeout:", event.payload);
        // Clear the approval request
        setApprovalRequest(null);
      });
      unlisteners.push(unlistenApprovalTimeout);
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
