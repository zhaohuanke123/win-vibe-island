import { create } from "zustand";

export type AgentState = "idle" | "running" | "approval" | "done";

export interface Session {
  id: string;
  label: string;
  state: AgentState;
  pid?: number;
}

interface SessionsStore {
  sessions: Session[];
  activeSessionId: string | null;

  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSessionState: (id: string, state: AgentState) => void;
  setActiveSession: (id: string | null) => void;
}

export const useSessionsStore = create<SessionsStore>((set) => ({
  sessions: [],
  activeSessionId: null,

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
}));
