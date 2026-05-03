import { create } from "zustand";
import { useConfigStore } from "./config";

export type AgentState = "idle" | "thinking" | "running" | "streaming" | "approval" | "error" | "done";

export type HookConnectionState = "connected" | "disconnected" | "error" | "unknown";

// Approval type for different request types
export type ApprovalType = "permission" | "question" | "plan";

// Approval type constants for consistent usage across frontend
export const APPROVAL_TYPES = {
  PERMISSION: "permission" as ApprovalType,
  QUESTION: "question" as ApprovalType,
  PLAN: "plan" as ApprovalType,
} as const;

// Question option for AskUserQuestion tool
export interface QuestionOption {
  label: string;
  description?: string;
  preview?: string;
}

// Question for AskUserQuestion tool
export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  outputSummary?: string;
  duration?: number;
  error?: string;
  timestamp: number;
  status: "pending" | "running" | "success" | "failed";
}

export interface Session {
  id: string;
  label: string;
  cwd: string;
  state: AgentState;
  pid?: number;
  createdAt: number;
  lastActivity: number;

  // 当前工具信息
  currentTool?: {
    name: string;
    input: Record<string, unknown>;
    startTime: number;
  };

  // 显示用的工具名称和文件路径
  toolName?: string;
  filePath?: string;

  // 工具历史（最近 20 条）
  toolHistory: ToolExecution[];

  // 错误信息
  lastError?: string;

  // Model 信息
  model?: string;
  source?: string;
}

export interface DiffData {
  fileName: string;
  oldContent: string;
  newContent: string;
}

export interface ApprovalRequest {
  toolUseId: string;
  sessionId: string;
  sessionLabel: string;
  approvalType: ApprovalType;
  timestamp: number;

  // Permission request fields (existing)
  toolName?: string;
  action?: string;
  riskLevel?: "low" | "medium" | "high";
  diff?: DiffData;

  // Question fields - for AskUserQuestion tool
  questions?: Question[];

  // Plan fields - for ExitPlanMode tool
  planContent?: string;
}

export interface HookServerStatus {
  connectionState: HookConnectionState;
  port: number;
  lastHeartbeat?: number;
  error?: string;
  // 新增：来自 /hooks/health 的详细信息
  requestCount?: number;
  uptime?: number;
  pendingApprovals?: number;
}

interface SessionsStore {
  sessions: Session[];
  activeSessionId: string | null;
  approvalRequest: ApprovalRequest | null;
  hookServerStatus: HookServerStatus;
  errorLogs: string[];

  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionState: (id: string, state: AgentState) => void;
  updateSessionInfo: (id: string, info: Partial<Session>) => void;
  setActiveSession: (id: string | null) => void;
  setApprovalRequest: (request: ApprovalRequest | null) => void;
  clearApprovalRequest: () => void;
  setHookServerStatus: (status: Partial<HookServerStatus>) => void;
  addErrorLog: (error: string) => void;
  clearErrorLogs: () => void;
  addToolExecution: (sessionId: string, execution: ToolExecution) => void;
  updateToolExecution: (sessionId: string, executionId: string, update: Partial<ToolExecution>) => void;
}

export const useSessionsStore = create<SessionsStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  approvalRequest: null,
  hookServerStatus: {
    connectionState: "unknown",
    port: useConfigStore.getState().getHookServerPort(),
  },
  errorLogs: [],

  addSession: (session) =>
    set((s) => ({
      sessions: [...s.sessions, {
        ...session,
        createdAt: session.createdAt || Date.now(),
        lastActivity: session.lastActivity || Date.now(),
        cwd: session.cwd || "",
        toolHistory: session.toolHistory || [],
      }]
    })),

  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((ses) => ses.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),

  updateSessionState: (id, state) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === id ? { ...ses, state, lastActivity: Date.now() } : ses
      ),
    })),

  updateSessionInfo: (id, info) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === id ? { ...ses, ...info, lastActivity: Date.now() } : ses
      ),
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  setApprovalRequest: (request) => set({ approvalRequest: request }),

  clearApprovalRequest: () => set({ approvalRequest: null }),

  setHookServerStatus: (status) =>
    set((s) => ({
      hookServerStatus: { ...s.hookServerStatus, ...status },
    })),

  addErrorLog: (error) =>
    set((s) => ({
      errorLogs: [...s.errorLogs.slice(-50), `[${new Date().toISOString()}] ${error}`],
    })),

  clearErrorLogs: () => set({ errorLogs: [] }),

  addToolExecution: (sessionId, execution) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === sessionId
          ? { ...ses, toolHistory: [...ses.toolHistory.slice(-19), execution] }
          : ses
      ),
    })),

  updateToolExecution: (sessionId, executionId, update) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === sessionId
          ? {
              ...ses,
              toolHistory: ses.toolHistory.map((e) =>
                e.id === executionId ? { ...e, ...update } : e
              ),
            }
          : ses
      ),
    })),
}));