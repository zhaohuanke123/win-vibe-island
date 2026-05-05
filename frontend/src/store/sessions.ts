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
  title?: string;
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

  // 用户自定义分组标签
  tag?: string;
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
  toolInput?: Record<string, unknown>;
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
  pendingApprovals: ApprovalRequest[];
  currentApprovalIndex: number;
  hookServerStatus: HookServerStatus;
  errorLogs: string[];
  groups: string[];

  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionState: (id: string, state: AgentState) => void;
  updateSessionInfo: (id: string, info: Partial<Session>) => void;
  setActiveSession: (id: string | null) => void;
  addPendingApproval: (request: ApprovalRequest) => void;
  removeCurrentApproval: () => void;
  removeApprovalByToolUseId: (toolUseId: string) => void;
  removeApprovalsBySessionId: (sessionId: string) => void;
  setCurrentApprovalIndex: (index: number) => void;
  // Deprecated: use addPendingApproval instead
  setApprovalRequest: (request: ApprovalRequest | null) => void;
  clearApprovalRequest: () => void;
  setHookServerStatus: (status: Partial<HookServerStatus>) => void;
  addErrorLog: (error: string) => void;
  clearErrorLogs: () => void;
  addToolExecution: (sessionId: string, execution: ToolExecution) => void;
  updateToolExecution: (sessionId: string, executionId: string, update: Partial<ToolExecution>) => void;
  renameSession: (id: string, label: string) => void;
  setSessionTag: (id: string, tag?: string) => void;
  createGroup: (name: string) => void;
  deleteGroup: (name: string) => void;
  renameGroup: (oldName: string, newName: string) => void;
}

export const useSessionsStore = create<SessionsStore>((set, _get) => ({
  sessions: [],
  activeSessionId: null,
  pendingApprovals: [],
  currentApprovalIndex: 0,
  hookServerStatus: {
    connectionState: "unknown",
    port: useConfigStore.getState().getHookServerPort(),
  },
  errorLogs: [],
  groups: [],

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

  addPendingApproval: (request) =>
    set((s) => {
      // Deduplicate by toolUseId
      if (s.pendingApprovals.some((a) => a.toolUseId === request.toolUseId)) {
        return s;
      }
      return {
        pendingApprovals: [...s.pendingApprovals, request],
      };
    }),

  removeCurrentApproval: () =>
    set((s) => {
      if (s.pendingApprovals.length === 0) return s;
      const newApprovals = s.pendingApprovals.filter((_, i) => i !== s.currentApprovalIndex);
      let newIndex = 0;
      if (newApprovals.length > 0) {
        // If we removed the last item, go back; otherwise stay at same index
        newIndex = Math.min(s.currentApprovalIndex, newApprovals.length - 1);
      }
      return {
        pendingApprovals: newApprovals,
        currentApprovalIndex: newIndex,
      };
    }),

  removeApprovalByToolUseId: (toolUseId) =>
    set((s) => {
      const idx = s.pendingApprovals.findIndex((a) => a.toolUseId === toolUseId);
      if (idx === -1) return s;
      const newApprovals = s.pendingApprovals.filter((_, i) => i !== idx);
      let newIndex = s.currentApprovalIndex;
      if (newApprovals.length === 0) {
        newIndex = 0;
      } else if (idx < s.currentApprovalIndex) {
        newIndex = s.currentApprovalIndex - 1;
      } else if (idx === s.currentApprovalIndex) {
        newIndex = Math.min(s.currentApprovalIndex, newApprovals.length - 1);
      }
      return {
        pendingApprovals: newApprovals,
        currentApprovalIndex: newIndex,
      };
    }),

  removeApprovalsBySessionId: (sessionId) =>
    set((s) => {
      const newApprovals = s.pendingApprovals.filter((a) => a.sessionId !== sessionId);
      if (newApprovals.length === s.pendingApprovals.length) return s;
      let newIndex = 0;
      if (newApprovals.length > 0) {
        newIndex = Math.min(s.currentApprovalIndex, newApprovals.length - 1);
      }
      return {
        pendingApprovals: newApprovals,
        currentApprovalIndex: newIndex,
      };
    }),

  setCurrentApprovalIndex: (index) => set({ currentApprovalIndex: index }),

  // Deprecated: use addPendingApproval instead
  setApprovalRequest: (request) =>
    set((s) => {
      if (request === null) {
        return { pendingApprovals: [], currentApprovalIndex: 0 };
      }
      if (s.pendingApprovals.some((a) => a.toolUseId === request.toolUseId)) {
        return s;
      }
      return {
        pendingApprovals: [...s.pendingApprovals, request],
      };
    }),

  clearApprovalRequest: () => set({ pendingApprovals: [], currentApprovalIndex: 0 }),

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

  renameSession: (id, label) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === id ? { ...ses, label, title: label } : ses
      ),
    })),

  setSessionTag: (id, tag) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === id ? { ...ses, tag } : ses
      ),
    })),

  createGroup: (name) =>
    set((s) => {
      if (s.groups.includes(name)) return s;
      return { groups: [...s.groups, name] };
    }),

  deleteGroup: (name) =>
    set((s) => ({
      groups: s.groups.filter((g) => g !== name),
      sessions: s.sessions.map((ses) =>
        ses.tag === name ? { ...ses, tag: undefined } : ses
      ),
    })),

  renameGroup: (oldName, newName) =>
    set((s) => ({
      groups: s.groups.map((g) => (g === oldName ? newName : g)),
      sessions: s.sessions.map((ses) =>
        ses.tag === oldName ? { ...ses, tag: newName } : ses
      ),
    })),
}));
