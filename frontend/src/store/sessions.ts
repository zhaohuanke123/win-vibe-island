import { create } from "zustand";

export type AgentState = "idle" | "running" | "approval" | "done";

export interface Session {
  id: string;
  label: string;
  state: AgentState;
  pid?: number;
}

export interface ApprovalRequest {
  sessionId: string;
  sessionLabel: string;
  action: string;
  riskLevel: "low" | "medium" | "high";
  timestamp: number;
}

interface SessionsStore {
  sessions: Session[];
  activeSessionId: string | null;
  approvalRequest: ApprovalRequest | null;

  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionState: (id: string, state: AgentState) => void;
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
        ses.id === id ? { ...ses, state } : ses
      ),
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  setApprovalRequest: (request) => set({ approvalRequest: request }),

  clearApprovalRequest: () => set({ approvalRequest: null }),
}));
