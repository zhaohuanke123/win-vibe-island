// Session Reducer — Frontend mirror of Rust SessionState::apply()
//
// Pure function: (sessions, event) → sessions
// All session creation/update/completion logic centralized here.
// Design per docs/open-island-alignment-prd.md §1.2

import type { Session, AgentState, ToolExecution } from "../store/sessions";

// ─── AgentEvent types (mirrors Rust agent_event.rs) ─────────────────────────

/** Discriminant tag for the tagged union. */
export type AgentEventType =
  | "sessionStarted"
  | "activityUpdated"
  | "permissionRequested"
  | "questionAsked"
  | "sessionCompleted"
  | "toolUseStarted"
  | "toolUseCompleted"
  | "jumpTargetUpdated"
  | "errorOccurred";

/** Agent identifier (mirrors Rust AgentTool enum). */
export type AgentTool =
  | "claudeCode"
  | "codex"
  | "openCode"
  | "cursor"
  | "geminiCli"
  | "kimiCli"
  | "qwenCode"
  | "codeBuddy"
  | "unknown";

export type SessionPhase =
  | "running"
  | "thinking"
  | "idle"
  | "requiresAttention"
  | "completed"
  | "error";

// ─── Payload types ──────────────────────────────────────────────────────────

export interface SessionStartedPayload {
  sessionId: string;
  title: string;
  agent: AgentTool;
  cwd?: string;
  model?: string;
  origin?: string;
  jumpTarget?: JumpTarget;
  timestamp: number;
  isRemote?: boolean;
}

export interface ActivityUpdatedPayload {
  sessionId: string;
  summary: string;
  phase: SessionPhase;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  timestamp: number;
}

export interface PermissionRequestPayload {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description?: string;
  risk?: string;
  timestamp: number;
}

export interface QuestionAskedPayload {
  sessionId: string;
  questionText: string;
  options?: string[];
  timestamp: number;
}

export interface SessionCompletedPayload {
  sessionId: string;
  summary: string;
  timestamp: number;
  isSessionEnd?: boolean;
  isInterrupt?: boolean;
}

export interface ToolUseStartedPayload {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: number;
}

export interface ToolUseCompletedPayload {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  success: boolean;
  error?: string;
  durationMs?: number;
  timestamp: number;
}

export interface JumpTargetPayload {
  sessionId: string;
  jumpTarget: JumpTarget;
  timestamp: number;
}

export interface ErrorOccurredPayload {
  sessionId: string;
  errorType: string;
  message: string;
  timestamp: number;
}

export interface JumpTarget {
  terminalType?: string;
  pid?: number;
  workspacePath?: string;
  windowTitle?: string;
  extra?: Record<string, unknown>;
}

// ─── Tagged union (matches Rust #[serde(tag = "type")]) ─────────────────────

export type AgentEvent =
  | { type: "sessionStarted"; sessionStarted: SessionStartedPayload }
  | { type: "activityUpdated"; activityUpdated: ActivityUpdatedPayload }
  | { type: "permissionRequested"; permissionRequested: PermissionRequestPayload }
  | { type: "questionAsked"; questionAsked: QuestionAskedPayload }
  | { type: "sessionCompleted"; sessionCompleted: SessionCompletedPayload }
  | { type: "toolUseStarted"; toolUseStarted: ToolUseStartedPayload }
  | { type: "toolUseCompleted"; toolUseCompleted: ToolUseCompletedPayload }
  | { type: "jumpTargetUpdated"; jumpTargetUpdated: JumpTargetPayload }
  | { type: "errorOccurred"; errorOccurred: ErrorOccurredPayload };

// ─── Phase → AgentState mapping ─────────────────────────────────────────────

const PHASE_TO_STATE: Record<SessionPhase, AgentState> = {
  idle: "idle",
  thinking: "thinking",
  running: "running",
  requiresAttention: "approval",
  completed: "done",
  error: "error",
};

// ─── Reducer ────────────────────────────────────────────────────────────────

export interface SessionReducerState {
  sessions: Session[];
}

const MAX_TOOL_HISTORY = 20;

/**
 * Pure reducer: apply an AgentEvent to the session list.
 * Mirrors the Rust `SessionState::apply()` logic.
 */
export function sessionReducer(
  state: SessionReducerState,
  event: AgentEvent
): SessionReducerState {
  switch (event.type) {
    case "sessionStarted":
      return applySessionStarted(state, event.sessionStarted);
    case "activityUpdated":
      return applyActivityUpdated(state, event.activityUpdated);
    case "permissionRequested":
      return applyPermissionRequested(state, event.permissionRequested);
    case "questionAsked":
      return applyQuestionAsked(state, event.questionAsked);
    case "sessionCompleted":
      return applySessionCompleted(state, event.sessionCompleted);
    case "toolUseStarted":
      return applyToolUseStarted(state, event.toolUseStarted);
    case "toolUseCompleted":
      return applyToolUseCompleted(state, event.toolUseCompleted);
    case "jumpTargetUpdated":
      return applyJumpTargetUpdated(state, event.jumpTargetUpdated);
    case "errorOccurred":
      return applyErrorOccurred(state, event.errorOccurred);
    default:
      return state;
  }
}

