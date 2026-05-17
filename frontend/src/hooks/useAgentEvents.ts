import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "../client/logger";
import { useSessionsStore } from "../store/sessions";
import type { UIPhase } from "../store/sessions";
import { APPROVAL_TYPES } from "../store/sessions";
import type { AgentEvent } from "../shared/session-reducer";

interface SessionStartEvent {
  session_id: string;
  label: string;
  cwd?: string;
  source?: string;
  model?: string;
  agent_type?: string;
  detected_agent?: string;
  pid?: number;
  jump_target?: {
    terminalType?: string;
    pid?: number;
    workspacePath?: string;
    windowTitle?: string;
    extra?: Record<string, unknown>;
  };
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
  tool_input?: Record<string, unknown>;
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

// Backward compat: map old state names to new phases
const LEGACY_STATE_MAP: Record<string, UIPhase> = {
  thinking: "running",
  streaming: "running",
  approval: "waitingForApproval",
  error: "completed",
  done: "completed",
};

const VALID_STATES: string[] = ["idle", "running", "waitingForApproval", "waitingForAnswer", "completed"];

function mapState(raw: string): UIPhase {
  const mapped = LEGACY_STATE_MAP[raw] ?? raw;
  return VALID_STATES.includes(mapped) ? (mapped as UIPhase) : "idle";
}

// Helper to normalize Rust AgentTool enum string to frontend agent type
function normalizeAgent(raw: string | undefined | null, fallback = "claude"): string {
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  // Map PascalCase/Title variants to frontend agent keys
  const map: Record<string, string> = {
    claudecode: "claude",
    codex: "codex",
    cursor: "cursor",
    gemini: "gemini",
    kimi: "kimi",
    opencode: "opencode",
    qoder: "qoder",
    qwencode: "qwen",
    factory: "factory",
    codebuddy: "codebuddy",
  };
  return map[lower] || lower || fallback;
}

export function useAgentEvents() {
  const { addSession, removeSession, updateSessionState, updateSessionInfo, addPendingApproval, removeApprovalByToolUseId, removeApprovalsBySessionId } = useSessionsStore();
  const dispatchAgentEvent = useSessionsStore((s) => s.dispatchAgentEvent);
  const markSessionDetached = useSessionsStore((s) => s.markSessionDetached);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for session_start events (from SessionStart hook)
      const unlistenStart = await listen<SessionStartEvent>("session_start", (event) => {
        const { session_id, label, cwd, pid, agent_type, detected_agent, jump_target } = event.payload;

        const jumpTarget = jump_target ? {
          terminalType: jump_target.terminalType,
          pid: jump_target.pid,
          workspacePath: jump_target.workspacePath,
          windowTitle: jump_target.windowTitle,
          extra: jump_target.extra,
        } : undefined;

        // Check if session already exists
        const existingSession = useSessionsStore.getState().sessions.find(s => s.id === session_id);
        if (existingSession) {
          // Session exists, update it — overwrite jumpTarget if new one has terminal type
          updateSessionInfo(session_id, {
            label,
            state: "idle",
            agent: normalizeAgent(agent_type || detected_agent) as any,
            ...(jump_target?.terminalType ? { jumpTarget } : {}),
          });
        } else {
          // Create new session
          addSession({
            id: session_id,
            label: label || (cwd ? extractProjectName(cwd) : "Claude Code"),
            cwd: cwd || "",
            state: "idle" as UIPhase,
            pid: pid ?? undefined,
            agent: normalizeAgent(agent_type || detected_agent) as any,
            jumpTarget,
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
        const { session_id, state, tool_name, tool_input, message, prompt } = event.payload;
        const validState = mapState(state);

        // Create session if it doesn't exist
        const existingSession = useSessionsStore.getState().sessions.find(s => s.id === session_id);
        if (!existingSession) {
          addSession({
            id: session_id,
            label: "Claude Code",
            title: prompt ? truncatePrompt(prompt) : undefined,
            cwd: "",
            state: validState,
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
          });
        } else {
          updateSessionState(session_id, validState);
          // Clear approvals when session leaves waiting states
          const wasWaiting = existingSession.state === "waitingForApproval" || existingSession.state === "waitingForAnswer";
          const isStillWaiting = validState === "waitingForApproval" || validState === "waitingForAnswer";
          if (wasWaiting && !isStillWaiting) {
            removeApprovalsBySessionId(session_id);
          }
          // Set title from first prompt if not already set
          if (validState === "running" && prompt && !existingSession.title) {
            updateSessionInfo(session_id, { title: truncatePrompt(prompt) });
          }
        }

        // If tool info is provided, update that too
        if (tool_name) {
          const filePath = tool_input?.file_path as string | undefined;
          updateSessionInfo(session_id, { toolName: tool_name, filePath });
        }

        // If error message is provided, update lastError
        if (validState === "completed" && message) {
          updateSessionInfo(session_id, { lastError: message });
        }

        // Play notification sound when task completes
        if (validState === "completed") {
          const now = Date.now();
          const lastPlayTime = parseInt(localStorage.getItem("lastSoundPlayTime") || "0");
          const debounceMs = 1000;

          if (now - lastPlayTime > debounceMs) {
            localStorage.setItem("lastSoundPlayTime", now.toString());
            const savedSound = localStorage.getItem("notificationSound") || "hero";
            if (savedSound !== "none") {
              invoke("play_notification_sound", { sound: savedSound }).catch((e) =>
                logger.warn("NOTIFICATION_ERROR", "Failed to play notification sound", { error: String(e) })
              );
            }
          }
        }
      });
      unlisteners.push(unlistenState);

      // Listen for tool_use events (from PreToolUse hook)
      const unlistenToolUse = await listen<ToolUseEvent>("tool_use", (event) => {
        const { session_id, tool_name, file_path, tool_input } = event.payload;

        // Create session if it doesn't exist
        const existingSession = useSessionsStore.getState().sessions.find(s => s.id === session_id);
        if (!existingSession) {
          addSession({
            id: session_id,
            label: "Claude Code",
            cwd: "",
            state: "running",
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
          });
        }

        // Update with current tool info and set state to running
        updateSessionInfo(session_id, {
          state: "running",
          toolName: tool_name,
          filePath: file_path,
          currentTool: {
            name: tool_name,
            input: tool_input || {},
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
          updateSessionState(session_id, "waitingForApproval");
          if (message) {
            addPendingApproval({
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
        const { session_id, tool_use_id, tool_name, tool_input, approval_type, action, risk_level, diff, questions, plan_content } = event.payload;
        const session = useSessionsStore.getState().sessions.find(s => s.id === session_id);

        updateSessionState(session_id, "waitingForApproval");

        const approvalRequest = {
          toolUseId: tool_use_id,
          sessionId: session_id,
          sessionLabel: session?.label || "Claude Code",
          approvalType: approval_type || APPROVAL_TYPES.PERMISSION,
          timestamp: Date.now(),
          // Permission fields
          toolName: tool_name,
          toolInput: tool_input,
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

        addPendingApproval(approvalRequest);
      });
      unlisteners.push(unlistenPermissionRequest);

      // Listen for process_detected events from Process Watcher
      const unlistenProcessDetected = await listen<ProcessDetectedEvent>("process_detected", (event) => {
        const { process } = event.payload;
        if (!process.is_agent || !process.agent_type) return;

        // Try to match this process to an existing hook-tracked session
        const sessions = useSessionsStore.getState().sessions;
        const agentType = normalizeAgent(process.agent_type);
        // Match sessions by agent type that lack a proper jumpTarget (no terminalType),
        // or that have no PID at all
        const match = sessions.find(s =>
          s.agent === agentType
          && !s.id.startsWith("process-")
          && (!s.jumpTarget?.terminalType)
        );

        if (match) {
          // Link PID to the existing hook-tracked session
          useSessionsStore.getState().updateSessionInfo(match.id, {
            pid: process.pid,
            jumpTarget: {
              ...match.jumpTarget,
              pid: process.pid,
            },
          });
          logger.info(`Linked PID ${process.pid} to session ${match.id}`);
        } else {
          // No matching hook session: create auto-detected session as fallback
          addSession({
            id: `process-${process.pid}`,
            label: `${process.agent_type} (PID: ${process.pid})`,
            cwd: "",
            state: "idle" as UIPhase,
            pid: process.pid,
            agent: agentType as any,
            toolHistory: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
          });
        }
      });
      unlisteners.push(unlistenProcessDetected);

      // Listen for process_terminated events
      // Mark sessions matching the PID as detached instead of removing them
      const unlistenProcessTerminated = await listen<ProcessTerminatedEvent>("process_terminated", (event) => {
        const { pid } = event.payload;
        // Mark auto-detected process sessions as detached
        const procSessionId = `process-${pid}`;
        const existingProc = useSessionsStore.getState().sessions.find(s => s.id === procSessionId);
        if (existingProc) {
          markSessionDetached(procSessionId);
        }
        // Also mark any hook-tracked sessions with matching PID
        const sessions = useSessionsStore.getState().sessions;
        for (const ses of sessions) {
          if (ses.pid === pid && !ses.detached) {
            markSessionDetached(ses.id);
          }
        }
      });
      unlisteners.push(unlistenProcessTerminated);

      // Listen for approval_timeout events
      const unlistenApprovalTimeout = await listen<{ tool_use_id: string; session_id: string }>("approval_timeout", (event) => {
        removeApprovalByToolUseId(event.payload.tool_use_id);
      });
      unlisteners.push(unlistenApprovalTimeout);

      // Listen for permission_resolved events (auto-allow)
      const unlistenPermissionResolved = await listen<{ tool_use_id: string; session_id: string; behavior: string }>("permission_resolved", (event) => {
        removeApprovalByToolUseId(event.payload.tool_use_id);
      });
      unlisteners.push(unlistenPermissionResolved);

      // Listen for test_reset event — clear all sessions for testing
      const unlistenTestReset = await listen("test_reset", () => {
        useSessionsStore.setState({
          sessions: [],
          activeSessionId: null,
          pendingApprovals: [],
          currentApprovalIndex: 0,
        });
      });
      unlisteners.push(unlistenTestReset);

      // Listen for unified agent_event (new SessionState path)
      const unlistenAgentEvent = await listen<AgentEvent>("agent_event", (event) => {
        dispatchAgentEvent(event.payload);
      });
      unlisteners.push(unlistenAgentEvent);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addSession, removeSession, updateSessionState, updateSessionInfo, addPendingApproval, removeApprovalByToolUseId, removeApprovalsBySessionId, dispatchAgentEvent, markSessionDetached]);
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

function truncatePrompt(prompt: string, maxLen = 60): string {
  const firstLine = prompt.split("\n")[0].trim();
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen) + "…";
}
