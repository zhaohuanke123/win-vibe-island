import { create } from "zustand";

export type AgentState = "idle" | "running" | "approval" | "done";

export interface Session {
  id: string;
  label: string;
  state: AgentState;
  pid?: number;
  // Additional task info
  toolName?: string;
  filePath?: string;
  lastActivity?: number;
}

export interface DiffData {
  fileName: string;
  oldContent: string;
  newContent: string;
}

export interface ApprovalRequest {
  sessionId: string;
  sessionLabel: string;
  action: string;
  riskLevel: "low" | "medium" | "high";
  timestamp: number;
  diff?: DiffData;
}

interface SessionsStore {
  sessions: Session[];
  activeSessionId: string | null;
  approvalRequest: ApprovalRequest | null;

  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionState: (id: string, state: AgentState) => void;
  updateSessionInfo: (id: string, info: Partial<Session>) => void;
  setActiveSession: (id: string | null) => void;
  setApprovalRequest: (request: ApprovalRequest | null) => void;
  clearApprovalRequest: () => void;
}

export const useSessionsStore = create<SessionsStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  approvalRequest: null,

  addSession: (session) =>
    set((s) => ({ sessions: [...s.sessions, session] })),

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
}));