// ─── Per-variant handlers ───────────────────────────────────────────────────

function applySessionStarted(
  state: SessionReducerState,
  p: SessionStartedPayload
): SessionReducerState {
  const existing = state.sessions.find((s) => s.id === p.sessionId);
  if (existing) {
    // Resume — update existing session
    return {
      sessions: state.sessions.map((s) =>
        s.id === p.sessionId
          ? {
              ...s,
              label: p.title,
              title: p.title,
              cwd: p.cwd ?? s.cwd,
              state: "idle" as AgentState,
              model: p.model,
              source: p.origin,
              lastActivity: p.timestamp,
            }
          : s
      ),
    };
  }
  // New session
  const session: Session = {
    id: p.sessionId,
    label: p.title,
    title: p.title,
    cwd: p.cwd ?? "",
    state: "idle",
    createdAt: p.timestamp,
    lastActivity: p.timestamp,
    toolHistory: [],
    model: p.model,
    source: p.origin,
  };
  return { sessions: [...state.sessions, session] };
}

function applyActivityUpdated(
  state: SessionReducerState,
  p: ActivityUpdatedPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: PHASE_TO_STATE[p.phase] ?? s.state,
            lastActivity: p.timestamp,
            toolName: p.toolName ?? s.toolName,
            ...(p.toolInput ? { filePath: p.toolInput.file_path as string | undefined } : {}),
          }
        : s
    ),
  };
}

function applyPermissionRequested(
  state: SessionReducerState,
  p: PermissionRequestPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: "approval" as AgentState,
            lastActivity: p.timestamp,
            toolName: p.toolName,
          }
        : s
    ),
  };
}

function applyQuestionAsked(
  state: SessionReducerState,
  p: QuestionAskedPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: "approval" as AgentState,
            lastActivity: p.timestamp,
          }
        : s
    ),
  };
}

function applySessionCompleted(
  state: SessionReducerState,
  p: SessionCompletedPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: "done" as AgentState,
            lastActivity: p.timestamp,
            ...(p.isInterrupt ? { lastError: "Session interrupted" } : {}),
          }
        : s
    ),
  };
}

function applyToolUseStarted(
  state: SessionReducerState,
  p: ToolUseStartedPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: "running" as AgentState,
            lastActivity: p.timestamp,
            toolName: p.toolName,
            filePath: p.toolInput?.file_path as string | undefined,
            currentTool: {
              name: p.toolName,
              input: p.toolInput,
              startTime: p.timestamp,
            },
          }
        : s
    ),
  };
}

function applyToolUseCompleted(
  state: SessionReducerState,
  p: ToolUseCompletedPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) => {
      if (s.id !== p.sessionId) return s;

      // Build tool history entry
      const entry: ToolExecution = {
        id: p.toolUseId,
        toolName: p.toolName,
        input: {},
        duration: p.durationMs,
        error: p.error,
        timestamp: p.timestamp,
        status: p.success ? "success" : "failed",
      };

      const toolHistory = [...s.toolHistory, entry].slice(-MAX_TOOL_HISTORY);

      // Clear current tool if ids match
      const currentTool =
        s.currentTool?.name === p.toolName ? undefined : s.currentTool;

      return {
        ...s,
        lastActivity: p.timestamp,
        currentTool,
        toolHistory,
        toolName: undefined,
        filePath: undefined,
        ...(p.error ? { lastError: p.error, state: "error" as AgentState } : {}),
      };
    }),
  };
}

function applyJumpTargetUpdated(
  state: SessionReducerState,
  p: JumpTargetPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            lastActivity: p.timestamp,
            pid: p.jumpTarget.pid ?? s.pid,
          }
        : s
    ),
  };
}

function applyErrorOccurred(
  state: SessionReducerState,
  p: ErrorOccurredPayload
): SessionReducerState {
  const newState = ensureSession(state, p.sessionId, p.timestamp);
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: "error" as AgentState,
            lastError: p.message,
            lastActivity: p.timestamp,
          }
        : s
    ),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Ensure a session exists, creating a minimal one if not (defensive —
 * events may arrive before SessionStarted).
 */
function ensureSession(
  state: SessionReducerState,
  sessionId: string,
  timestamp: number
): SessionReducerState {
  if (state.sessions.some((s) => s.id === sessionId)) return state;

  const session: Session = {
    id: sessionId,
    label: labelFromId(sessionId),
    cwd: "",
    state: "idle",
    createdAt: timestamp,
    lastActivity: timestamp,
    toolHistory: [],
  };
  return { sessions: [...state.sessions, session] };
}

function labelFromId(id: string): string {
  if (id.includes("/") || id.includes("\\")) {
    const parts = id.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? id;
  }
  return `session-${id.slice(0, 8)}`;
}
