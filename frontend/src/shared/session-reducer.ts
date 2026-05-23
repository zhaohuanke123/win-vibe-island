// Session Reducer — Frontend mirror of Rust SessionState::apply()
//
// Pure function: (sessions, event) → sessions
// All session creation/update/completion logic centralized here.
// Design per docs/open-island-alignment-prd.md §1.2

import type { Session, UIPhase, NotifKind, ToolExecution } from "../store/sessions";
import type { AgentType } from "./agents";

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
  | "qoder"
  | "factory"
  | "unknown";

const AGENT_TOOL_MAP: Record<string, AgentType> = {
  claudeCode: 'claude',
  codex: 'codex',
  openCode: 'opencode',
  cursor: 'cursor',
  geminiCli: 'gemini',
  kimiCli: 'kimi',
  qwenCode: 'qwen',
  codeBuddy: 'codebuddy',
  qoder: 'qoder',
  factory: 'factory',
};

function agentTypeFromTool(tool: AgentTool): AgentType {
  return AGENT_TOOL_MAP[tool] ?? 'claude';
}

export type SessionPhase =
  | "running"
  | "waitingForApproval"
  | "waitingForAnswer"
  | "completed";

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
  prompt?: string;
  title?: string;
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
  options?: Array<{ label: string; description?: string; preview?: string }>;
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
  // ── v2 语义字段（对齐 Rust JumpTarget + Open Island）──
  /** 终端应用名，如 "WindowsTerminal", "VSCode", "Cursor" */
  terminalApp?: string;
  /** 工作区文件夹名（从 CWD 提取） */
  workspaceName?: string;
  /** pane/tab 标题（用于标题匹配） */
  paneTitle?: string;
  /** 完整 CWD 路径 */
  workingDirectory?: string;
  /** 终端 session/tab ID（Windows Terminal tab index 等） */
  terminalSessionId?: string;

  // ── Windows 平台扩展 ──
  /** 进程 PID（Windows 特有） */
  pid?: number;
  /** Windows Terminal tab index */
  terminalTabIndex?: number;
  /** Windows Terminal tab ID（GUID） */
  terminalTabId?: string;

  // ── 扩展字段（向前兼容）──
  /** 类型特定元数据 */
  extra?: Record<string, unknown>;
}

// ─── Tagged union (matches Rust #[serde(tag = "type")]) ─────────────────────
//
// Rust 使用 #[serde(tag = "type")] 内部标记格式，payload 字段平铺在与 type 同级。
// 前端类型必须匹配这个平铺结构。

export type AgentEvent =
  | (SessionStartedPayload & { type: "sessionStarted" })
  | (ActivityUpdatedPayload & { type: "activityUpdated" })
  | (PermissionRequestPayload & { type: "permissionRequested" })
  | (QuestionAskedPayload & { type: "questionAsked" })
  | (SessionCompletedPayload & { type: "sessionCompleted" })
  | (ToolUseStartedPayload & { type: "toolUseStarted" })
  | (ToolUseCompletedPayload & { type: "toolUseCompleted" })
  | (JumpTargetPayload & { type: "jumpTargetUpdated" })
  | (ErrorOccurredPayload & { type: "errorOccurred" });

// ─── Phase → UIPhase mapping ─────────────────────────────────────────────

const PHASE_TO_STATE: Record<SessionPhase, UIPhase> = {
  running: "running",
  waitingForApproval: "waitingForApproval",
  waitingForAnswer: "waitingForAnswer",
  completed: "completed",
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
      return applySessionStarted(state, event);
    case "activityUpdated":
      return applyActivityUpdated(state, event);
    case "permissionRequested":
      return applyPermissionRequested(state, event);
    case "questionAsked":
      return applyQuestionAsked(state, event);
    case "sessionCompleted":
      return applySessionCompleted(state, event);
    case "toolUseStarted":
      return applyToolUseStarted(state, event);
    case "toolUseCompleted":
      return applyToolUseCompleted(state, event);
    case "jumpTargetUpdated":
      return applyJumpTargetUpdated(state, event);
    case "errorOccurred":
      return applyErrorOccurred(state, event);
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
              state: "idle" as UIPhase,
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
    agent: agentTypeFromTool(p.agent),
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
            ...(p.prompt ? { lastPrompt: p.prompt } : {}),
            ...(p.title ? { title: p.title } : {}),
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
  // Determine 2-way vs 3-way based on whether the tool input suggests
  // multiple options (e.g. Bash with allow-always vs just allow/deny).
  // Default to 'two' unless we detect 3+ distinct action choices.
  const notifKind: NotifKind = "two";
  return {
    sessions: newState.sessions.map((s) =>
      s.id === p.sessionId
        ? {
            ...s,
            state: "waitingForApproval" as UIPhase,
            lastActivity: p.timestamp,
            toolName: p.toolName,
            notifKind,
            currentTool: p.toolName ? {
              name: p.toolName,
              input: p.toolInput ?? {},
              startTime: p.timestamp,
            } : s.currentTool,
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
            state: "waitingForAnswer" as UIPhase,
            lastActivity: p.timestamp,
            notifKind: "jump" as NotifKind,
            currentTool: {
              name: "question",
              input: {
                question: p.questionText,
                options: p.options ?? [],
              },
              startTime: p.timestamp,
            },
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
            state: "completed" as UIPhase,
            lastActivity: p.timestamp,
            notifKind: "done" as NotifKind,
            ...(p.summary ? { toolName: p.summary } : {}),
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
            state: "running" as UIPhase,
            lastActivity: p.timestamp,
            toolName: p.toolName,
            filePath: p.toolInput?.file_path as string | undefined,
            notifKind: undefined,
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
        ...(p.error ? { lastError: p.error, state: "completed" as UIPhase } : {}),
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
            jumpTarget: p.jumpTarget,
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
            state: "completed" as UIPhase,
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
